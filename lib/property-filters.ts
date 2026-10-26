import { CRORE, LAKH } from "./money";

// The /homes filters. Plain query params (?budget=&location=) so a filtered
// list is a URL — shareable, crawlable, and working without JavaScript.

export const BUDGETS = [
  { key: "under-50l", label: "Under ₹50L", min: 0, max: 50 * LAKH },
  { key: "50l-1cr", label: "₹50L – ₹1Cr", min: 50 * LAKH, max: CRORE },
  { key: "1cr-2cr", label: "₹1Cr – ₹2Cr", min: CRORE, max: 2 * CRORE },
  { key: "2cr-5cr", label: "₹2Cr – ₹5Cr", min: 2 * CRORE, max: 5 * CRORE },
  { key: "over-5cr", label: "Above ₹5Cr", min: 5 * CRORE, max: Infinity },
] as const;

type Filterable = { priceValue: number; locality: string };

/** An unknown budget key filters nothing, so a mangled URL still shows homes. */
export function filterProperties<T extends Filterable>(
  items: T[],
  budget?: string,
  location?: string,
): T[] {
  const band = BUDGETS.find((b) => b.key === budget);
  return items.filter(
    (p) =>
      (!band || (p.priceValue >= band.min && p.priceValue < band.max)) &&
      (!location || p.locality === location),
  );
}

export function locationsOf(items: Filterable[]): string[] {
  return [...new Set(items.map((p) => p.locality))].sort((a, b) => a.localeCompare(b));
}
