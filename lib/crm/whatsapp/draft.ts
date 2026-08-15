import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { properties, AREA_UNITS } from "@/lib/db/schema";
import { nextReference, slugify } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { latestPropertyReference } from "@/lib/properties.admin";
import { priceLabelFor, propertySchema, seoFor } from "@/lib/validation/property";
import type { Entities } from "@/lib/ai/crm-intent/schema";
import type { HandlerContext, HandlerResult } from "./handlers";
import { t } from "./templates";

// §21/§22. Building a listing across several messages.
//
// The rule that shapes this file: never invent a value. A field the employee
// has not given is asked for, one question at a time, and the draft is not
// written until the answers add up to something propertySchema accepts. The
// same schema the web form uses — a draft made here is a draft made there.

/**
 * §2. The minimum, asked one field at a time and only where it is missing.
 *
 * Each entry can be satisfied by any of its keys, which is how "how big is it?"
 * stays a single question: a land area answers it and so does a built-up area.
 * Asking for both would be asking for one that does not apply.
 */
const REQUIRED: { keys: (keyof Entities)[]; question: string }[] = [
  { keys: ["propertyKind"], question: "Is it residential or commercial?" },
  { keys: ["locality"], question: "Which area or locality is it in?" },
  { keys: ["city"], question: "Which city?" },
  {
    keys: ["landArea", "builtUpArea"],
    question:
      "How big is it? Give me the land area (for example 12 cents) or the built-up area (for example 1840 sqft).",
  },
  { keys: ["amount"], question: "What's the asking price?" },
];

const AREA_UNIT_WORDS: Record<string, (typeof AREA_UNITS)[number]> = {
  cent: "cent",
  cents: "cent",
  acre: "acre",
  acres: "acre",
  sqft: "sqft",
  "sq ft": "sqft",
  sqm: "sqm",
  "sq m": "sqm",
};

/**
 * Starts or continues a draft. Both directions land here: the pipeline stores
 * whatever entities came back and re-enters with them merged, so "Add a new
 * property" and "OMR Chennai, 12 cents, 1.8 crore" are the same code path.
 */
export async function startDraft(
  ctx: HandlerContext,
  entities: Entities,
): Promise<HandlerResult> {
  const missing = REQUIRED.find((field) =>
    field.keys.every((key) => entities[key] === undefined),
  );

  if (missing) {
    // One question at a time. A form disguised as a message gets ignored.
    return {
      ok: true,
      reply:
        Object.keys(entities).length === 0
          ? `Sure — I'll create a draft. ${missing.question}`
          : missing.question,
      needs: { question: missing.question, entities },
    };
  }

  if (entities.landArea !== undefined && !entities.landAreaUnit) {
    const question = "What unit is that — cents, acres, sq ft or sq m?";
    return {
      ok: true,
      reply: question,
      needs: { question, entities },
    };
  }

  return commitDraft(ctx, entities);
}

async function commitDraft(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const kind = String(e.propertyKind).toLowerCase().startsWith("comm")
    ? "commercial"
    : "residential";

  // Composed from what was actually said, never from nothing: "12 cent
  // residential land" is the employee's own words rearranged.
  const areaPhrase =
    e.landArea && e.landAreaUnit
      ? `${e.landArea} ${e.landAreaUnit}`
      : e.builtUpArea
        ? `${e.builtUpArea} sqft`
        : null;

  const type =
    e.title && e.summary
      ? e.title
      : [areaPhrase, kind, e.beds ? `${e.beds} BHK` : null]
          .filter(Boolean)
          .join(" ") || `${kind} property`;

  const name = e.title ?? `${type} in ${e.locality}`;
  const summary =
    e.summary ??
    e.description ??
    `${type} at ${e.locality}, ${e.city}. Details to follow.`;

  const landAreaUnit = e.landAreaUnit
    ? AREA_UNIT_WORDS[String(e.landAreaUnit).toLowerCase()]
    : undefined;

  // Straight through the web form's schema. If it would be rejected there it is
  // rejected here, with the same message.
  const parsed = propertySchema.safeParse({
    name,
    summary: summary.length >= 10 ? summary : `${summary} Enquiries welcome.`,
    type,
    kind,
    listingType: e.listingType ?? "sale",
    status: "Ready to move",
    locality: e.locality,
    city: e.city,
    askingPrice: String(e.amount ?? ""),
    landArea: e.landArea === undefined ? "" : String(e.landArea),
    landAreaUnit: landAreaUnit ?? "",
    builtUpArea: e.builtUpArea === undefined ? "" : String(e.builtUpArea),
    builtUpAreaUnit: e.builtUpArea === undefined ? "" : "sqft",
    beds: e.beds === undefined ? "" : String(e.beds),
    baths: e.baths === undefined ? "" : String(e.baths),
    units: e.units === undefined ? "" : String(e.units),
    rentalIncome: e.rentalIncome === undefined ? "" : String(e.rentalIncome),
    description: e.description ?? "",
    // A building only exists if an area for it was given (§22) — the schema
    // demands a built-up area whenever this is on.
    ...(e.builtUpArea !== undefined ? { hasBuilding: "on" } : {}),
    ...(kind === "commercial" ? { commercialKind: "other" } : {}),
    amenities: [],
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      reply: `I can't create that yet — ${first.message} (${first.path.join(".") || "details"})`,
    };
  }

  const input = parsed.data;
  const id = await uniqueId(slugify(input.name, input.locality));
  const reference = nextReference("LIV", await latestPropertyReference());
  const askingPrice = input.askingPrice ?? 0;
  const priceLabel = priceLabelFor(askingPrice) ?? "On request";
  const seo = seoFor({ ...input, priceLabel });

  await db().insert(properties).values({
    id,
    reference,
    name: input.name,
    locality: input.locality,
    city: input.city,
    type: input.type,
    summary: input.summary,
    description: input.description,
    kind: input.kind,
    listingType: input.listingType,
    status: input.status,
    priceLabel,
    priceValue: askingPrice,
    askingPrice: input.askingPrice ?? null,
    priceUnit: "INR",
    rentalIncome: input.rentalIncome ?? null,
    beds: input.beds ?? 0,
    baths: input.baths ?? 0,
    units: input.units ?? null,
    area: input.area ?? "",
    amenities: [],
    details: [],
    gallery: [],
    state: "Kerala",
    country: "India",
    addressIsPublic: false,
    landArea: input.landArea ?? null,
    landAreaUnit: input.landAreaUnit,
    hasBuilding: input.hasBuilding,
    builtUpArea: input.builtUpArea ?? null,
    builtUpAreaUnit: input.builtUpAreaUnit,
    commercialKind: input.commercialKind,
    seoTitle: seo.seoTitle,
    seoDescription: seo.seoDescription,
    // §21 + Rule 1: created is never published, and never from a phone.
    workflowStatus: "draft",
    isPublic: false,
    createdById: ctx.user.id,
    updatedById: ctx.user.id,
  });

  await audit({
    actorId: ctx.user.id,
    action: "property.created",
    entity: "property",
    entityId: id,
    after: { reference, name: input.name, channel: "whatsapp" },
  });

  return {
    ok: true,
    reply: t.draftCreated(reference, input.name),
    target: { entity: "property", id },
    summary: `draft ${reference}`,
  };
}

/** Same collision handling as the web create — a suffix, never a failure. */
async function uniqueId(base: string): Promise<string> {
  let candidate = base || `listing-${Date.now()}`;
  for (let n = 2; n < 50; n++) {
    const [clash] = await db()
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.id, candidate))
      .limit(1);
    if (!clash) return candidate;
    candidate = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}
