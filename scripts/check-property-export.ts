/**
 * The property CSV export, checked without a database.
 *
 *   npm run check:export
 *
 * Same convention as check-whatsapp.ts: plain assertions, no framework. Three
 * things are worth holding down here — that empty columns really are dropped,
 * that finalPrice stays behind its permission, and that a file this application
 * exports can be fed back through its own importer. The last one is the claim
 * most likely to quietly stop being true.
 */
import assert from "node:assert/strict";

import { parseCsv } from "../lib/csv";
import {
  EXPORT_COLUMNS,
  buildCsv,
  exportFilename,
} from "../lib/properties.export";
import { IMPORT_COLUMNS, mapHeaders } from "../lib/validation/property-import";
import { properties } from "../lib/db/schema";
import type { SessionUser } from "../lib/auth/session";

type Row = typeof properties.$inferSelect;

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

const admin: SessionUser = {
  id: "u-admin",
  fullName: "Admin",
  email: "admin@example.com",
  role: "admin",
  permissions: [],
  mustChangePassword: false,
};

const employee: SessionUser = {
  ...admin,
  id: "u-emp",
  fullName: "Employee",
  role: "employee",
  permissions: [],
};

const employeeWithFinalPrice: SessionUser = {
  ...employee,
  permissions: ["property.final_price"],
};

/** A minimal listing: the notNull columns, everything else absent. */
const row = (over: Partial<Row> = {}): Row =>
  ({
    id: "the-arbour-kakkanad",
    name: "The Arbour",
    locality: "Kakkanad",
    city: "Ernakulam",
    type: "3 & 4 BHK residences",
    priceLabel: "1.85 Cr",
    priceValue: 185_00_00_000,
    beds: 3,
    baths: 3,
    area: "1840 sqft",
    status: "Ready to move",
    summary: "A quiet tower off the bypass.",
    amenities: [],
    details: [],
    gallery: [],
    sortOrder: 0,
    reference: "LIV-0001",
    description: null,
    kind: "residential",
    listingType: "sale",
    workflowStatus: "published",
    isPublic: true,
    publishedAt: null,
    addressLine: null,
    addressIsPublic: false,
    district: null,
    state: null,
    pincode: null,
    country: null,
    latitude: null,
    longitude: null,
    landArea: null,
    landAreaUnit: null,
    surveyNumber: null,
    roadAccess: null,
    facing: null,
    boundaryNotes: null,
    hasBuilding: true,
    builtUpArea: null,
    builtUpAreaUnit: null,
    floors: null,
    units: null,
    balconies: null,
    parking: null,
    propertyAge: null,
    furnishedStatus: null,
    commercialKind: null,
    floorNumber: null,
    occupancy: null,
    instagramUrl: null,
    suitableFor: null,
    leasePotential: null,
    askingPrice: 18_500_000,
    priceUnit: "INR",
    rentalIncome: null,
    rentalFrequency: null,
    rentalYield: null,
    finalPrice: null,
    internalNotes: null,
    sellerName: null,
    sellerContact: null,
    sellerWhatsapp: null,
    sellerAltContact: null,
    sellerEmail: null,
    sellerWhatsappOptIn: false,
    seoTitle: null,
    seoDescription: null,
    createdById: null,
    updatedById: null,
    deletedAt: null,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    updatedAt: new Date("2026-04-02T00:00:00Z"),
    ...over,
  }) as Row;

const noExtras = new Map<
  string,
  { photos: number; createdBy: string | null; updatedBy: string | null }
>();

/** Header → value, for the first data row of a built file. */
const firstRow = (csv: string): Record<string, string> => {
  const [headers, ...rest] = parseCsv(csv);
  return Object.fromEntries(headers.map((header, i) => [header, rest[0]?.[i] ?? ""]));
};

console.log("\nProperty export checks\n");

check("a column empty on every row is left out of the file", () => {
  const { csv, headers } = buildCsv([row()], noExtras, admin);
  const [headerRow] = parseCsv(csv);

  // Nothing filled these in, so they must not be columns at all.
  for (const absent of ["surveyNumber", "boundaryNotes", "rentalIncome", "occupancy"]) {
    assert.ok(!headers.includes(absent), `${absent} is empty and must be dropped`);
  }
  // The ones that were filled in must be there.
  for (const present of ["name", "locality", "city", "askingPrice", "reference"]) {
    assert.ok(headers.includes(present), `${present} has a value and must be kept`);
  }
  assert.deepEqual(headerRow, headers, "the header row must match what was reported");
});

check("one row out of many filling a column keeps that column", () => {
  // The question is whether the data exists, not whether it is common. A
  // column dropped because 399 of 400 listings leave it blank loses the one
  // listing that had something to say.
  const { headers } = buildCsv(
    [row(), row({ id: "b", surveyNumber: "Re-Sy 114/3" }), row({ id: "c" })],
    noExtras,
    admin,
  );
  assert.ok(headers.includes("surveyNumber"));
});

check("finalPrice is omitted entirely without the permission", () => {
  const withPrice = [row({ finalPrice: 17_900_000 })];

  const asEmployee = buildCsv(withPrice, noExtras, employee);
  assert.ok(
    !asEmployee.headers.includes("finalPrice"),
    "an employee without the grant must not even see the column",
  );
  assert.ok(
    !asEmployee.csv.includes("17900000"),
    "and the figure must not appear anywhere in the file",
  );

  // Omitted, not blanked: a present-but-empty column reads as "no final price
  // was agreed", which is a different and wrong statement.
  const asAdmin = buildCsv(withPrice, noExtras, admin);
  assert.ok(asAdmin.headers.includes("finalPrice"));
  assert.equal(firstRow(asAdmin.csv).finalPrice, "17900000");

  const granted = buildCsv(withPrice, noExtras, employeeWithFinalPrice);
  assert.ok(
    granted.headers.includes("finalPrice"),
    "the grant is what decides, not the role",
  );
});

check("an exported file can be read back by the importer", () => {
  // The whole reason the importable columns are generated from IMPORT_COLUMNS.
  // If this fails, somebody renamed a header on one side only and the
  // round trip is broken — which is an "unknown column" error on a file this
  // application produced itself.
  const { csv } = buildCsv(
    [
      row({
        amenities: ["Sky lounge", "Pool"],
        sellerName: "R Menon",
        description: "Long copy, with a comma.",
        landArea: 12,
        landAreaUnit: "cent",
      }),
    ],
    noExtras,
    admin,
  );

  const [headerRow] = parseCsv(csv);
  const { unknown, missing } = mapHeaders(headerRow);

  assert.deepEqual(missing, [], "every required importer column must be present");

  // The read-only columns are expected to be unknown to the importer — it
  // reports them rather than failing. Nothing importable may be in that list.
  const importableHeaders = new Set(IMPORT_COLUMNS.map((c) => c.header));
  const unexpected = unknown.filter((header) => importableHeaders.has(header));
  assert.deepEqual(
    unexpected,
    [],
    `these importable headers were not recognised: ${unexpected.join(", ")}`,
  );
});

check("values are shaped the way the importer reads them back", () => {
  const cells = firstRow(
    buildCsv(
      [
        row({
          amenities: ["Sky lounge", "Pool", "EV charging"],
          addressIsPublic: true,
          hasBuilding: true,
          sellerWhatsappOptIn: false,
          details: [
            { label: "Floor", value: "4 of 12" },
            { label: "Facing", value: "East" },
          ],
        }),
      ],
      noExtras,
      admin,
    ).csv,
  );

  // Pipe-separated, which is what IMPORT_COLUMNS documents for amenities.
  assert.equal(cells.amenities, "Sky lounge | Pool | EV charging");
  // yes/no, not true/false — TRUTHY in the importer accepts "yes".
  assert.equal(cells.addressIsPublic, "yes");
  assert.equal(cells.hasBuilding, "yes");
  assert.equal(cells.sellerWhatsappOptIn, "no");
  assert.equal(cells.details, "Floor: 4 of 12 | Facing: East");
});

check("nothing in the file ever reads as null, undefined or NaN", () => {
  const { csv } = buildCsv([row(), row({ id: "b" })], noExtras, admin);

  for (const bad of ["null", "undefined", "NaN", "[object Object]", "Invalid Date"]) {
    assert.ok(
      !csv.includes(bad),
      `"${bad}" leaked into the export — it would survive a re-import as literal text`,
    );
  }
});

check("commas and quotes in a summary do not break the row", () => {
  const { csv } = buildCsv(
    [
      row({
        summary: 'A "quiet" tower, off the bypass',
        description: "Line one\nLine two",
      }),
    ],
    noExtras,
    admin,
  );

  const parsed = parseCsv(csv);
  assert.equal(parsed.length, 2, "one header row and exactly one data row");
  const cells = firstRow(csv);
  assert.equal(cells.summary, 'A "quiet" tower, off the bypass');
  assert.equal(cells.description, "Line one\nLine two");
});

check("zero rows produce no file rather than a header-only one", () => {
  // The route answers 404 for this; buildCsv simply must not invent columns.
  const { headers, rowCount } = buildCsv([], noExtras, admin);
  assert.equal(rowCount, 0);
  assert.deepEqual(headers, [], "no rows means no columns have any data");
});

check("photo count and staff names come from the joined lookups", () => {
  const extras = new Map([
    ["the-arbour-kakkanad", { photos: 7, createdBy: "Asha", updatedBy: null }],
  ]);
  const { csv, headers } = buildCsv([row()], extras, admin);
  const cells = firstRow(csv);

  assert.equal(cells.photoCount, "7");
  assert.equal(cells.createdBy, "Asha");
  // updatedBy was null for every row, so it is dropped like any empty column.
  assert.ok(!headers.includes("updatedBy"));
});

check("every exportable column has a distinct header", () => {
  const seen = new Set<string>();
  for (const column of EXPORT_COLUMNS) {
    assert.ok(
      !seen.has(column.header),
      `${column.header} appears twice — a duplicate header makes the file ambiguous`,
    );
    seen.add(column.header);
  }
});

check("the filename says what it is and when", () => {
  assert.match(exportFilename(false), /^living-properties-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.match(
    exportFilename(true),
    /^living-properties-selected-\d{4}-\d{2}-\d{2}\.csv$/,
  );
});

console.log(`\n${checks} checks passed`);
if (process.exitCode) console.error("Some checks failed.");
