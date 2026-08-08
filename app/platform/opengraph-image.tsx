import { ogImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Apartment and facility management platform in Kochi — Living";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "A calm home to manage",
    "Facility Management · Complaints · Home Services · Analytics",
  );
}
