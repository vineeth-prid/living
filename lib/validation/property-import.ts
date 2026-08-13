import { AREA_UNITS, COMMERCIAL_KINDS } from "@/lib/db/schema";

// Spreadsheet → the same FormData shape the Add-property form posts, so bulk
// import and the form go through one validation path and one insert. Nothing
// here writes to the database; it only translates a row.

type Column = {
  /** Header in the sheet. Matching is case- and space-insensitive. */
  header: string;
  /** Field on propertySchema. */
  field: string;
  required?: boolean;
  hint: string;
};

/**
 * The template's columns, in order. Only the six marked required have to be
 * filled in — a row with just those becomes a draft listing, which is the
 * point: the rest can be finished in the panel afterwards.
 */
export const IMPORT_COLUMNS: Column[] = [
  { header: "name", field: "name", required: true, hint: "The Arbour" },
  { header: "summary", field: "summary", required: true, hint: "One or two lines for the card (10 characters or more)" },
  { header: "type", field: "type", required: true, hint: "3 & 4 BHK residences" },
  { header: "locality", field: "locality", required: true, hint: "Kakkanad" },
  { header: "city", field: "city", required: true, hint: "Ernakulam" },
  { header: "askingPrice", field: "askingPrice", required: true, hint: "18500000 — may be left blank only when listingType is rental" },
  { header: "kind", field: "kind", hint: "residential (default) or commercial" },
  { header: "listingType", field: "listingType", hint: "sale (default), rental or both" },
  { header: "status", field: "status", hint: "Ready to move (default), Under construction or New launch" },
  { header: "description", field: "description", hint: "Long copy for the listing page" },
  { header: "priceLabel", field: "priceLabel", hint: "Blank generates it from askingPrice" },
  { header: "rentalIncome", field: "rentalIncome", hint: "Rupees" },
  { header: "rentalFrequency", field: "rentalFrequency", hint: "monthly, quarterly or yearly" },
  { header: "rentalYield", field: "rentalYield", hint: "Percent, e.g. 4.5" },
  { header: "addressLine", field: "addressLine", hint: "" },
  { header: "addressIsPublic", field: "addressIsPublic", hint: "yes / no (default no)" },
  { header: "district", field: "district", hint: "" },
  { header: "state", field: "state", hint: "Kerala if blank" },
  { header: "pincode", field: "pincode", hint: "6 digits" },
  { header: "country", field: "country", hint: "India if blank" },
  { header: "latitude", field: "latitude", hint: "9.9816" },
  { header: "longitude", field: "longitude", hint: "76.2999" },
  { header: "landArea", field: "landArea", hint: "Needs landAreaUnit alongside it" },
  { header: "landAreaUnit", field: "landAreaUnit", hint: AREA_UNITS.join(" / ") },
  { header: "surveyNumber", field: "surveyNumber", hint: "" },
  { header: "roadAccess", field: "roadAccess", hint: "30 ft tarred" },
  { header: "facing", field: "facing", hint: "East / North-east" },
  { header: "boundaryNotes", field: "boundaryNotes", hint: "" },
  { header: "hasBuilding", field: "hasBuilding", hint: "yes / no (default no). yes requires builtUpArea" },
  { header: "builtUpArea", field: "builtUpArea", hint: "1840" },
  { header: "builtUpAreaUnit", field: "builtUpAreaUnit", hint: `${AREA_UNITS.join(" / ")} — sqft if blank` },
  { header: "area", field: "area", hint: "Free-text area shown on the card" },
  { header: "floors", field: "floors", hint: "" },
  { header: "units", field: "units", hint: "" },
  { header: "beds", field: "beds", hint: "" },
  { header: "baths", field: "baths", hint: "" },
  { header: "balconies", field: "balconies", hint: "" },
  { header: "parking", field: "parking", hint: "2 covered" },
  { header: "propertyAge", field: "propertyAge", hint: "New / 5 years" },
  { header: "furnishedStatus", field: "furnishedStatus", hint: "Unfurnished / Semi-furnished / Fully furnished" },
  { header: "amenities", field: "amenities", hint: "Separate with | — Sky lounge|Pool|EV charging" },
  { header: "commercialKind", field: "commercialKind", hint: `${COMMERCIAL_KINDS.join(" / ")} — required when kind is commercial` },
  { header: "floorNumber", field: "floorNumber", hint: "" },
  { header: "occupancy", field: "occupancy", hint: "Vacant / tenanted" },
  { header: "suitableFor", field: "suitableFor", hint: "" },
  { header: "leasePotential", field: "leasePotential", hint: "" },
  { header: "sellerName", field: "sellerName", hint: "Internal — never shown publicly" },
  { header: "sellerContact", field: "sellerContact", hint: "Internal — never shown publicly" },
  { header: "internalNotes", field: "internalNotes", hint: "Internal — never shown publicly" },
];

/** Blank cells that stand in for "the usual", so a minimal row still validates. */
const DEFAULTS: Record<string, string> = {
  kind: "residential",
  listingType: "sale",
  status: "Ready to move",
  builtUpAreaUnit: "sqft",
};

const normalise = (header: string) =>
  header.trim().toLowerCase().replace(/[\s_-]/g, "");

const TRUTHY = ["yes", "y", "true", "1", "on"];

/**
 * Maps the header row to schema fields. Unknown columns are reported rather
 * than silently ignored — a misspelt "Locality " is otherwise indistinguishable
 * from a listing where nobody filled the locality in.
 */
export function mapHeaders(headerRow: string[]): {
  fields: (string | null)[];
  unknown: string[];
  missing: string[];
} {
  const byHeader = new Map(
    IMPORT_COLUMNS.map((c) => [normalise(c.header), c.field]),
  );
  const fields = headerRow.map((h) => byHeader.get(normalise(h)) ?? null);
  const unknown = headerRow.filter((h, i) => h.trim() && fields[i] === null);
  const present = new Set(fields.filter(Boolean));
  const missing = IMPORT_COLUMNS.filter(
    (c) => c.required && !present.has(c.field),
  ).map((c) => c.header);
  return { fields, unknown, missing };
}

/**
 * One spreadsheet row → FormData identical to what the Add-property form
 * posts. Going through FormData rather than straight to an insert is the whole
 * trick: the import inherits every rule, default and permission check the form
 * already has, and can't drift from them.
 */
export function rowToFormData(
  fields: (string | null)[],
  row: string[],
): FormData {
  const values: Record<string, string> = {};
  fields.forEach((field, i) => {
    const cell = (row[i] ?? "").trim();
    if (field && cell) values[field] = cell;
  });

  const formData = new FormData();
  for (const column of IMPORT_COLUMNS) {
    const value = values[column.field] ?? DEFAULTS[column.field] ?? "";

    if (column.field === "amenities") {
      // One entry per part, matching the textarea's one-per-line convention.
      for (const item of value.split(/[|\n;]/).map((v) => v.trim()).filter(Boolean)) {
        formData.append("amenities", item);
      }
      continue;
    }

    if (column.field === "addressIsPublic" || column.field === "hasBuilding") {
      // Checkboxes: an untouched one submits nothing at all, so a "no" cell
      // has to append nothing rather than an empty string.
      if (TRUTHY.includes(value.toLowerCase())) formData.set(column.field, "on");
      continue;
    }

    formData.set(column.field, value);
  }
  return formData;
}

/**
 * The template offered for download: the header row alone. An example row
 * would be imported as a property by anyone who forgot to delete it, so the
 * guidance lives on the import page instead.
 */
export function templateRows(): string[][] {
  return [IMPORT_COLUMNS.map((c) => c.header)];
}
