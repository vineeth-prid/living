import { createHmac, timingSafeEqual } from "node:crypto";
import { normalisePhone } from "../phone";
import { isLidId } from "./lid";
import type {
  InboundEvent,
  InboundMedia,
  InboundMessage,
  WhatsAppSessionStatus,
} from "../types";

// Signature verification and translation. Nothing outside this file trusts a
// webhook payload, and nothing inside it touches the database.
//
// OpenWA signs with HMAC-SHA256 and sends `sha256=<hex>` in X-OpenWA-Signature.
// The docs render the header with several capitalisations; HTTP headers are
// case-insensitive and Headers.get() handles that, so the exact spelling in
// their docs is not something to depend on.

const SIGNATURE_HEADER = "x-openwa-signature";
const IDEMPOTENCY_HEADER = "x-openwa-idempotency-key";
const DELIVERY_HEADER = "x-openwa-delivery-id";

/**
 * Constant-time comparison of the delivered signature against one computed
 * over the RAW body.
 *
 * Raw bytes, not a re-serialised object: JSON.stringify of a parsed payload can
 * reorder keys and re-encode unicode, and the signature covers exactly what was
 * sent. Verifying against anything else fails on valid deliveries and — worse —
 * would be tempting to "fix" by skipping the check.
 */
export function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!secret || !header) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  const received = header.trim();

  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length. Compare lengths first and still run the comparison.
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type Envelope = {
  event?: string;
  timestamp?: string;
  sessionId?: string;
  idempotencyKey?: string;
  deliveryId?: string;
  data?: Record<string, unknown>;
};

/**
 * Verify, then translate. Returns `{ rejected }` rather than throwing so the
 * route can log the reason and answer without a stack trace reaching OpenWA.
 */
export function parseOpenWAWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
  /** The session Living is configured against. Anything else is not ours. */
  expectedSessionId?: string,
): InboundEvent | { rejected: string } {
  if (!verifySignature(rawBody, headers.get(SIGNATURE_HEADER), secret)) {
    return { rejected: "invalid signature" };
  }

  let envelope: Envelope;
  try {
    envelope = JSON.parse(rawBody) as Envelope;
  } catch {
    return { rejected: "body is not JSON" };
  }

  const event = typeof envelope.event === "string" ? envelope.event : null;
  if (!event) return { rejected: "no event name" };

  const sessionId = str(envelope.sessionId);

  // OpenWA is multi-session, and a webhook secret can be shared across the
  // sessions on one instance. Without this, a validly signed delivery for
  // somebody else's WhatsApp number would be ingested as Living's own traffic —
  // their customers becoming Living's leads.
  //
  // Lenient when the event carries no session at all (not every event type
  // does), strict whenever it carries one that is not ours.
  if (expectedSessionId && sessionId && sessionId !== expectedSessionId) {
    return { rejected: "event is for a different session" };
  }

  // The key is what stops a retry booking a second follow-up. Without one there
  // is nothing to deduplicate on, so the delivery id or the message id stands
  // in; if none of the three is present the event is refused rather than
  // processed unguarded.
  const idempotencyKey =
    str(envelope.idempotencyKey) ??
    headers.get(IDEMPOTENCY_HEADER) ??
    str(envelope.deliveryId) ??
    headers.get(DELIVERY_HEADER) ??
    str((envelope.data as { id?: unknown } | undefined)?.id);

  if (!idempotencyKey) return { rejected: "no idempotency key" };

  return {
    provider: "openwa",
    idempotencyKey,
    deliveryId: str(envelope.deliveryId) ?? headers.get(DELIVERY_HEADER),
    event,
    providerSessionId: sessionId,
    message: event === "message.received" ? toMessage(envelope.data) : null,
    sessionStatus:
      event === "session.status" ? toSessionStatus(envelope.data) : null,
    raw: envelope,
  };
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * message.received → Living's shape.
 *
 * The documented payload is `{ id, chatId, from, body, type, timestamp }`. The
 * media fields are not documented anywhere reachable, so every plausible
 * spelling is checked and anything missing becomes null — an unrecognised media
 * field costs a photo, not the whole message. Verify against a real delivery
 * before relying on media (see docs/whatsapp.md).
 */
function toMessage(data: Record<string, unknown> | undefined): InboundMessage | null {
  if (!data) return null;

  const providerMessageId =
    str(data.id) ?? str(data.messageId) ?? str(data.waMessageId);
  const chatId = str(data.chatId) ?? str(data.from);
  if (!providerMessageId || !chatId) return null;

  // Engine-specific details live in `metadata`, per OpenWA's message schema —
  // message rows carry no separate media/from_me columns.
  const meta = (data.metadata ?? {}) as Record<string, unknown>;

  // Never act on our own outbound messages echoed back — that is a loop, and a
  // loop on a WhatsApp number is how the number gets banned. Checked three
  // ways because `fromMe` is documented as a metadata field, not a column, and
  // `direction` is the one that is always present.
  if (
    data.fromMe === true ||
    meta.fromMe === true ||
    str(data.direction) === "outgoing"
  ) {
    return null;
  }

  // Sender identity. Three cases, in order of how much they can be trusted:
  //
  //  1. the payload states the number outright — use it;
  //  2. the sender is privacy-masked ("...@lid") — the digits are a pseudo-id,
  //     so carry the mask forward and let the routing step ask the gateway for
  //     the real number. Parsing it here would fabricate a contact;
  //  3. an ordinary "@c.us" id or bare number — normalise as before.
  //
  // The lookup is deliberately not done here: this function runs before the
  // webhook is acknowledged, and a gateway round trip on that path is what
  // turns into a timeout and a redelivery.
  const stated = normalisePhone(
    str(data.senderPhone) ?? str(data.senderNumber) ?? str(meta.senderPhone),
  );
  const maskedId = [str(data.from), chatId, str(data.author)].find(isLidId) ?? null;

  const from = stated ?? (maskedId ? null : normalisePhone(str(data.from) ?? chatId));

  // No number and no mask to resolve one from: a group or a malformed sender.
  if (!from && !maskedId) return null;

  const timestamp = num(data.timestamp);
  const media = toMedia(data, meta);

  return {
    providerMessageId,
    chatId,
    fromPhone: from?.phoneNumber ?? null,
    senderLid: from ? null : maskedId,
    senderName:
      str(data.pushName) ??
      str(data.notifyName) ??
      str(data.senderName) ??
      str(data.chatName) ??
      str(meta.pushName),
    type: str(data.type) ?? (media ? "media" : "text"),
    text: str(data.body) ?? str(data.text) ?? str(data.caption) ?? "",
    media,
    // OpenWA stores message timestamps as epoch seconds (BIGINT). A missing one
    // means now — closer to the truth than 1970.
    sentAt: timestamp ? new Date(timestamp * 1000) : new Date(),
  };
}

/**
 * Media, assembled from whichever fields turned up.
 *
 * `mediaMimetype` and `mediaPath` are the documented column names; the rest are
 * spellings seen in the engine payloads that land in `metadata`. Anything
 * missing degrades to null — an unrecognised field costs a photo, not the
 * message. Confirm against a real delivery before trusting this (docs/whatsapp.md).
 */
function toMedia(
  data: Record<string, unknown>,
  meta: Record<string, unknown>,
): InboundMedia | null {
  const nested = (data.media ?? meta.media ?? {}) as Record<string, unknown>;

  const mimeType =
    str(data.mediaMimetype) ??
    str(data.mimetype) ??
    str(data.mimeType) ??
    str(meta.mimetype) ??
    str(nested.mimetype) ??
    str(nested.mimeType);

  // mediaPath is a storage key on the OpenWA side, not necessarily a URL. A
  // relative one is resolved against the gateway; an absolute one is used as
  // given. The downloader tolerates both and reports a 404 rather than
  // pretending the photo arrived.
  const path =
    str(data.mediaUrl) ??
    str(data.mediaPath) ??
    str(meta.mediaPath) ??
    str(nested.url) ??
    str(data.url);

  const url = path && !/^https?:\/\//i.test(path) ? resolveMediaPath(path) : path;

  // `media.data` is the spelling the gateway actually uses for the inline
  // payload; the documented `base64` ones are kept because a different engine
  // build may use them. Note `nested.data` — never `data.data`, which is the
  // envelope's own body and not a photograph.
  const base64 =
    str(data.mediaBase64) ??
    str(nested.data) ??
    str(nested.base64) ??
    str(meta.base64) ??
    str(meta.data) ??
    str(data.base64);

  if (!mimeType && !url && !base64) return null;

  return {
    mimeType,
    filename: str(data.filename) ?? str(meta.filename) ?? str(nested.filename),
    sizeBytes:
      num(data.size) ?? num(meta.size) ?? num(nested.size) ?? num(nested.fileLength),
    url,
    base64,
  };
}

function resolveMediaPath(path: string): string {
  const base = (process.env.OPENWA_BASE_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}/${path.replace(/^\/+/, "")}` : path;
}

function toSessionStatus(
  data: Record<string, unknown> | undefined,
): WhatsAppSessionStatus {
  const value = (str(data?.status) ?? str(data?.state) ?? "").toLowerCase();
  if (["connected", "authenticated", "ready", "open"].includes(value)) {
    return "connected";
  }
  if (["connecting", "qr", "pairing", "starting"].includes(value)) {
    return "connecting";
  }
  if (["disconnected", "closed", "logged_out", "failed"].includes(value)) {
    return "disconnected";
  }
  return "unknown";
}
