import { ogImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Contact Living — Kakkanad head office, Ernakulam, Kerala";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Let's talk about home",
    "Kakkanad, Ernakulam · 8089 00 55 00 · talktous@livingbyitr.com",
  );
}
