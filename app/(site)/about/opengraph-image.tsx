import { ogImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "About Living — premium property by ITR Group, Kerala";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Fifteen years of trust",
    "A premium property and living brand by ITR Group · Kerala",
  );
}
