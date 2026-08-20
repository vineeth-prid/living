/**
 * The property form and the spreadsheet import, checked without a database.
 *
 *   npm run check:property
 *
 * Same shape as check-security.ts: plain assertions, no framework. Every case
 * below is one that actually got a listing rejected, so these are regression
 * pins rather than coverage for its own sake.
 */
import assert from "node:assert/strict";
import { parseCsv, toCsv } from "../lib/csv";
import { priceLabelFor, propertySchema, seoFor } from "../lib/validation/property";
import { SERVER_ACTION_BODY_LIMIT, UPLOAD_LIMITS } from "../lib/upload-limits";
import {
  IMPORT_COLUMNS,
  mapHeaders,
  rowToFormData,
  templateRows,
} from "../lib/validation/property-import";

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

/** What the browser posts: no key at all for an unticked box or a skipped field. */
function post(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return propertySchema.safeParse({
    ...Object.fromEntries(formData),
    amenities: formData
      .getAll("amenities")
      .map(String)
      .flatMap((v) => v.split("\n"))
      .map((v) => v.trim())
      .filter(Boolean),
  });
}

const MINIMAL = {
  name: "The Arbour",
  summary: "A calm four-bedroom home near the lake, with good light.",
  type: "3 & 4 BHK residences",
  kind: "residential",
  listingType: "sale",
  status: "Ready to move",
  locality: "Kakkanad",
  city: "Ernakulam",
  askingPrice: "18500000",
};

const errorsOf = (result: ReturnType<typeof post>) =>
  result.success ? {} : Object.fromEntries(
    result.error.issues.map((i) => [i.path.join("."), i.message]),
  );

function main() {
  // --- the three errors that made "Add property" impossible -----------------
  check("a minimal form posts cleanly", () => {
    const result = post(MINIMAL);
    assert.equal(result.success, true, JSON.stringify(errorsOf(result)));
  });

  check("an unticked checkbox is absent, not invalid", () => {
    // addressIsPublic and hasBuilding submit nothing when off. Requiring the
    // key rejected every save with the boxes clear.
    const result = post(MINIMAL);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.addressIsPublic, false);
      assert.equal(result.data.hasBuilding, false);
    }
    assert.equal(post({ ...MINIMAL, addressIsPublic: "on" }).success, true);
  });

  check("a dropdown left on the dash is empty, not invalid", () => {
    const result = post({ ...MINIMAL, landAreaUnit: "", builtUpAreaUnit: "" });
    assert.equal(result.success, true, JSON.stringify(errorsOf(result)));
  });

  check("prices and percentages survive the way people type them", () => {
    const result = post({
      ...MINIMAL,
      askingPrice: "₹1,85,00,000",
      rentalYield: "4.5 %",
    });
    assert.equal(result.success, true, JSON.stringify(errorsOf(result)));
    if (result.success) {
      assert.equal(result.data.askingPrice, 18500000);
      assert.equal(result.data.rentalYield, 4.5);
    }
    // Genuine nonsense must still be caught.
    assert.equal(post({ ...MINIMAL, rentalYield: "soon" }).success, false);
    assert.equal(post({ ...MINIMAL, askingPrice: "-5" }).success, false);
  });

  check("the cross-field rules still bite", () => {
    assert.equal(
      post({ ...MINIMAL, hasBuilding: "on" }).success,
      false,
      "a building with no built-up area must be rejected",
    );
    assert.equal(
      post({ ...MINIMAL, landArea: "5.2" }).success,
      false,
      "land area with no unit must be rejected",
    );
    assert.equal(
      post({ ...MINIMAL, kind: "commercial" }).success,
      false,
      "commercial with no commercial type must be rejected",
    );
    assert.equal(
      post({ ...MINIMAL, askingPrice: "" }).success,
      false,
      "a sale with no asking price must be rejected",
    );
    assert.equal(
      post({ ...MINIMAL, listingType: "rental", askingPrice: "" }).success,
      true,
      "a rental needs no asking price",
    );
    assert.equal(post({ ...MINIMAL, summary: "Nice." }).success, false);
  });

  // --- owner contact block --------------------------------------------------
  check("owner numbers are stored canonical, whatever was typed", () => {
    const result = post({
      ...MINIMAL,
      sellerName: "Ramesh Nair",
      sellerWhatsapp: "+91 98765 43210",
      sellerAltContact: "+971 50 123 4567",
      sellerEmail: "ramesh@example.com",
      sellerWhatsappOptIn: "on",
    });
    assert.equal(result.success, true, JSON.stringify(errorsOf(result)));
    if (!result.success) return;

    // One number written three ways has to end up as one number, or matching
    // it against a WhatsApp contact later silently fails.
    assert.equal(result.data.sellerWhatsapp, "919876543210");
    // A number that brought its own country code keeps it.
    assert.equal(result.data.sellerAltContact, "971501234567");
    assert.equal(result.data.sellerWhatsappOptIn, true);
  });

  check("consent is off unless it was actually given", () => {
    const result = post({ ...MINIMAL, sellerWhatsapp: "9876543210" });
    assert.equal(result.success, true);
    // Having someone's number is not permission to message it.
    if (result.success) assert.equal(result.data.sellerWhatsappOptIn, false);
  });

  check("a mistyped owner number is refused, not silently dropped", () => {
    // The failure this catches: an invalid number becoming `undefined` rather
    // than an error, so the field looks saved and the send fails weeks later.
    for (const bad of ["12345", "not a number", "+91 9876"]) {
      const result = post({ ...MINIMAL, sellerWhatsapp: bad });
      assert.equal(result.success, false, `"${bad}" was accepted`);
    }
    assert.equal(post({ ...MINIMAL, sellerEmail: "not-an-email" }).success, false);
    // Blank stays blank — none of these fields are required.
    const empty = post({ ...MINIMAL, sellerWhatsapp: "", sellerEmail: "" });
    assert.equal(empty.success, true, JSON.stringify(errorsOf(empty)));
  });

  check("a Server Action can carry a real photograph", () => {
    // The bug: the framework caps action bodies at 1 MB by default, while
    // validateUpload allowed 12 MB images — so every real photo was refused
    // before the action ran. These two numbers must not disagree again.
    assert.ok(
      SERVER_ACTION_BODY_LIMIT > UPLOAD_LIMITS.image,
      "a single permitted image cannot fit in an action request",
    );
    assert.ok(
      SERVER_ACTION_BODY_LIMIT >= UPLOAD_LIMITS.video,
      "a permitted video cannot fit in an action request",
    );
    assert.ok(
      SERVER_ACTION_BODY_LIMIT >= UPLOAD_LIMITS.document,
      "a permitted document cannot fit in an action request",
    );
  });

  // --- §5: SEO derived from the listing, not typed ---------------------------
  check("generated SEO fits the search box and names the place", () => {
    const seo = seoFor({ ...MINIMAL, priceLabel: priceLabelFor(18500000) });
    assert.ok(seo.seoTitle.length <= 60, `title too long: ${seo.seoTitle}`);
    assert.ok(seo.seoDescription.length <= 155, "description over 155 chars");
    assert.match(seo.seoTitle, /Arbour/);
    assert.match(seo.seoDescription, /₹1\.85Cr/);

    const rental = seoFor({ ...MINIMAL, listingType: "rental" });
    assert.match(rental.seoTitle, /for rent/);

    // A long name must be cut, not overflow, and must not end mid-word.
    const long = seoFor({ ...MINIMAL, name: "The ".repeat(30) + "Arbour" });
    assert.ok(long.seoTitle.length <= 60);
    assert.ok(long.seoTitle.endsWith("…"));
  });

  // --- §6: the spreadsheet import -------------------------------------------
  check("CSV quoting, commas, newlines and Excel's BOM", () => {
    const rows = parseCsv(
      '﻿name,summary\r\n"Villa, No. 4","Says ""calm"".\nOn two lines."\r\n\r\n',
    );
    assert.deepEqual(rows, [
      ["name", "summary"],
      ["Villa, No. 4", 'Says "calm".\nOn two lines.'],
    ]);
    // Round-trips through the writer the template uses.
    assert.deepEqual(parseCsv(toCsv(rows)), rows);
  });

  check("headers are matched loosely but unknown ones are reported", () => {
    const loose = mapHeaders(["Name", " summary ", "asking_price"]);
    assert.deepEqual(loose.fields, ["name", "summary", "askingPrice"]);

    const wrong = mapHeaders([...IMPORT_COLUMNS.map((c) => c.header), "Locallity"]);
    assert.deepEqual(wrong.unknown, ["Locallity"]);
    assert.deepEqual(wrong.missing, []);

    const short = mapHeaders(["name"]);
    assert.ok(short.missing.includes("city"), "missing required columns listed");
  });

  check("a row with only the required columns creates a property", () => {
    const header = ["name", "summary", "type", "locality", "city", "askingPrice"];
    const { fields, missing } = mapHeaders(header);
    assert.deepEqual(missing, []);

    const formData = rowToFormData(fields, [
      "The Arbour",
      "A calm four-bedroom home near the lake.",
      "3 & 4 BHK",
      "Kakkanad",
      "Ernakulam",
      "18500000",
    ]);
    const parsed = propertySchema.safeParse({
      ...Object.fromEntries(formData),
      amenities: formData.getAll("amenities").map(String),
    });
    assert.equal(parsed.success, true, JSON.stringify(errorsOf(parsed)));
    if (parsed.success) {
      // The blanks the sheet didn't carry come from the import defaults.
      assert.equal(parsed.data.kind, "residential");
      assert.equal(parsed.data.listingType, "sale");
      assert.equal(parsed.data.status, "Ready to move");
      // hasBuilding must stay off, or the row would demand a built-up area.
      assert.equal(parsed.data.hasBuilding, false);
    }
  });

  check("yes/no cells and pipe-separated amenities", () => {
    const { fields } = mapHeaders(["hasBuilding", "builtUpArea", "amenities"]);
    const on = rowToFormData(fields, ["yes", "1840", "Pool|EV charging| "]);
    assert.equal(on.get("hasBuilding"), "on");
    assert.deepEqual(on.getAll("amenities"), ["Pool", "EV charging"]);

    // "no" must append nothing at all — an empty string would be a value.
    const off = rowToFormData(fields, ["no", "", ""]);
    assert.equal(off.has("hasBuilding"), false);
  });

  check("the template's headers are the ones the importer accepts", () => {
    const [header] = templateRows();
    const { unknown, missing } = mapHeaders(header);
    assert.deepEqual(unknown, [], "template has a column the importer rejects");
    assert.deepEqual(missing, [], "template omits a required column");
    assert.equal(templateRows().length, 1, "no example row to import by mistake");
  });

  console.log(`\n${checks} checks passed`);
  if (process.exitCode) console.error("Some checks failed.");
}

main();
