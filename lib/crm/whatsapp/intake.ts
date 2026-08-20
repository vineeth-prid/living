// Template intake: one message in, all the fields out.
//
// The question-at-a-time loop this replaces sent every answer through the
// 25-intent classifier, so a single typo ("Redeidential") derailed the whole
// sequence. On site, on a phone, that is the wrong shape entirely.
//
// Here the labels do the work the model was doing badly. Living sends a form,
// the employee fills it in and sends it back as one message, and parsing is
// label-anchored and deterministic: no model call, so there is nothing for a
// typo to derail. Values are normalised the way people actually write them —
// "85 lakh", "1.8 Cr", "1,85,00,000", "12 cents" — and an unreadable value
// fails as one named field, never as the whole reply.

import { parseAmount } from "@/lib/money";
import {
  AREA_UNITS,
  COMMERCIAL_KINDS,
  LISTING_TYPES,
  PROPERTY_KINDS,
} from "@/lib/db/schema";

export type FieldKind = "text" | "int" | "money" | "area" | "enum" | "config";

export type IntakeField = {
  /** Entity key the parsed value lands on. */
  key: string;
  /** Shown to the employee and matched against their reply. */
  label: string;
  /** The text after the colon in the sent form. */
  hint?: string;
  kind: FieldKind;
  options?: readonly string[];
  required?: boolean;
  /** Required only in some shapes — price is not, for a rental-only listing. */
  requiredWhen?: (values: Record<string, unknown>) => boolean;
  /** Area fields that are always one unit, e.g. built-up area in sqft. */
  fixedUnit?: (typeof AREA_UNITS)[number];
  /** Where the unit of an area field is written. */
  unitKey?: string;
};

export type IntakeForm = {
  id: string;
  /** Sent above the field list. */
  intro: string;
  fields: IntakeField[];
};

/**
 * Carried on the parked entities so the next message knows it is a form reply
 * rather than a new instruction. Underscored like the `batch` envelope a
 * confirmation carries, and stripped the same way.
 */
export type IntakeState = {
  /** Id of the form the conversation is waiting on. */
  __intake?: string;
  /** Whether the full form has been sent, so a re-ask can be partial. */
  __formSent?: boolean;
};

export type ParsedForm = {
  values: Record<string, unknown>;
  /** Labels that were given but could not be read, e.g. "Price: soon". */
  unreadable: { label: string; given: string }[];
};

// --- text helpers ---------------------------------------------------------

/** Comparison form: case, spacing and punctuation are not signal in a label. */
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Levenshtein distance. Only ever runs over short labels and enum values, and
 * the result is only ever compared against a small ceiling.
 */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** How much misspelling to forgive: more for longer words, never more than 3. */
const tolerance = (s: string) => Math.min(3, Math.floor(s.length / 4) + 1);

function closest(input: string, candidates: readonly string[]): string | null {
  const needle = key(input);
  if (!needle) return null;

  const exact = candidates.find((c) => key(c) === needle);
  if (exact) return exact;

  // "resid" for "residential", "sq ft" written into "sqft".
  const prefix = candidates.filter(
    (c) => key(c).startsWith(needle) || needle.startsWith(key(c)),
  );
  if (prefix.length === 1) return prefix[0];

  let best: string | null = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const score = distance(needle, key(candidate));
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best !== null && bestScore <= tolerance(needle) ? best : null;
}

// --- value normalisers ----------------------------------------------------

/**
 * Money lives in lib/money.ts: the admin form, the CRM and this form all have
 * to read "85L" the same way, and two parsers would drift.
 */
export const parseMoney = (input: string): number | null => parseAmount(input);

const UNIT_WORDS: Record<string, (typeof AREA_UNITS)[number]> = {
  cent: "cent",
  cents: "cent",
  acre: "acre",
  acres: "acre",
  sqft: "sqft",
  sqfeet: "sqft",
  squarefeet: "sqft",
  sft: "sqft",
  sqm: "sqm",
  squaremetres: "sqm",
  squaremeters: "sqm",
};

export function parseArea(
  input: string,
  fixedUnit?: (typeof AREA_UNITS)[number],
): { value: number; unit: (typeof AREA_UNITS)[number] } | null {
  const text = input.trim();
  if (!text) return null;

  const numeric = text.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!numeric) return null;
  const value = Number(numeric[0]);
  if (!Number.isFinite(value) || value < 0) return null;

  const unitText = key(text.replace(/[\d.,]/g, ""));
  const unit = unitText
    ? (UNIT_WORDS[unitText] ?? closestUnit(unitText))
    : null;

  // An explicit unit wins over the fixed one: "Built-up area: 12 cents" is a
  // mistake worth reading correctly rather than silently filing as sqft.
  const resolved = unit ?? fixedUnit;
  if (!resolved) return null;
  return { value, unit: resolved };
}

function closestUnit(text: string): (typeof AREA_UNITS)[number] | null {
  const match = closest(text, Object.keys(UNIT_WORDS));
  return match ? UNIT_WORDS[match] : null;
}

export function parseWholeNumber(input: string): number | null {
  const match = input.replace(/,/g, "").match(/-?\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/** "3 BHK villa" is both the configuration text and the bedroom count. */
export function bedsFrom(config: string): number | null {
  const match = config.match(/(\d+)\s*(bhk|bed)/i);
  return match ? Number(match[1]) : null;
}

// --- rendering ------------------------------------------------------------

export function renderForm(form: IntakeForm): string {
  const lines = form.fields.map((f) =>
    f.hint ? `${f.label}: ${f.hint}` : `${f.label}:`,
  );
  return `${form.intro}\n\n${lines.join("\n")}`;
}

// --- parsing --------------------------------------------------------------

/**
 * Reads a filled-in form.
 *
 * Tolerant of what a person actually sends back: blank lines, lines left with
 * the hint still on them, labels retyped slightly differently, and prose either
 * side. A single-field form also accepts a bare answer with no label at all,
 * which is what "residential" is.
 */
export function parseForm(form: IntakeForm, reply: string): ParsedForm {
  const values: Record<string, unknown> = {};
  const unreadable: { label: string; given: string }[] = [];
  const byLabel = new Map(form.fields.map((f) => [key(f.label), f]));
  const labels = form.fields.map((f) => f.label);

  let matchedAny = false;

  for (const rawLine of reply.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const split = line.indexOf(":");
    if (split === -1) continue;

    const labelText = line.slice(0, split);
    const given = line.slice(split + 1).trim();

    let field = byLabel.get(key(labelText));
    if (!field) {
      const match = closest(labelText, labels);
      if (match) field = byLabel.get(key(match));
    }
    if (!field) continue;

    matchedAny = true;

    // Left untouched: the hint is still sitting there as the value.
    if (!given || (field.hint && key(given) === key(field.hint))) continue;

    assign(values, field, given, unreadable);
  }

  // A one-field form answered bare: "residential", not "Type: residential".
  if (!matchedAny && form.fields.length === 1) {
    const given = reply.trim();
    if (given) assign(values, form.fields[0], given, unreadable);
  }

  return { values, unreadable };
}

function assign(
  values: Record<string, unknown>,
  field: IntakeField,
  given: string,
  unreadable: { label: string; given: string }[],
) {
  const fail = () => {
    unreadable.push({ label: field.label, given });
  };

  switch (field.kind) {
    case "text":
      values[field.key] = given;
      return;

    case "config": {
      values[field.key] = given;
      const beds = bedsFrom(given);
      if (beds !== null && values.beds === undefined) values.beds = beds;
      return;
    }

    case "int": {
      const value = parseWholeNumber(given);
      if (value === null) fail();
      else values[field.key] = value;
      return;
    }

    case "money": {
      const value = parseMoney(given);
      if (value === null) fail();
      else values[field.key] = value;
      return;
    }

    case "area": {
      const area = parseArea(given, field.fixedUnit);
      if (!area) {
        fail();
        return;
      }
      values[field.key] = area.value;
      if (field.unitKey) values[field.unitKey] = area.unit;
      return;
    }

    case "enum": {
      const match = closest(given, field.options ?? []);
      if (match === null) fail();
      else values[field.key] = match;
      return;
    }
  }
}

/** Fields that are required in this shape and still have no value. */
export function missingRequired(
  form: IntakeForm,
  values: Record<string, unknown>,
): IntakeField[] {
  return form.fields.filter((f) => {
    if (values[f.key] !== undefined) return false;
    if (f.requiredWhen) return f.requiredWhen(values);
    return Boolean(f.required);
  });
}

/** Asks again for only what is outstanding, never for a full resend. */
export function reaskFor(fields: IntakeField[]): string {
  const lines = fields.map((f) => (f.hint ? `${f.label}: ${f.hint}` : `${f.label}:`));
  const opener =
    fields.length === 1
      ? "Almost there — I still need this one:"
      : `Almost there — I still need ${fields.length} of them:`;
  return `${opener}\n\n${lines.join("\n")}`;
}

// --- the forms ------------------------------------------------------------

const INTRO =
  "Reply with this filled in, one line per field. Leave a line blank if it doesn't apply.";

const STATUSES = ["Ready to move", "Under construction", "New launch"] as const;

const common: IntakeField[] = [
  {
    key: "listingType",
    label: "Listing type",
    hint: "sale, rental, or both",
    kind: "enum",
    options: LISTING_TYPES,
    required: true,
  },
  { key: "locality", label: "Locality", kind: "text", required: true },
  { key: "city", label: "City", kind: "text", required: true },
  {
    key: "configuration",
    label: "Configuration",
    hint: "e.g. 3 BHK villa",
    kind: "config",
    required: true,
  },
  {
    key: "status",
    label: "Status",
    hint: "ready to move / under construction / new launch",
    kind: "enum",
    options: STATUSES,
    required: true,
  },
  {
    key: "amount",
    label: "Price",
    hint: "required unless rental only",
    kind: "money",
    // A rental-only listing has no asking price, and demanding one would mean
    // inventing a number to get past the form.
    requiredWhen: (v) => v.listingType !== "rental",
  },
];

const areas: IntakeField[] = [
  {
    key: "landArea",
    label: "Land area",
    hint: "e.g. 12 cents — leave blank if none",
    kind: "area",
    unitKey: "landAreaUnit",
  },
  {
    key: "builtUpArea",
    label: "Built-up area",
    hint: "e.g. 1800 sqft — required if there's a building",
    kind: "area",
    fixedUnit: "sqft",
  },
];

/** The one question everything else branches on. */
export const PROPERTY_KIND_FORM: IntakeForm = {
  id: "property.kind",
  intro: "Sure — first, is this residential or commercial?",
  fields: [
    {
      key: "propertyKind",
      label: "Type",
      kind: "enum",
      options: PROPERTY_KINDS,
      required: true,
    },
  ],
};

const instagram: IntakeField = {
  key: "instagramUrl",
  label: "Instagram",
  hint: "link to the reel or post — leave blank if none",
  kind: "text",
};

export const RESIDENTIAL_FORM: IntakeForm = {
  id: "property.residential",
  intro: INTRO,
  fields: [
    ...common,
    { key: "beds", label: "Bedrooms", kind: "int" },
    { key: "baths", label: "Bathrooms", kind: "int" },
    ...areas,
    instagram,
  ],
};

export const COMMERCIAL_FORM: IntakeForm = {
  id: "property.commercial",
  intro: INTRO,
  fields: [
    ...common,
    {
      key: "commercialKind",
      label: "Commercial type",
      hint: "office, retail, warehouse, land, building, or other",
      kind: "enum",
      options: COMMERCIAL_KINDS,
      required: true,
    },
    ...areas,
    instagram,
  ],
};

/**
 * The same mechanism for the other multi-field command. Anything with more
 * than a couple of required fields belongs here rather than in a question loop.
 */
export const LEAD_FORM: IntakeForm = {
  id: "lead",
  intro: INTRO,
  fields: [
    { key: "leadName", label: "Name", kind: "text", required: true },
    { key: "mobile", label: "Mobile", kind: "text", required: true },
    { key: "email", label: "Email", kind: "text" },
    { key: "city", label: "City", kind: "text" },
    {
      key: "propertyQuery",
      label: "Looking for",
      hint: "e.g. 3 BHK in Kakkanad under 90 lakh",
      kind: "text",
    },
    { key: "note", label: "Note", kind: "text" },
  ],
};

const FORMS = [
  PROPERTY_KIND_FORM,
  RESIDENTIAL_FORM,
  COMMERCIAL_FORM,
  LEAD_FORM,
];

export const formById = (id: string): IntakeForm | null =>
  FORMS.find((f) => f.id === id) ?? null;
