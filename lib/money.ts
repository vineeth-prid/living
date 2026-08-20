/**
 * Rupee amounts: read however they were typed, stored as one number, shown in
 * one shorthand.
 *
 * The store-as-a-number part is not incidental. "85L" as text cannot be added
 * to another amount, sorted, or filtered on a range — and totals, ordering and
 * budget filters are all things the CRM already does. So the canonical form is
 * an integer number of rupees, and "85L" is what it looks like on the way in
 * and on the way out:
 *
 *   "85L" · "85 lakh" · "8500000" · "₹85,00,000"  → 8_500_000   (parseAmount)
 *   8_500_000                                     → "85L"       (formatAmount)
 *
 * Because the middle is a number, arithmetic is ordinary arithmetic:
 * 50L + 85L is 13_500_000, which formats back as "1.35Cr".
 */

export const LAKH = 100_000;
export const CRORE = 10_000_000;

const SUFFIXES: [RegExp, number][] = [
  [/^(cr|crores?)\b/i, CRORE],
  [/^(l|lakhs?|lacs?)\b/i, LAKH],
  [/^(k|thousands?)\b/i, 1_000],
];

/**
 * Reads an amount written any of the ways people actually write one.
 *
 * Returns null rather than a guess: a value that cannot be read must fail as
 * a value, not arrive as a wrong number.
 */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  }
  if (!input) return null;

  const text = String(input).trim();
  if (!text) return null;

  // Currency, grouping and stray spaces are noise. Indian digit grouping is not
  // thousands grouping, so separators are stripped rather than interpreted.
  const cleaned = text.replace(/[₹,\s]/g, "");
  const numeric = cleaned.match(/^-?\d+(\.\d+)?/);
  if (!numeric) return null;

  const value = Number(numeric[0]);
  if (!Number.isFinite(value) || value < 0) return null;

  // Only what follows the digits counts, so the "l" ending a bare "8500000"
  // cannot be read as lakhs.
  const suffix = cleaned.slice(numeric[0].length);
  for (const [pattern, multiplier] of SUFFIXES) {
    if (pattern.test(suffix)) return Math.round(value * multiplier);
  }
  return Math.round(value);
}

/** Trims a scaled number to at most two decimals, without trailing zeros. */
const trim = (value: number) =>
  String(Number(value.toFixed(2))).replace(/\.0+$/, "");

/**
 * The shorthand: "85L", "1Cr", "2.5Cr", "1.35Cr".
 *
 * No currency symbol — callers that are showing a price add one. Amounts below
 * a lakh are grouped Indian-style rather than forced into a unit nobody uses
 * for them.
 */
export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  if (value < 0) return `-${formatAmount(-value)}`;

  if (value >= CRORE) return `${trim(value / CRORE)}Cr`;
  if (value >= LAKH) return `${trim(value / LAKH)}L`;
  return value.toLocaleString("en-IN");
}

/** The same shorthand with the rupee sign, for anywhere showing a price. */
export const formatPrice = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value) || value <= 0
    ? ""
    : `₹${formatAmount(value)}`;

/**
 * Totals, in the shorthand.
 *
 * This is the reason amounts are stored as numbers: adding 50L and 85L is
 * adding 5_000_000 and 8_500_000, and the answer formats itself as "1.35Cr".
 * Nulls are skipped so a column with gaps still totals.
 */
export function sumAmounts(values: (number | null | undefined)[]): number {
  return values.reduce<number>(
    (total, value) =>
      typeof value === "number" && Number.isFinite(value) ? total + value : total,
    0,
  );
}

/** Convenience for the common "add these up and show it" case. */
export const formatTotal = (values: (number | null | undefined)[]): string =>
  formatAmount(sumAmounts(values));
