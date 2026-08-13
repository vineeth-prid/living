import { ogContentType, ogImage, ogSize } from "@/lib/og";
import { getProperty } from "@/lib/properties";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Living — property";

// Built only from the public projection, so no internal field (final price,
// seller, internal notes) can reach a social card.
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getProperty(slug);

  if (!property) return ogImage("Living", "Life Happens Here.");

  return ogImage(
    property.name,
    `${property.type} · ${property.locality}, ${property.city} · ${property.priceLabel}`,
  );
}
