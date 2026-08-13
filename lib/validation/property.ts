import { z } from "zod";
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

const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : undefined))
  .refine((v) => v === undefined || Number.isFinite(v), "Enter a number.")
  .refine((v) => v === undefined || v >= 0, "Can't be negative.");

const optionalInt = optionalNumber.refine(
  (v) => v === undefined || Number.isInteger(v),
  "Enter a whole number.",
);

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.null(), z.undefined()])
  .transform((v) => v === "on" || v === "true");

export const propertySchema = z
  .object({
    name: z.string().trim().min(3, "Give the property a title."),
    summary: z.string().trim().min(10, "Write a short summary."),
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
    landAreaUnit: z.enum(AREA_UNITS).optional(),
    surveyNumber: optionalText,
    roadAccess: optionalText,
    facing: optionalText,
    boundaryNotes: optionalText,

    // Building
    hasBuilding: checkbox,
    builtUpArea: optionalNumber,
    builtUpAreaUnit: z.enum(AREA_UNITS).optional(),
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
    commercialKind: z.enum(COMMERCIAL_KINDS).optional(),
    floorNumber: optionalText,
    occupancy: optionalText,
    suitableFor: optionalText,
    leasePotential: optionalText,

    // Financial
    askingPrice: optionalNumber,
    priceLabel: optionalText,
    priceUnit: optionalText,
    rentalIncome: optionalNumber,
    rentalFrequency: optionalText,
    rentalYield: optionalNumber,
    // Internal. Whether this is even accepted is checked against the actor's
    // permission in the action — the schema only shapes it.
    finalPrice: optionalNumber,
    internalNotes: optionalText,
    sellerName: optionalText,
    sellerContact: optionalText,

    // SEO
    seoTitle: optionalText,
    seoDescription: optionalText,
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

/** Formats 18500000 → "₹1.85 Cr", the label the public cards render. */
export function priceLabelFor(value: number | undefined): string | undefined {
  if (!value || value <= 0) return undefined;
  if (value >= 10000000) {
    const cr = value / 10000000;
    return `₹${cr.toFixed(cr >= 10 ? 0 : 2).replace(/\.00$/, "")} Cr`;
  }
  if (value >= 100000) {
    const l = value / 100000;
    return `₹${l.toFixed(l >= 10 ? 0 : 1).replace(/\.0$/, "")} L`;
  }
  return `₹${value.toLocaleString("en-IN")}`;
}
