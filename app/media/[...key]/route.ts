import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { propertyMedia } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { getObject, hasStorage } from "@/lib/storage";

// Read path for everything the admin panel uploads.
//
// Uploaded objects used to be linked straight at the bucket, which only works
// if NEXT_PUBLIC_IMAGE_CDN is set AND the bucket allows anonymous reads —
// otherwise every photo on the edit page came back blank. Reading them here
// with the server's own credentials removes both conditions.
//
// It also fixes a leak the CDN links had: receipts and media marked internal
// were as fetchable as the public photos. Here, only rows explicitly flagged
// public are anonymous; everything else needs a session.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  if (!hasStorage()) return new Response("Storage not configured", { status: 501 });

  const { key } = await params;
  // The segments come from the router already decoded and with no ".." — but
  // the key is looked up as an exact string below, so it can't be walked
  // anywhere the database doesn't already point.
  const storageKey = `/${key.join("/")}`;

  const [media] = await db()
    .select({ isPublic: propertyMedia.isPublic })
    .from(propertyMedia)
    .where(eq(propertyMedia.storageKey, storageKey))
    .limit(1);

  // Anything not in property_media — expense receipts, above all — is staff-only.
  const isPublic = media?.isPublic === true;
  if (!isPublic && !(await getCurrentUser())) {
    return new Response("Not found", { status: 404 });
  }

  const object = await getObject(storageKey);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": String(object.size),
      // Keys carry a random suffix and are never rewritten, so public objects
      // can be cached hard. Private ones must not touch a shared cache.
      "Cache-Control": isPublic
        ? "public, max-age=31536000, immutable"
        : "private, no-store",
    },
  });
}
