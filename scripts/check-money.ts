import assert from "node:assert/strict";
import {
  CRORE,
  LAKH,
  formatAmount,
  formatPrice,
  formatTotal,
  parseAmount,
  sumAmounts,
} from "../lib/money";
import { propertySchema, priceLabelFor } from "../lib/validation/property";

let checks = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    checks += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
};

// --- reading --------------------------------------------------------------

check("an amount is read however it was typed", () => {
  // All four of these are the same money.
  for (const given of ["85L", "85 L", "85 lakh", "85 lakhs", "85lac", "8500000", "₹85,00,000"]) {
    assert.equal(parseAmount(given), 8_500_000, `"${given}"`);
  }
  for (const given of ["1Cr", "1 cr", "1 crore", "10000000", "₹1,00,00,000"]) {
    assert.equal(parseAmount(given), 10_000_000, `"${given}"`);
  }
  assert.equal(parseAmount("2.5Cr"), 25_000_000);
  assert.equal(parseAmount("1.35 Cr"), 13_500_000);
  assert.equal(parseAmount("45k"), 45_000);
  assert.equal(parseAmount(8_500_000), 8_500_000, "a number passes through");
});

check("a bare number is never mistaken for a unit", () => {
  // The trailing digits of "8500000" must not be read as an "l" for lakhs.
  assert.equal(parseAmount("8500000"), 8_500_000);
  assert.equal(parseAmount("100"), 100);
  assert.equal(parseAmount("0"), 0);
});

check("what is not an amount is refused, not guessed", () => {
  for (const given of ["", "  ", "ask me later", "TBD", "soon", "-5L"]) {
    assert.equal(parseAmount(given), null, `"${given}"`);
  }
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount(undefined), null);
});

// --- showing --------------------------------------------------------------

check("an amount is shown in the shorthand", () => {
  assert.equal(formatAmount(8_500_000), "85L");
  assert.equal(formatAmount(10_000_000), "1Cr");
  assert.equal(formatAmount(25_000_000), "2.5Cr");
  assert.equal(formatAmount(13_500_000), "1.35Cr");
  assert.equal(formatAmount(18_500_000), "1.85Cr");
  assert.equal(formatAmount(100_000), "1L");
  // Below a lakh nobody says "0.45L".
  assert.equal(formatAmount(45_000), "45,000");
  assert.equal(formatAmount(0), "0");
  assert.equal(formatAmount(null), "");
});

check("what goes in comes back out", () => {
  // The round trip is the whole promise: type 85L, see 85L.
  for (const given of ["85L", "1Cr", "2.5Cr", "1.35Cr", "12L"]) {
    const parsed = parseAmount(given);
    assert.notEqual(parsed, null, given);
    assert.equal(formatAmount(parsed), given.replace(/\s+/g, ""), given);
  }
});

check("a price carries the rupee sign", () => {
  assert.equal(formatPrice(8_500_000), "₹85L");
  assert.equal(formatPrice(13_500_000), "₹1.35Cr");
  assert.equal(formatPrice(0), "", "nothing to show for no price");
  assert.equal(priceLabelFor(8_500_000), "₹85L");
  assert.equal(priceLabelFor(undefined), undefined);
});

// --- arithmetic -----------------------------------------------------------

check("amounts add up, and the total is shown in the shorthand", () => {
  // This is why the stored value is a number and not the string "85L":
  // 50L + 85L is 1.35Cr, and no string could have worked that out.
  assert.equal(sumAmounts([50 * LAKH, 85 * LAKH]), 13_500_000);
  assert.equal(formatTotal([50 * LAKH, 85 * LAKH]), "1.35Cr");

  assert.equal(formatTotal([2.5 * CRORE, 85 * LAKH]), "3.35Cr");
  assert.equal(formatTotal([1 * CRORE, 1 * CRORE, 50 * LAKH]), "2.5Cr");

  // A column with gaps still totals.
  assert.equal(formatTotal([85 * LAKH, null, undefined, 15 * LAKH]), "1Cr");
  assert.equal(formatTotal([]), "0");
});

check("parse then add then show, end to end", () => {
  const typed = ["2.5Cr", "85 lakh", "₹15,00,000"];
  const parsed = typed.map((v) => parseAmount(v));
  assert.deepEqual(parsed, [25_000_000, 8_500_000, 1_500_000]);
  assert.equal(formatTotal(parsed), "3.5Cr");
});

// --- the admin form -------------------------------------------------------

const base = {
  name: "Lakeside villa",
  summary: "A calm four-bedroom home near the lake, with good light.",
  type: "4 BHK villa",
  kind: "residential",
  listingType: "sale",
  status: "Ready to move",
  locality: "Kakkanad",
  city: "Kochi",
  amenities: [],
};

check("the admin form accepts an amount in any spelling", () => {
  for (const given of ["85L", "85 lakh", "8500000", "₹85,00,000"]) {
    const parsed = propertySchema.safeParse({ ...base, askingPrice: given });
    assert.ok(parsed.success, `"${given}" should be accepted`);
    assert.equal(parsed.data.askingPrice, 8_500_000, `"${given}" value`);
  }
});

check("the admin form refuses a price that is not one", () => {
  const parsed = propertySchema.safeParse({ ...base, askingPrice: "ask me" });
  assert.ok(!parsed.success, "must not store a wrong number");
  assert.match(
    parsed.error.issues.map((i) => i.message).join(" "),
    /amount/i,
    "and must say so in terms of an amount",
  );
});

check("an instagram link is accepted with or without a scheme", () => {
  const bare = propertySchema.safeParse({
    ...base,
    askingPrice: "85L",
    instagramUrl: "instagram.com/p/abc123",
  });
  assert.ok(bare.success, bare.success ? "" : JSON.stringify(bare.error.issues));
  assert.equal(bare.data.instagramUrl, "https://instagram.com/p/abc123");

  const full = propertySchema.safeParse({
    ...base,
    askingPrice: "85L",
    instagramUrl: "https://www.instagram.com/reel/xyz/",
  });
  assert.ok(full.success);
  assert.equal(full.data.instagramUrl, "https://www.instagram.com/reel/xyz/");

  // Blank is not an error — most listings will not have one.
  const blank = propertySchema.safeParse({ ...base, askingPrice: "85L", instagramUrl: "" });
  assert.ok(blank.success);
  assert.equal(blank.data.instagramUrl, undefined);

  const junk = propertySchema.safeParse({ ...base, askingPrice: "85L", instagramUrl: "not a link" });
  assert.ok(!junk.success, "plain prose is not a link");
});

console.log(`\n${checks} checks passed`);
if (process.exitCode) console.error("Some checks failed.");
