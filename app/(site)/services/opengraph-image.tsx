import { ogImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Buy, sell and NRI property services in Kochi — Living by ITR";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Buy well. Sell quietly",
    "Property Buying · Selling · NRI Concierge · Kochi & Ernakulam",
  );
}
