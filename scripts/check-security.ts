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
import { RANGE_PRESETS, funnelFrom, resolveRange } from "../lib/analytics";
import { priceLabelFor, publishBlockers } from "../lib/validation/property";
import { formatMoney, toMajor, toMinor } from "../lib/expenses";
import { hasSmtp, teamRecipients } from "../lib/notify";

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
    "sellerWhatsapp",
    "sellerAltContact",
    "sellerEmail",
    "sellerWhatsappOptIn",
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

  await check("the instagram link is public on purpose", () => {
    // It is shown on the listing page, so it has to be in the projection —
    // pinned here so that being public stays a decision rather than an
    // accident of adding a column.
    assert.ok(
      PUBLIC_PROPERTY_FIELDS.includes("instagramUrl"),
      "instagramUrl must be in the public projection to render on the site",
    );
  });

  await check("public property projection excludes every internal field", () => {
    for (const field of FORBIDDEN_PUBLIC_FIELDS) {
      assert.ok(
        !PUBLIC_PROPERTY_FIELDS.includes(field),
        `"${field}" is in the public projection — it must never reach the website`,
      );
    }
  });

  await check("public property projection still carries what pages render", () => {
    for (const field of [
      "id",
      "name",
      "priceLabel",
      "priceValue",
      "gallery",
      "summary",
      // The listing card renders these (§18/§20) and collapses when absent.
      "hasBuilding",
      "landArea",
      "landAreaUnit",
      "roadAccess",
      "facing",
      "builtUpArea",
      "units",
      "propertyAge",
    ]) {
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

  // --- §33: the range every report is measured over -------------------------
  await check("every offered range preset resolves to a real window", () => {
    for (const preset of RANGE_PRESETS) {
      const range = resolveRange(preset.value);
      assert.ok(
        range.from <= range.to,
        `${preset.value} resolved backwards: ${range.from} → ${range.to}`,
      );
      assert.equal(range.label, preset.label, `${preset.value} mislabelled`);
    }
  });

  await check("explicit dates beat the preset", () => {
    // They used to need a hidden range=custom alongside them, so picking two
    // dates and leaving the preset alone quietly reported the preset instead.
    const range = resolveRange("7d", "2026-01-01", "2026-01-31");
    assert.equal(range.label, "Custom range");
    assert.equal(range.from.toISOString().slice(0, 10), "2026-01-01");
    assert.equal(range.to.toISOString().slice(0, 10), "2026-01-31");

    // A half-filled or unparseable pair falls back rather than throwing.
    assert.equal(resolveRange("7d", "2026-01-01").label, "Last 7 days");
    assert.equal(resolveRange(undefined, "junk", "junk").label, "Last 30 days");
    assert.equal(resolveRange(undefined).label, "Last 30 days");
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
    assert.equal(priceLabelFor(18500000), "₹1.85Cr");
    assert.equal(priceLabelFor(9800000), "₹98L");
    assert.equal(priceLabelFor(0), undefined);
    assert.equal(priceLabelFor(undefined), undefined);
  });

  // --- money: paise in, rupees out ------------------------------------------
  // Expenses are summed in SQL, so a rounding error here compounds across the
  // whole ledger rather than showing up on one row.
  await check("rupees convert to paise without float drift", () => {
    assert.equal(toMinor(12500), 1250000);
    assert.equal(toMinor(12500.5), 1250050);
    assert.equal(toMinor(0.1) + toMinor(0.2), toMinor(0.3));
    // The classic float trap: 1234.565 * 100 is 123456.49999999999.
    assert.equal(toMinor(1234.565), 123457);
    assert.equal(Number.isInteger(toMinor(99.999)), true);
  });

  await check("paise round-trip back to the same rupee value", () => {
    for (const rupees of [0.01, 1, 99.99, 12500.5, 1_00_00_000]) {
      assert.equal(toMajor(toMinor(rupees)), rupees);
    }
  });

  await check("money formatting never prints a bare number or NaN", () => {
    assert.match(formatMoney(1250000), /12,500/);
    assert.equal(formatMoney(null), "—");
    assert.equal(formatMoney(undefined), "—");
    assert.match(formatMoney(0), /0/);
  });

  // --- notifications --------------------------------------------------------
  await check("team recipients parse a comma-separated list", () => {
    process.env.NOTIFY_TEAM_EMAILS = "a@x.com, b@x.com ,, c@x.com";
    assert.deepEqual(teamRecipients(), ["a@x.com", "b@x.com", "c@x.com"]);
    delete process.env.NOTIFY_TEAM_EMAILS;
    // Falls back to the public inbox rather than sending to nobody.
    assert.ok(teamRecipients().length >= 1);
  });

  await check("SMTP is reported as unconfigured when host or from is missing", () => {
    const host = process.env.SMTP_HOST;
    const from = process.env.SMTP_FROM;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    assert.equal(hasSmtp(), false);

    process.env.SMTP_HOST = "smtp.example.com";
    assert.equal(hasSmtp(), false, "host alone must not count as configured");

    process.env.SMTP_FROM = "Living <x@example.com>";
    assert.equal(hasSmtp(), true);

    if (host === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = host;
    if (from === undefined) delete process.env.SMTP_FROM;
    else process.env.SMTP_FROM = from;
  });

  console.log(`\n${checks} checks passed`);
  if (process.exitCode) console.error("Some checks failed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
