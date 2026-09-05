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

/** References carry digits that are not money: "LIV-0027", "PO-14". */
const REFERENCE = /\b[A-Za-z]{2,}-\d+\b/g;

/**
 * A number followed by a unit, or a plain figure large enough to be a price.
 *
 * The unit or the magnitude is what makes it a candidate: "3" in "3 BHK" is
 * not an amount, and reading it as one is how a listing ends up at three
 * rupees. A bare number needs five digits — "1800" is a built-up area, and
 * no property here is priced under ten thousand rupees.
 */
const AMOUNT_PHRASE =
  /(?:₹\s*)?\d[\d,]*(?:\.\d+)?\s*(?:crores?|cr|lakhs?|lacs?|l|thousands?|k)\b|₹\s*\d[\d,]*(?:\.\d+)?|\b\d{5,}(?:\.\d+)?\b/gi;

/**
 * The amount named in a sentence, or null if there isn't exactly one.
 *
 * Ambiguity is refused rather than resolved: two figures in one message means
 * we cannot tell which is the price, and guessing wrong writes a real number
 * onto a real listing.
 */
export function amountInText(text: string): number | null {
  const cleaned = (text ?? "").replace(REFERENCE, " ");
  const matches = cleaned.match(AMOUNT_PHRASE);
  if (!matches || matches.length !== 1) return null;
  return parseAmount(matches[0]);
}

/**
 * The amount to act on: the employee's own words first, the model's number
 * only as a fallback.
 *
 * Same precedent as dates, and for the same reason — arithmetic is the part a
 * model gets quietly wrong. "92 lakh" coming back as 92 would set a listing to
 * ninety-two rupees, and nothing downstream would notice.
 */
export function amountFrom(
  text: string,
  modelAmount?: number | null,
): number | null {
  const fromText = amountInText(text);
  if (fromText !== null) return fromText;
  return typeof modelAmount === "number" && Number.isFinite(modelAmount)
    ? Math.round(modelAmount)
    : null;
}

/**
 * The price as a listing shows it: "₹1.5 Cr", "₹26 L", "₹75 L".
 *
 * Same numbers as `formatPrice`, spaced. The CRM shorthand is deliberately
 * tight ("₹1.75Cr") because it sits in table cells; a property card has room,
 * and a space is what a buyer reads without stumbling. One formatter over one
 * stored integer, so no price string is ever hand-written.
 *
 * Empty string for null, undefined, NaN and anything at or below zero — the
 * caller decides what "no price" looks like, and "₹0" is never it.
 */
export function formatIndianPropertyPrice(
  value: number | null | undefined,
): string {
  const shorthand = formatPrice(value);
  return shorthand.replace(/(Cr|L)$/, " $1");
}
