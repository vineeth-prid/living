import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { properties, AREA_UNITS } from "@/lib/db/schema";
import { nextReference, slugify } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { latestPropertyReference } from "@/lib/properties.admin";
import { priceLabelFor, propertySchema, seoFor } from "@/lib/validation/property";
import type { Entities } from "@/lib/ai/crm-intent/schema";
import type { HandlerContext, HandlerResult } from "./handlers";
import {
  COMMERCIAL_FORM,
  PROPERTY_KIND_FORM,
  RESIDENTIAL_FORM,
  missingRequired,
  reaskFor,
  renderForm,
  type IntakeState,
} from "./intake";
import { t } from "./templates";

// §21/§22. Building a listing across several messages.
//
// The rule that shapes this file: never invent a value. A field the employee
// has not given is asked for, one question at a time, and the draft is not
// written until the answers add up to something propertySchema accepts. The
// same schema the web form uses — a draft made here is a draft made there.

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

const kindOf = (value: unknown): "residential" | "commercial" | null => {
  const text = String(value ?? "").toLowerCase();
  if (text.startsWith("comm")) return "commercial";
  if (text.startsWith("resi")) return "residential";
  return null;
};

/**
 * Starts or continues a draft.
 *
 * One branching question, then one form. The old shape asked for each field in
 * its own message and put every answer through the intent classifier, so a
 * typo in any single reply derailed the sequence — and it never asked for
 * listingType, status or commercialKind at all, hardcoding all three instead.
 *
 * A message that already carries everything still commits straight away: the
 * form is what happens when something is missing, not a toll on every route.
 */
export async function startDraft(
  ctx: HandlerContext,
  entities: Entities & IntakeState,
): Promise<HandlerResult> {
  const kind = kindOf(entities.propertyKind);

  // Everything else branches on this, so it is asked on its own.
  if (!kind) {
    return {
      ok: true,
      reply: PROPERTY_KIND_FORM.intro,
      needs: {
        question: PROPERTY_KIND_FORM.intro,
        entities: { ...entities, __intake: PROPERTY_KIND_FORM.id },
      },
    };
  }

  const form = kind === "commercial" ? COMMERCIAL_FORM : RESIDENTIAL_FORM;
  const missing = missingRequired(form, entities as Record<string, unknown>);

  if (missing.length === 0) return commitDraft(ctx, entities, kind);

  // Only what is outstanding — a full resend to fix one blank line is exactly
  // the back-and-forth this replaces.
  const question = entities.__formSent
    ? reaskFor(missing)
    : renderForm(form);

  return {
    ok: true,
    reply: question,
    needs: {
      question,
      entities: { ...entities, __intake: form.id, __formSent: true },
    },
  };
}

async function commitDraft(
  ctx: HandlerContext,
  e: Entities,
  kind: "residential" | "commercial",
): Promise<HandlerResult> {
  // Composed from what was actually said, never from nothing: "12 cent
  // residential land" is the employee's own words rearranged.
  const areaPhrase =
    e.landArea && e.landAreaUnit
      ? `${e.landArea} ${e.landAreaUnit}`
      : e.builtUpArea
        ? `${e.builtUpArea} sqft`
        : null;

  // The configuration line is the employee's own description of the shape of
  // the thing, so it is the type when there is one.
  const type =
    e.configuration ??
    (e.title && e.summary
      ? e.title
      : [areaPhrase, kind, e.beds ? `${e.beds} BHK` : null]
          .filter(Boolean)
          .join(" ") || `${kind} property`);

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
    // Asked for now, rather than assumed. The old flow hardcoded all three of
    // these regardless of what was true, which is exactly the kind of quiet
    // wrong answer the "never invent a value" rule exists to stop.
    listingType: e.listingType ?? "sale",
    status: e.status ?? "Ready to move",
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
    ...(kind === "commercial"
      ? { commercialKind: e.commercialKind ?? "other" }
      : {}),
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
