import { ogImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Living by ITR — premium property and NRI services in Kochi";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Life happens here",
    "Property · NRI Concierge · Community Platform · Kochi",
  );
}
