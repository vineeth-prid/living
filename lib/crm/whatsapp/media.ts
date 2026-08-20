import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { properties, whatsappConversations, type MediaKind } from "@/lib/db/schema";
import { attachMedia } from "@/lib/properties.media";
import { hasStorage } from "@/lib/storage";
import { openWAConfig } from "@/lib/integrations/whatsapp/config";
import type { InboundMedia } from "@/lib/integrations/whatsapp/types";
import type { SessionUser } from "@/lib/auth/session";
import type { HandlerResult } from "./handlers";
import { t } from "./templates";

// §5. A file sent over WhatsApp becomes a property_media row in MinIO, through
// the same attachMedia the admin panel uses — one storage system, one set of
// rules about what is public and what is not.
//
// Media never reaches the model. A picture is not an instruction, and running
// one through an intent parser would be a way to smuggle one in.

/**
 * §4: photos, video and sketches. What kind of row a file becomes is decided by
 * its type and, for the images, by what the employee called it — a floor plan
 * and a sketch are both JPEGs, and they are not both public.
 */
function kindFor(mimeType: string, caption: string): MediaKind | null {
  const said = caption.toLowerCase();

  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "document";

  if (mimeType.startsWith("image/")) {
    // Most specific first. "rough sketch of the layout" is a sketch — matching
    // the vaguer word first would have made it a floor plan, which is public
    // by default where a sketch is not.
    if (/\bfloor\s*plan\b/.test(said)) return "floor_plan";
    if (/\bsketch\b|\bdrawing\b/.test(said)) return "sketch";
    if (/\blayout\b|\bplan\b/.test(said)) return "floor_plan";
    return "image";
  }
  return null;
}

/**
 * Ceiling per group, used only to refuse an obviously oversized file before
 * downloading it. The real limits live in lib/storage.ts validateUpload, which
 * attachMedia runs — this is a guard on the wire, not a second rulebook.
 */
const PRE_DOWNLOAD_CAP: Record<MediaKind, number> = {
  image: 12 * 1024 * 1024,
  sketch: 12 * 1024 * 1024,
  floor_plan: 12 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  video: 200 * 1024 * 1024,
};

export async function attachWhatsAppMedia(input: {
  user: SessionUser;
  conversationId: string;
  media: InboundMedia;
  caption: string;
  /** A property the conversation was already asked about. */
  pendingPropertyId: string | null;
}): Promise<HandlerResult> {
  if (!hasStorage()) {
    return { ok: false, reply: "Storage isn't configured, so I can't keep that file." };
  }

  const propertyId =
    input.pendingPropertyId ?? (await lastPropertyInThread(input.conversationId));
  if (!propertyId) {
    // §6 of the original brief: guessing which listing a photo belongs to is
    // the same mistake as guessing which lead a note belongs to.
    // No example reference. A placeholder that looks real gets typed back
    // verbatim — LIV-0027 was sent as an answer here, resolved to nothing, and
    // the message then fell through to the classifier with no context at all.
    return {
      ok: false,
      needsProperty: true,
      reply: t.whichProperty(),
    };
  }

  const [property] = await db()
    .select({ id: properties.id, reference: properties.reference, name: properties.name })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!property) return { ok: false, reply: "That property no longer exists." };

  const kind = kindFor(input.media.mimeType ?? "", input.caption);
  if (!kind) {
    return {
      ok: false,
      reply: `${input.media.mimeType || "That file type"} isn't something I can attach — send a photo, a video or a PDF.`,
    };
  }

  const file = await toFile(input.media, kind);
  if (typeof file === "string") return { ok: false, reply: file };

  const error = await attachMedia(property.id, [file], kind);
  if (error) return { ok: false, reply: `I couldn't store that: ${error}` };

  // Attaching to a live listing changes the website, so the public pages have
  // to be told. Imported here rather than at the top to keep this module
  // usable from the check scripts, which have no Next request context.
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/admin/properties/${property.id}`);
  revalidatePath(`/homes/${property.id}`);

  const label = property.reference ?? property.name;
  const noun = kind === "image" ? "Photo" : kind.replace(/_/g, " ");
  // §10 of the original brief: documents and sketches are internal by default,
  // so saying "added" without saying where would be misleading.
  const visibility =
    kind === "image" || kind === "floor_plan"
      ? ""
      : " It's marked internal and won't appear on the website.";

  return {
    ok: true,
    reply: `✅ ${noun} added to ${label}.${visibility} Send more, or *publish ${label}* when it's ready.`,
    target: { entity: "property", id: property.id },
    summary: `${kind} attached`,
  };
}

/**
 * Turns the provider's media into a File. Returns a message instead when it
 * cannot, so the employee is told why rather than met with silence.
 */
async function toFile(media: InboundMedia, kind: MediaKind): Promise<File | string> {
  const mimeType = media.mimeType ?? "";
  const cap = PRE_DOWNLOAD_CAP[kind];
  const tooBig = `That file is larger than ${Math.round(cap / (1024 * 1024))} MB.`;

  if (media.sizeBytes && media.sizeBytes > cap) return tooBig;

  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
  const filename = media.filename ?? `whatsapp.${extension}`;

  if (media.base64) {
    const bytes = Buffer.from(media.base64, "base64");
    if (bytes.length > cap) return tooBig;
    return new File([new Uint8Array(bytes)], filename, { type: mimeType });
  }

  if (!media.url) return "That message had no file I could fetch.";

  try {
    const config = openWAConfig();
    const sameHost = media.url.startsWith(config.baseUrl);
    const response = await fetch(media.url, {
      // The key goes only to OpenWA itself. A media URL pointing anywhere else
      // is fetched anonymously — a webhook must not be able to make Living
      // hand its credentials to a third party.
      headers: sameHost ? { "X-API-Key": config.apiKey } : {},
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) return `I couldn't download that file (${response.status}).`;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > cap) return tooBig;
    return new File([new Uint8Array(bytes)], filename, { type: mimeType });
  } catch (error) {
    console.error("[whatsapp] media download failed", error);
    return "I couldn't download that file.";
  }
}

/** The property this thread is currently about. */
async function lastPropertyInThread(conversationId: string): Promise<string | null> {
  const [row] = await db()
    .select({ propertyId: whatsappConversations.propertyId })
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, conversationId))
    .orderBy(desc(whatsappConversations.updatedAt))
    .limit(1);
  return row?.propertyId ?? null;
}

export { kindFor };
