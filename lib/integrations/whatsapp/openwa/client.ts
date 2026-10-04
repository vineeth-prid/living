import { openWAConfig, type OpenWAConfig } from "../config";
import type { MediaSendKind } from "../types";

// The only file in the codebase that knows OpenWA's HTTP shape. Everything
// above it speaks Living's types (§3).
//
// OpenWA is an unofficial gateway on someone else's VPS: it will be down, slow
// and occasionally wrong. Every call here is bounded by a timeout and either
// retried or not on purpose — never retried forever (§49).

export class OpenWAError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** Whether trying again could plausibly work. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OpenWAError";
  }
}

/** 408/429 and 5xx are worth another go; 4xx means the request itself is wrong. */
const isRetryableStatus = (status: number) =>
  status === 408 || status === 429 || status >= 500;

/**
 * `path` is appended to the base URL. Bodies and responses are JSON.
 *
 * Only idempotent verbs are retried by default: replaying a POST that already
 * reached OpenWA would send the message twice, and a duplicate WhatsApp message
 * is worse than a failed one.
 */
async function request<T>(
  config: OpenWAConfig,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  { retry = method === "GET", timeoutMs = config.timeoutMs } = {},
): Promise<T> {
  const attempts = retry ? Math.max(1, config.maxRetries) : 1;
  let lastError: OpenWAError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await once<T>(config, method, path, body, timeoutMs);
    } catch (error) {
      const failure =
        error instanceof OpenWAError
          ? error
          : new OpenWAError(String(error), null, true);
      lastError = failure;
      if (!failure.retryable || attempt === attempts) break;
      // Exponential backoff with a ceiling — 400ms, 800ms, 1600ms…
      await sleep(Math.min(400 * 2 ** (attempt - 1), 5_000));
    }
  }

  throw lastError ?? new OpenWAError("Request failed.", null, false);
}

async function once<T>(
  config: OpenWAConfig,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = config.timeoutMs,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        // Header-only auth. OpenWA does not accept a query-parameter key, and
        // a key in a URL ends up in access logs anyway.
        "X-API-Key": config.apiKey,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();

    if (!response.ok) {
      // NestJS error shape: { statusCode, message, error }. The message is
      // safe to surface; the key is never in it.
      let detail = text.slice(0, 300);
      try {
        const parsed = JSON.parse(text) as { message?: string | string[] };
        if (parsed.message) {
          detail = Array.isArray(parsed.message)
            ? parsed.message.join("; ")
            : parsed.message;
        }
      } catch {
        // Not JSON — a proxy error page. The truncated body is the best clue.
      }
      throw new OpenWAError(
        `OpenWA ${method} ${path} failed (${response.status}): ${detail}`,
        response.status,
        isRetryableStatus(response.status),
      );
    }

    return (text ? JSON.parse(text) : null) as T;
  } catch (error) {
    if (error instanceof OpenWAError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenWAError(
        `OpenWA ${method} ${path} timed out after ${timeoutMs}ms.`,
        null,
        true,
      );
    }
    // DNS failure, refused connection, TLS problem.
    throw new OpenWAError(
      `OpenWA ${method} ${path} could not be reached: ${
        error instanceof Error ? error.message : String(error)
      }`,
      null,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- wire types -----------------------------------------------------------
// Kept loose on purpose. OpenWA is a moving target and these are read
// defensively: a field that arrives with a different name degrades to null
// rather than throwing halfway through processing a real message.

export type OpenWASession = {
  id?: string;
  name?: string;
  status?: string;
  state?: string;
  connected?: boolean;
  phoneNumber?: string;
  me?: { id?: string; pushname?: string; phoneNumber?: string };
};

export type OpenWAWebhook = {
  id?: string;
  url?: string;
  events?: string[];
  isActive?: boolean;
};

/**
 * A contact as the gateway returns it.
 *
 * `id` is the addressable WhatsApp id — "919035367324@c.us" — and it is the
 * only field that carries the real number for a privacy-masked sender.
 * `number` keeps showing the masked pseudo-number, so reading it back gives
 * you the same fabricated digits you were trying to resolve.
 */
export type OpenWAContact = {
  id?: string;
  number?: string;
  name?: string;
  pushname?: string;
};

export type OpenWASendResult = {
  id?: string;
  messageId?: string;
  timestamp?: number;
};

/**
 * OpenWA's media routes, one per kind.
 *
 * The single source of truth for these names. If the gateway is upgraded and a
 * path changes, this is the line to edit — and `sendMedia` below puts the path
 * it tried into the error, so a mismatch shows up in the broadcast report
 * rather than needing anyone to read this file.
 *
 * `audio` is deliberately absent: it needs a mimetype and a ptt flag that
 * nothing upstream produces, and the composer cannot create one.
 */
const MEDIA_ENDPOINTS: Partial<Record<MediaSendKind, string>> = {
  image: "/messages/send-image",
  video: "/messages/send-video",
  document: "/messages/send-document",
};

/**
 * Last-resort content type, from the filename.
 *
 * The stored `media_mime_type` is the real source — the composer records
 * `file.type` on upload. This covers only the case where that is somehow absent,
 * and deliberately covers just the extensions the composer accepts rather than
 * becoming a mime database.
 */
function guessMimeType(filename: string | undefined): string | undefined {
  const extension = filename?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!extension) return undefined;

  const known: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
    pdf: "application/pdf",
  };
  return known[extension];
}

export const openWA = {
  config: openWAConfig,

  getSession(config = openWAConfig()) {
    return request<OpenWASession>(
      config,
      "GET",
      `/api/sessions/${encodeURIComponent(config.sessionId)}`,
    );
  },

  /** Accepts a plain number, a "@c.us" id, or a "@lid" masked id. */
  getContact(contactId: string, config = openWAConfig()) {
    return request<OpenWAContact>(
      config,
      "GET",
      `/api/sessions/${encodeURIComponent(config.sessionId)}/contacts/${encodeURIComponent(contactId)}`,
    );
  },

  sendText(chatId: string, text: string, config = openWAConfig()) {
    return request<OpenWASendResult>(
      config,
      "POST",
      `/api/sessions/${encodeURIComponent(config.sessionId)}/messages/send-text`,
      { chatId, text },
      { retry: false },
    );
  },

  /**
   * Media goes to a type-specific endpoint, decided here.
   *
   * There is no generic `send-media` route on OpenWA — this used to post to one
   * anyway, and every media message came back
   * `Cannot POST /api/sessions/…/messages/send-media` before the gateway even
   * looked at it. The route existed only in this file's imagination, and nothing
   * exercised it until broadcasts shipped.
   *
   * The names are in one map so correcting one is a one-line change, and the
   * error below names the path it tried — a wrong guess should be diagnosable
   * from the stored error alone rather than needing someone to read this file.
   */
  sendMedia(
    payload: {
      chatId: string;
      kind?: MediaSendKind;
      mimeType?: string;
      url?: string;
      base64?: string;
      filename?: string;
      caption?: string;
    },
    config = openWAConfig(),
  ) {
    // Matching the `?? "image"` the broadcast engine already applies: a missing
    // kind is overwhelmingly a photo, and a photo sent as a photo is a better
    // failure than a 400 for an absent field.
    const kind = payload.kind ?? "image";
    if (!payload.kind) {
      console.warn(
        `[openwa] media send with no kind, assuming image (chat ${payload.chatId})`,
      );
    }

    const path = MEDIA_ENDPOINTS[kind];
    if (!path) {
      // Not reachable from the composer, which accepts only images, video and
      // PDF. Refused rather than guessed: an audio send needs a mimetype and a
      // ptt flag, and inventing either would produce a message that arrives
      // looking broken instead of one that plainly did not send.
      throw new OpenWAError(
        `Sending ${kind} is not supported yet — add its endpoint and required fields to MEDIA_ENDPOINTS first.`,
        null,
        false,
      );
    }

    if (!payload.url && !payload.base64) {
      // The service checks this too, but the guard belongs here as well: this is
      // the layer that knows OpenWA needs one or the other, and a request with
      // neither comes back as a bare 400 that says nothing useful.
      throw new OpenWAError(
        "No media to send — a URL or an inline payload is required.",
        null,
        false,
      );
    }

    // Derived from the filename when the stored content type is missing, which
    // it should not be — the composer records file.type on upload — but a row
    // predating that, or a hand-inserted one, should not cost a send.
    const mimeType = payload.mimeType ?? guessMimeType(payload.filename);

    if (kind === "document" && !mimeType) {
      // WhatsApp renders a document with no content type as an unopenable blob.
      // Better to fail here, where the report says why.
      throw new OpenWAError(
        "A document needs its content type, and none reached the provider.",
        null,
        false,
      );
    }

    if (payload.base64 && !mimeType) {
      // OpenWA validates this immediately — "mimetype is required when using
      // base64 data" — so refusing here says the same thing with the context
      // of which broadcast it was, instead of a bare 400 in the report.
      throw new OpenWAError(
        "Inline media needs its content type, and none reached the provider.",
        null,
        false,
      );
    }

    // Only the fields that have a value. A strict validator on the gateway
    // rejects an explicit null where it accepts an absent key.
    const body: Record<string, unknown> = { chatId: payload.chatId };
    if (payload.url) body.url = payload.url;
    if (payload.caption) body.caption = payload.caption;

    if (payload.base64) {
      body.base64 = payload.base64;
      /**
       * Required, for every kind — not just documents.
       *
       * With a URL the gateway learns the type from the fetch response. With
       * inline bytes there is nothing to learn it from, so OpenWA rejects the
       * request outright: "mimetype is required when using base64 data". This
       * was set only for documents, which made the base64 transport — the one
       * thing added to diagnose the url path — fail on every image.
       */
      body.mimetype = mimeType;
    }

    if (kind === "document") {
      body.filename = payload.filename ?? "document";
      // Also on a URL send: WhatsApp needs it to render the document at all,
      // and a fetch that answers application/octet-stream does not provide it.
      body.mimetype = mimeType;
    }

    return request<OpenWASendResult>(
      config,
      "POST",
      `/api/sessions/${encodeURIComponent(config.sessionId)}${path}`,
      body,
      /**
       * Media gets its own, longer budget.
       *
       * Not a fix for the indefinite hang seen on the url transport — that
       * survived 30 seconds with the container idle, so it is not slowness. But
       * ten seconds was always the wrong budget for an upload: it is the one
       * call here that moves megabytes, and once the gateway can actually fetch
       * our files a real photo over a real link will sometimes take longer than
       * a status check.
       */
      { retry: false, timeoutMs: config.mediaTimeoutMs },
    );
  },

  listWebhooks(config = openWAConfig()) {
    return request<OpenWAWebhook[]>(
      config,
      "GET",
      `/api/sessions/${encodeURIComponent(config.sessionId)}/webhooks`,
    );
  },

  createWebhook(
    payload: { url: string; events: string[]; secret: string },
    config = openWAConfig(),
  ) {
    return request<OpenWAWebhook>(
      config,
      "POST",
      `/api/sessions/${encodeURIComponent(config.sessionId)}/webhooks`,
      payload,
      { retry: false },
    );
  },
};
