import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import { properties, propertyMedia, users } from "./db/schema";
import { toCsv } from "./csv";
import { IMPORT_COLUMNS } from "./validation/property-import";
import { PERMISSIONS, type Permission } from "./auth/constants";
import { can } from "./auth/dal";
import type { SessionUser } from "./auth/session";
import type { PropertyFilters } from "./properties.admin";

// §E1–E6. Properties out, as a spreadsheet.
//
// Two rules shape this file.
//
// The first: the importable columns come from IMPORT_COLUMNS, in that order, so
// an export can be edited in Excel and fed straight back through Import CSV. A
// second hand-written list of headers would drift from the importer within a
// sprint, and the symptom would be an "unknown column" error on a file this
// application produced itself.
//
// The second: a column that is empty for every exported row is dropped
// entirely. A listing has seventy-odd fields and a typical one fills twenty;
// keeping the rest would hand somebody a sheet they have to scroll sideways
// through to find the eight columns that actually say something.

type ExportColumn = {
  header: string;
  /** Rendered value, or "" when there is nothing to say. */
  value: (row: Row, extra: Extra) => string;
  /** Omitted from the file entirely unless the viewer holds this. */
  permission?: Permission;
};

type Row = typeof properties.$inferSelect;
type Extra = { photos: number; createdBy: string | null; updatedBy: string | null };

// --- formatting -----------------------------------------------------------
//
// Everything here answers "" for absent rather than "null", "undefined" or "0".
// A cell reading "null" is worse than a blank one: it survives a round trip
// through the importer as the literal text.

const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

const num = (value: number | null): string =>
  value === null || value === undefined ? "" : String(value);

/** Booleans as the importer reads them back, not as "true"/"false". */
const yesNo = (value: boolean | null): string => (value ? "yes" : "no");

/** The pipe is what IMPORT_COLUMNS documents for amenities, so it round-trips. */
const list = (value: string[] | null): string =>
  (value ?? []).filter(Boolean).join(" | ");

const date = (value: Date | null): string =>
  value ? value.toISOString().slice(0, 10) : "";

/** `details` is [{label, value}] — flattened to "Label: value | Label: value". */
const detailPairs = (value: Row["details"]): string =>
  (value ?? [])
    .filter((detail) => detail?.label || detail?.value)
    .map((detail) => `${detail.label}: ${detail.value}`)
    .join(" | ");

/**
 * Every field the importer accepts, in the importer's own order.
 *
 * The lookup is by field name, so adding a column to IMPORT_COLUMNS puts it in
 * the export automatically — as a plain string unless it needs shaping, which
 * is the right default for the text fields that make up most of the list.
 */
const SHAPED: Record<string, (row: Row) => string> = {
  amenities: (row) => list(row.amenities),
  addressIsPublic: (row) => yesNo(row.addressIsPublic),
  hasBuilding: (row) => yesNo(row.hasBuilding),
  sellerWhatsappOptIn: (row) => yesNo(row.sellerWhatsappOptIn),
  askingPrice: (row) => num(row.askingPrice),
  rentalIncome: (row) => num(row.rentalIncome),
  rentalYield: (row) => num(row.rentalYield),
  landArea: (row) => num(row.landArea),
  builtUpArea: (row) => num(row.builtUpArea),
  latitude: (row) => num(row.latitude),
  longitude: (row) => num(row.longitude),
  floors: (row) => num(row.floors),
  units: (row) => num(row.units),
  beds: (row) => num(row.beds),
  baths: (row) => num(row.baths),
  balconies: (row) => num(row.balconies),
};

const importable: ExportColumn[] = IMPORT_COLUMNS.map((column) => ({
  header: column.header,
  value: (row) => {
    const shape = SHAPED[column.field];
    if (shape) return shape(row);
    return text((row as unknown as Record<string, unknown>)[column.field]);
  },
}));

/**
 * The rest of what a listing holds: generated, derived and workflow columns.
 *
 * These are deliberately after the importable ones and the importer ignores
 * them — it reports unknown headers rather than failing, so a file exported and
 * re-imported keeps working. They are here because "export all the data" means
 * the reference and the status too, not just the fields someone can type in.
 */
const readOnly: ExportColumn[] = [
  { header: "reference", value: (row) => text(row.reference) },
  { header: "id", value: (row) => text(row.id) },
  { header: "workflowStatus", value: (row) => text(row.workflowStatus) },
  { header: "isPublic", value: (row) => yesNo(row.isPublic) },
  { header: "publishedAt", value: (row) => date(row.publishedAt) },
  { header: "priceValue", value: (row) => num(row.priceValue) },
  { header: "priceUnit", value: (row) => text(row.priceUnit) },
  {
    header: "finalPrice",
    value: (row) => num(row.finalPrice),
    // §9. The one column in this file behind a permission, exactly as it is on
    // the property page. Omitted from the header row too, not blanked — a
    // present-but-empty column reads as "no final price agreed", which is a
    // different and wrong statement.
    permission: PERMISSIONS.propertyFinalPrice,
  },
  { header: "instagramUrl", value: (row) => text(row.instagramUrl) },
  { header: "seoTitle", value: (row) => text(row.seoTitle) },
  { header: "seoDescription", value: (row) => text(row.seoDescription) },
  { header: "details", value: (row) => detailPairs(row.details) },
  { header: "galleryPaths", value: (row) => list(row.gallery) },
  { header: "photoCount", value: (_row, extra) => (extra.photos ? String(extra.photos) : "") },
  { header: "sortOrder", value: (row) => (row.sortOrder ? String(row.sortOrder) : "") },
  { header: "createdBy", value: (_row, extra) => text(extra.createdBy) },
  { header: "updatedBy", value: (_row, extra) => text(extra.updatedBy) },
  { header: "createdAt", value: (row) => date(row.createdAt) },
  { header: "updatedAt", value: (row) => date(row.updatedAt) },
];

export const EXPORT_COLUMNS: ExportColumn[] = [...importable, ...readOnly];

// --- the query ------------------------------------------------------------

/**
 * The rows to export.
 *
 * Takes either the list page's filters or an explicit set of ids, and applies
 * the same `deletedAt is null` the list does — a soft-deleted listing is not
 * part of "all properties", and nobody expects a deleted record to reappear in
 * a spreadsheet they are about to send someone.
 *
 * Unpaginated by design, and capped instead. The whole point is one file with
 * everything in it.
 */
export async function exportRows({
  filters,
  ids,
  limit = MAX_EXPORT,
}: {
  filters?: PropertyFilters;
  ids?: string[];
  limit?: number;
}) {
  const f = filters ?? {};

  const where = and(
    isNull(properties.deletedAt),
    // An explicit selection wins over the filters: the operator ticked those
    // rows, and silently intersecting the two would produce a file missing
    // listings they can see ticked on screen.
    ids && ids.length > 0
      ? inArray(properties.id, ids.slice(0, limit))
      : and(
          f.status && f.status !== "all"
            ? eq(properties.workflowStatus, f.status)
            : undefined,
          f.kind ? eq(properties.kind, f.kind as "residential") : undefined,
          f.listingType
            ? eq(properties.listingType, f.listingType as "sale")
            : undefined,
          f.city ? ilike(properties.city, `%${f.city}%`) : undefined,
          f.q
            ? or(
                ilike(properties.name, `%${f.q}%`),
                ilike(properties.reference, `%${f.q}%`),
                ilike(properties.locality, `%${f.q}%`),
                ilike(properties.city, `%${f.q}%`),
              )
            : undefined,
        ),
  );

  const rows = await db()
    .select()
    .from(properties)
    .where(where)
    .orderBy(asc(properties.reference), desc(properties.createdAt))
    .limit(limit);

  if (rows.length === 0) return { rows: [], extras: new Map<string, Extra>() };

  const rowIds = rows.map((row) => row.id);

  // Two grouped lookups for the whole file rather than per row — the N+1
  // version of this is a query per listing, and the export exists to be run
  // over every listing at once.
  const [photoCounts, staff] = await Promise.all([
    db()
      .select({
        propertyId: propertyMedia.propertyId,
        photos: sql<number>`count(*)::int`,
      })
      .from(propertyMedia)
      .where(inArray(propertyMedia.propertyId, rowIds))
      .groupBy(propertyMedia.propertyId),
    db().select({ id: users.id, fullName: users.fullName }).from(users),
  ]);

  const photosById = new Map(photoCounts.map((c) => [c.propertyId, c.photos]));
  const nameById = new Map(staff.map((person) => [person.id, person.fullName]));

  const extras = new Map<string, Extra>(
    rows.map((row) => [
      row.id,
      {
        photos: photosById.get(row.id) ?? 0,
        createdBy: row.createdById ? (nameById.get(row.createdById) ?? null) : null,
        updatedBy: row.updatedById ? (nameById.get(row.updatedById) ?? null) : null,
      },
    ]),
  );

  return { rows, extras };
}

/**
 * A ceiling on one file.
 *
 * Generous — this is a property business, not a marketplace — but present, so
 * an export cannot become the thing that holds a connection open and runs the
 * server out of memory building one enormous string.
 */
export const MAX_EXPORT = Number(process.env.PROPERTY_EXPORT_MAX ?? 5_000);

// --- the file -------------------------------------------------------------

/**
 * Rows → CSV, with the empty columns dropped.
 *
 * Returns the column headers it kept as well as the text, so the caller can
 * record what was actually handed over. An export that quietly contained the
 * seller's phone number is worth being able to prove or disprove later.
 */
export function buildCsv(
  rows: Row[],
  extras: Map<string, Extra>,
  viewer: SessionUser,
): { csv: string; headers: string[]; rowCount: number } {
  const allowed = EXPORT_COLUMNS.filter(
    (column) => !column.permission || can(viewer, column.permission),
  );

  const empty: Extra = { photos: 0, createdBy: null, updatedBy: null };

  // Every cell, computed once. Deciding which columns to keep needs the whole
  // grid anyway, so computing it twice would be the only alternative.
  const grid = rows.map((row) =>
    allowed.map((column) => column.value(row, extras.get(row.id) ?? empty)),
  );

  // §E3. Drop a column only when it is empty for every row in this file. A
  // column is kept if one listing out of four hundred fills it, which is right:
  // the question is whether the data exists, not whether it is common.
  const keep = allowed
    .map((_column, index) => index)
    .filter((index) => grid.some((cells) => cells[index] !== ""));

  const headers = keep.map((index) => allowed[index].header);

  return {
    csv: toCsv([headers, ...grid.map((cells) => keep.map((index) => cells[index]))]),
    headers,
    rowCount: rows.length,
  };
}

/** "living-properties-2026-10-02.csv", or a selection-specific name. */
export function exportFilename(selected: boolean): string {
  const today = new Date().toISOString().slice(0, 10);
  return `living-properties${selected ? "-selected" : ""}-${today}.csv`;
}
