import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { propertyMedia, type MediaKind } from "./db/schema";
import { newId } from "./ids";
import { uploadObject, validateUpload } from "./storage";

// The one way media becomes a property_media row.
//
// Extracted from the admin action so WhatsApp uploads produce identical rows —
// same sort order, same primary-image rule, same internal-by-default rule for
// documents. Two implementations would drift, and the one that drifted would be
// the one nobody was looking at.

/**
 * Uploads and records, appending after whatever is already there.
 *
 * Returns an error string if any file is rejected; nothing is uploaded in that
 * case, so a bad third file doesn't leave two orphans in the bucket.
 */
export async function attachMedia(
  propertyId: string,
  files: File[],
  kind: MediaKind,
): Promise<string | null> {
  if (!files.length) return null;

  for (const file of files) {
    const error = validateUpload(file, kind);
    if (error) return error;
  }

  const [{ maxOrder }] = await db()
    .select({ maxOrder: sql<number>`coalesce(max(${propertyMedia.sortOrder}), -1)::int` })
    .from(propertyMedia)
    .where(eq(propertyMedia.propertyId, propertyId));

  const [{ existing }] = await db()
    .select({ existing: sql<number>`count(*)::int` })
    .from(propertyMedia)
    .where(and(eq(propertyMedia.propertyId, propertyId), eq(propertyMedia.kind, "image")));

  let order = maxOrder;
  let imageIndex = existing;

  for (const file of files) {
    // Must stay under /images/: next.config.ts allows the image optimizer to
    // fetch `${NEXT_PUBLIC_IMAGE_CDN}/images/**` and nothing else.
    const key = await uploadObject(file, `images/properties/${propertyId}`);
    order += 1;
    await db()
      .insert(propertyMedia)
      .values({
        id: newId(),
        propertyId,
        kind,
        storageKey: key,
        // Documents and sketches are internal by default (§10).
        isPublic: kind === "image" || kind === "floor_plan",
        isPrimary: kind === "image" && imageIndex === 0,
        sortOrder: order,
        sizeBytes: file.size,
        contentType: file.type,
      });
    if (kind === "image") imageIndex += 1;
  }

  return null;
}

/** The files a form actually carries, ignoring the empty part an untouched
 *  `<input type="file">` still submits. */
export function filesFrom(formData: FormData): File[] {
  return formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
}
