import { z } from "zod";
import { normalisePhone } from "@/lib/phone";
import { formatAmount, parseAmount } from "@/lib/money";
import {
  AREA_UNITS,
  COMMERCIAL_KINDS,
  LISTING_TYPES,
  PROPERTY_KINDS,
} from "@/lib/db/schema";

// One schema, used by the server action. The form's conditional fields (§43)
// mean most things are optional at the field level; the cross-field rules that
// actually matter are enforced in the refinements at the bottom, so a hidden
// input can't be smuggled past them.

/** "" → undefined. HTML forms submit empty strings, not nulls. */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

/**
 * Numbers as people actually type them here: "₹1,85,00,000", "4.5 %", "1 840".
 * Rejecting those was reading as "Enter a number." on a field that plainly
 * held one, so the currency, grouping and unit noise is stripped first.
 */
const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v) => {
    const cleaned = v?.replace(/[₹,%\s]/g, "");
    return cleaned ? Number(cleaned) : undefined;
  })
  .refine((v) => v === undefined || Number.isFinite(v), "Enter a number.")
  .refine((v) => v === undefined || v >= 0, "Can't be negative.");

/**
 * Money, typed the way people type it: "85L", "85 lakh", "8500000",
 * "₹85,00,000". Kept separate from optionalNumber because a unit suffix means
 * something here and nothing on a bedroom count.
 */
const optionalAmount = z
  .string()
  .trim()
  .optional()
  // null means "given, and not an amount" — distinct from undefined, which
  // means "not given". Collapsing them would drop a typo silently.
  .transform((v) => (v ? (parseAmount(v) ?? null) : undefined))
  .refine((v) => v !== null, "Enter an amount — 85L, 85 lakh or 8500000.")
  .transform((v) => v ?? undefined);

const optionalInt = optionalNumber.refine(
  (v) => v === undefined || Number.isInteger(v),
  "Enter a whole number.",
);

/**
 * An unchecked box submits nothing at all, so the key is simply absent from
 * the FormData — which is not the same as present-and-undefined. Without the
 * trailing .optional() every save with the box unticked failed on a field the
 * form never showed as invalid.
 */
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.null()])
  .optional()
  .transform((v) => v === "on" || v === "true");

/**
 * A phone number, normalised to E.164 digits without the plus.
 *
 * A country code is always applied: a bare ten-digit number gets Living's
 * default, anything already carrying its own keeps it. Rejecting what cannot
 * be a number beats storing a typo that fails silently at dial time.
 */
const optionalPhone = z
  .string()
  .trim()
  .optional()
  // null means "given, and not a phone number" — distinct from undefined,
  // which means "not given". Collapsing the two would drop a typo silently.
  .transform((v) => (v ? (normalisePhone(v)?.phoneNumber ?? null) : undefined))
  .refine(
    (v) => v !== null,
    "That doesn't look like a phone number — include the country code.",
  )
  .transform((v) => v ?? undefined);

/**
 * A `<select>` whose placeholder option is "—" submits "", which no enum
 * accepts. Same shape as optionalText, for enum-backed dropdowns.
 */
/**
 * A link. People paste "instagram.com/p/xyz" as often as the full URL, so a
 * missing scheme is added rather than rejected.
 */
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) =>
    v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : undefined,
  )
  .refine(
    (v) => v === undefined || /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(v),
    "Enter a valid link.",
  );

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .enum(values)
    .or(z.literal(""))
    .optional()
    .transform((v) => (v ? (v as T[number]) : undefined));

export const propertySchema = z
  .object({
    name: z.string().trim().min(3, "Give the property a title."),
    summary: z
      .string()
      .trim()
      .min(10, "Summary needs at least 10 characters — it's the card copy."),
    description: optionalText,
    kind: z.enum(PROPERTY_KINDS),
    listingType: z.enum(LISTING_TYPES),
    type: z.string().trim().min(2, "Describe the configuration."),
    status: z.enum(["Ready to move", "Under construction", "New launch"]),

    // Location
    locality: z.string().trim().min(2, "Locality is required."),
    city: z.string().trim().min(2, "City is required."),
    addressLine: optionalText,
    addressIsPublic: checkbox,
    district: optionalText,
    state: optionalText,
    pincode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Indian PIN codes are 6 digits.")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    country: optionalText,
    latitude: optionalNumber.refine(
      (v) => v === undefined || (v >= -90 && v <= 90),
      "Latitude must be between -90 and 90.",
    ),
    longitude: optionalNumber.refine(
      (v) => v === undefined || (v >= -180 && v <= 180),
      "Longitude must be between -180 and 180.",
    ),

    // Land
    landArea: optionalNumber,
    landAreaUnit: optionalEnum(AREA_UNITS),
    surveyNumber: optionalText,
    roadAccess: optionalText,
    facing: optionalText,
    boundaryNotes: optionalText,

    // Building
    hasBuilding: checkbox,
    builtUpArea: optionalNumber,
    builtUpAreaUnit: optionalEnum(AREA_UNITS),
    floors: optionalInt,
    units: optionalInt,
    beds: optionalInt,
    baths: optionalInt,
    balconies: optionalInt,
    parking: optionalText,
    propertyAge: optionalText,
    furnishedStatus: optionalText,
    area: optionalText,
    amenities: z.array(z.string().trim().min(1)).default([]),

    // Commercial
    commercialKind: optionalEnum(COMMERCIAL_KINDS),
    floorNumber: optionalText,
    occupancy: optionalText,
    instagramUrl: optionalUrl,
    suitableFor: optionalText,
    leasePotential: optionalText,

    // Financial
    askingPrice: optionalAmount,
    priceLabel: optionalText,
    priceUnit: optionalText,
    rentalIncome: optionalAmount,
    rentalFrequency: optionalText,
    rentalYield: optionalNumber,
    // Internal. Whether this is even accepted is checked against the actor's
    // permission in the action — the schema only shapes it.
    finalPrice: optionalAmount,
    internalNotes: optionalText,
    sellerName: optionalText,
    sellerContact: optionalText,
    // Stored canonical so one number written three ways is still one number.
    sellerWhatsapp: optionalPhone,
    sellerAltContact: optionalPhone,
    sellerEmail: z
      .string()
      .trim()
      .email("Enter a valid email.")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    sellerWhatsappOptIn: checkbox,
    // No seoTitle/seoDescription: they're derived by seoFor() below.
  })
  .refine(
    (v) => v.listingType === "rental" || v.askingPrice !== undefined,
    { message: "An asking price is required for a sale.", path: ["askingPrice"] },
  )
  .refine((v) => !v.hasBuilding || v.builtUpArea !== undefined, {
    message: "Built-up area is required when there's a building.",
    path: ["builtUpArea"],
  })
  .refine(
    (v) => v.kind !== "commercial" || v.commercialKind !== undefined,
    { message: "Choose a commercial property type.", path: ["commercialKind"] },
  )
  .refine((v) => v.landArea === undefined || v.landAreaUnit !== undefined, {
    message: "Choose a unit for the land area.",
    path: ["landAreaUnit"],
  });

export type PropertyInput = z.infer<typeof propertySchema>;

/**
 * Extra bar a listing must clear to go live (§11). Draft-time validation is
 * deliberately looser — half-entered records are the point of a draft.
 */
export function publishBlockers(p: {
  name: string;
  summary: string;
  city: string;
  locality: string;
  priceLabel: string | null;
  askingPrice: number | null;
  listingType: string;
  mediaCount: number;
}): string[] {
  const blockers: string[] = [];
  if (!p.name?.trim()) blockers.push("Add a property title.");
  if (!p.summary?.trim()) blockers.push("Add a summary — it's the card copy.");
  if (!p.city?.trim() || !p.locality?.trim()) blockers.push("Add the location.");
  if (p.listingType !== "rental" && !p.askingPrice) {
    blockers.push("Add an asking price.");
  }
  if (!p.priceLabel?.trim()) {
    blockers.push("Add a price label — it's what the card shows.");
  }
  if (p.mediaCount === 0) {
    blockers.push("Add at least one public photo.");
  }
  return blockers;
}

/**
 * SEO title and meta description, derived from the listing itself (§5).
 *
 * There is no SEO step on the form any more: two free-text boxes asking an
 * agent to rewrite the property title were producing either blanks or
 * duplicates of it. The facts that matter for search — configuration, locality,
 * city — are already captured, so they're assembled here instead, on every
 * save, and stay correct when the listing is edited.
 */
export function seoFor(p: {
  name: string;
  type: string;
  locality: string;
  city: string;
  summary: string;
  listingType: string;
  priceLabel?: string;
}): { seoTitle: string; seoDescription: string } {
  const intent = p.listingType === "rental" ? "for rent" : "for sale";
  const title = clamp(
    `${p.name} — ${p.type} ${intent} in ${p.locality}, ${p.city}`,
    60,
  );

  // The summary carries the description; the price is appended only when it
  // still fits, so the snippet is never cut mid-figure.
  const tail = p.priceLabel ? ` ${p.priceLabel}.` : "";
  const body = clamp(p.summary, 155 - tail.length);
  return { seoTitle: title, seoDescription: `${body}${tail}` };
}

/** Truncates on a word boundary, with an ellipsis, or returns it untouched. */
function clamp(text: string, max: number): string {
  const value = text.trim().replace(/\s+/g, " ");
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Formats 18500000 → "₹1.85 Cr", the label the public cards render. */
export function priceLabelFor(value: number | undefined): string | undefined {
  if (!value || value <= 0) return undefined;
  return `₹${formatAmount(value)}`;
}
