/**
 * Which public pages a listing appears on.
 *
 * The site is prerendered, so changing a row in Postgres changes nothing a
 * visitor can see until the pages that render it are invalidated. Publishing
 * from the admin panel did that; publishing over WhatsApp did not, so a listing
 * could be `published` in the database, reported as "live on site" by the CRM,
 * and still be absent from the website until the next deploy.
 *
 * The reason it drifted is that the list lived inside the admin panel, where
 * nothing else could reach it — so the WhatsApp path grew its own shorter
 * version, and then a third one with no paths at all. One list, exported, is
 * the fix: a new public page that shows listings gets added here once.
 *
 * Deliberately not importing `next/cache` — the check scripts import the
 * modules that call this, and they run under tsx with no Next request context.
 * Callers do the import themselves, at the point they actually revalidate.
 */
export function publicPropertyPaths(id?: string | null): string[] {
  return [
    // The homepage carries featured listings.
    "/",
    // /services shows them too, under the buying section.
    "/services",
    // The full collection, and its pagination.
    "/homes",
    // The listing's own page, when one property in particular changed.
    ...(id ? [`/homes/${id}`] : []),
    // Search engines are told about a new listing the same way.
    "/sitemap.xml",
  ];
}

/**
 * Tell the public pages that a listing changed.
 *
 * For callers outside the admin panel — a webhook handler, a CRM command —
 * which have no static `next/cache` import of their own.
 */
export async function revalidatePublicProperty(id?: string | null): Promise<void> {
  const { revalidatePath } = await import("next/cache");
  for (const path of publicPropertyPaths(id)) revalidatePath(path);
}
