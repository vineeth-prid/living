/**
 * Guards the rules that are expensive to get wrong.
 *
 *   npm run check:security
 *
 * Pure assertions, no database and no test framework — it runs in CI and on a
 * laptop with nothing configured. The database-backed authorisation checks in
 * §49 (login, role gates, cross-employee lead access) need a live Postgres and
 * are listed in the README as a manual pass.
 */
import assert from "node:assert/strict";
import { PUBLIC_PROPERTY_FIELDS } from "../lib/properties";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { normaliseMobile } from "../lib/leads";
import { funnelFrom } from "../lib/analytics";
import { priceLabelFor, publishBlockers } from "../lib/validation/property";

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>) => {
  return Promise.resolve(fn()).then(
    () => {
      checks += 1;
      console.log(`  ok  ${name}`);
    },
    (error) => {
      console.error(`FAIL  ${name}`);
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    },
  );
};

async function main() {
  // --- §9 / §41: internal fields must never be in the public projection ------
  // The single most important check here. If someone adds finalPrice to the
  // allowlist to "just show it on the card", this fails before it ships.
  const FORBIDDEN_PUBLIC_FIELDS = [
    "finalPrice",
    "internalNotes",
    "sellerName",
    "sellerContact",
    "addressLine",
    "surveyNumber",
    "boundaryNotes",
    "createdById",
    "updatedById",
    "deletedAt",
    "workflowStatus",
  ];

  await check("public property projection excludes every internal field", () => {
    for (const field of FORBIDDEN_PUBLIC_FIELDS) {
      assert.ok(
        !PUBLIC_PROPERTY_FIELDS.includes(field),
        `"${field}" is in the public projection — it must never reach the website`,
      );
    }
  });

  await check("public property projection still carries what pages render", () => {
    for (const field of ["id", "name", "priceLabel", "gallery", "summary"]) {
      assert.ok(
        PUBLIC_PROPERTY_FIELDS.includes(field),
        `"${field}" is missing from the public projection`,
      );
    }
  });

  // --- §4: password hashing -------------------------------------------------
  await check("password hashing round-trips and rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert.ok(hash.startsWith("scrypt$"), "hash should record its scheme");
    assert.ok(!hash.includes("correct horse"), "hash must not contain the password");
    assert.equal(await verifyPassword("correct horse battery staple", hash), true);
    assert.equal(await verifyPassword("Correct horse battery staple", hash), false);
    assert.equal(await verifyPassword("", hash), false);
  });

  await check("the same password hashes differently each time (salted)", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    assert.notEqual(a, b, "two hashes of one password must not be identical");
  });

  await check("a malformed stored hash is rejected, not thrown on", async () => {
    assert.equal(await verifyPassword("x", "not-a-hash"), false);
    assert.equal(await verifyPassword("x", "bcrypt$1$2$3$4"), false);
  });

  // --- §30: duplicate detection --------------------------------------------
  await check("mobile normalisation matches the same number written differently", () => {
    const forms = ["+91 98470 12345", "098470 12345", "9847012345", "+919847012345"];
    const normalised = forms.map(normaliseMobile);
    assert.deepEqual(new Set(normalised).size, 1, `got ${normalised.join(", ")}`);
    assert.equal(normalised[0], "9847012345");
  });

  await check("different numbers do not normalise together", () => {
    assert.notEqual(normaliseMobile("9847012345"), normaliseMobile("9847012346"));
  });

  // --- Rule 1 / §11: the publish gate ---------------------------------------
  const complete = {
    name: "The Arbour",
    summary: "An elevated home in Kakkanad.",
    city: "Ernakulam",
    locality: "Kakkanad",
    priceLabel: "₹1.85 Cr",
    askingPrice: 18500000,
    listingType: "sale",
    mediaCount: 3,
  };

  await check("a complete listing has no publish blockers", () => {
    assert.deepEqual(publishBlockers(complete), []);
  });

  await check("publishing is blocked without a photo", () => {
    const blockers = publishBlockers({ ...complete, mediaCount: 0 });
    assert.equal(blockers.length, 1);
    assert.match(blockers[0], /photo/i);
  });

  await check("publishing is blocked without a price on a sale", () => {
    const blockers = publishBlockers({ ...complete, askingPrice: null });
    assert.ok(blockers.some((b) => /asking price/i.test(b)));
  });

  await check("a rental does not need an asking price", () => {
    const blockers = publishBlockers({
      ...complete,
      askingPrice: null,
      listingType: "rental",
    });
    assert.deepEqual(blockers, []);
  });

  // --- §33: the funnel must never report progress as a loss -----------------
  await check("funnel counts leads that reached or passed each stage", () => {
    // One lead sitting in negotiation still counts as contacted and qualified.
    const funnel = funnelFrom({ negotiation: 1 });
    const byKey = Object.fromEntries(funnel.map((s) => [s.key, s.value]));
    assert.equal(byKey.new, 1);
    assert.equal(byKey.contacted, 1);
    assert.equal(byKey.qualified, 1);
    assert.equal(byKey.negotiation, 1);
    assert.equal(byKey.closed_won, 0);
  });

  await check("funnel stages never increase left to right", () => {
    const funnel = funnelFrom({
      new: 10,
      contacted: 6,
      qualified: 4,
      negotiation: 2,
      closed_won: 1,
      closed_lost: 3,
    });
    for (let i = 1; i < funnel.length; i++) {
      assert.ok(
        funnel[i].value <= funnel[i - 1].value,
        `${funnel[i].label} (${funnel[i].value}) exceeds ${funnel[i - 1].label} (${funnel[i - 1].value})`,
      );
    }
  });

  await check("an empty funnel reports zero, not NaN", () => {
    for (const step of funnelFrom({})) {
      assert.equal(step.value, 0);
      assert.ok(Number.isFinite(step.rate));
    }
  });

  // --- price labels ---------------------------------------------------------
  await check("price labels format to Indian units", () => {
    assert.equal(priceLabelFor(18500000), "₹1.85 Cr");
    assert.equal(priceLabelFor(9800000), "₹98 L");
    assert.equal(priceLabelFor(0), undefined);
    assert.equal(priceLabelFor(undefined), undefined);
  });

  console.log(`\n${checks} checks passed`);
  if (process.exitCode) console.error("Some checks failed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
