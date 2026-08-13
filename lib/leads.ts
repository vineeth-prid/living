import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  leadActivities,
  leadNotes,
  leadProperties,
  leads,
  properties,
} from "./db/schema";
import { newId, nextReference } from "./ids";
import { notifyWebsiteEnquiry } from "./notify";

// Shared lead-writing core. Both the public enquiry forms and the admin panel
// come through here, so a lead created by a website visitor and one typed in by
// an employee produce the same rows, reference format and timeline.

export type CreateLeadInput = {
  name: string;
  mobile: string;
  email?: string | null;
  altMobile?: string | null;
  city?: string | null;
  location?: string | null;
  country?: string | null;
  typeKey?: string | null;
  propertyKind?: "residential" | "commercial" | null;
  requirementType?: string | null;
  preferredLocation?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  bedrooms?: number | null;
  timeline?: string | null;
  purpose?: string | null;
  preferredContact?: string | null;
  sourceKey?: string | null;
  campaign?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  landingPage?: string | null;
  referrerUrl?: string | null;
  initialMessage?: string | null;
  assignedToId?: string | null;
  createdById?: string | null;
  /** Listings the lead is interested in (§19). */
  propertyIds?: string[];
};

async function latestLeadReference(): Promise<string | null> {
  const [row] = await db()
    .select({ reference: leads.reference })
    .from(leads)
    .orderBy(desc(leads.reference))
    .limit(1);
  return row?.reference ?? null;
}

/** Normalised to the last 10 digits so +91/0/spacing variants still match. */
export const normaliseMobile = (mobile: string) =>
  mobile.replace(/\D/g, "").slice(-10);

/**
 * Possible duplicates (§30) — never merged automatically, only surfaced.
 * Matches on the last 10 digits of the mobile, or an exact email.
 */
export async function findDuplicateLeads(mobile: string, email?: string | null) {
  const digits = normaliseMobile(mobile);
  if (digits.length < 10 && !email) return [];

  return db()
    .select({
      id: leads.id,
      reference: leads.reference,
      name: leads.name,
      mobile: leads.mobile,
      email: leads.email,
      status: leads.status,
      createdAt: leads.createdAt,
      assignedToId: leads.assignedToId,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        or(
          digits.length >= 10
            ? sql`regexp_replace(${leads.mobile}, '\\D', '', 'g') LIKE ${"%" + digits}`
            : undefined,
          email ? ilike(leads.email, email) : undefined,
        ),
      ),
    )
    .orderBy(desc(leads.createdAt))
    .limit(5);
}

/** Append a timeline entry (§25). Nothing ever updates or deletes these. */
export async function recordActivity(input: {
  leadId: string;
  kind: string;
  summary: string;
  fromValue?: string | null;
  toValue?: string | null;
  actorId?: string | null;
}) {
  await db()
    .insert(leadActivities)
    .values({
      id: newId(),
      leadId: input.leadId,
      kind: input.kind,
      summary: input.summary,
      fromValue: input.fromValue ?? null,
      toValue: input.toValue ?? null,
      actorId: input.actorId ?? null,
    });
}

export async function createLead(input: CreateLeadInput): Promise<{
  id: string;
  reference: string;
}> {
  const id = newId();
  const reference = nextReference("LEAD", await latestLeadReference());

  await db()
    .insert(leads)
    .values({
      id,
      reference,
      name: input.name,
      mobile: input.mobile,
      altMobile: input.altMobile ?? null,
      email: input.email ?? null,
      city: input.city ?? null,
      location: input.location ?? null,
      country: input.country ?? null,
      typeKey: input.typeKey ?? null,
      propertyKind: input.propertyKind ?? null,
      requirementType: input.requirementType ?? null,
      preferredLocation: input.preferredLocation ?? null,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      bedrooms: input.bedrooms ?? null,
      timeline: input.timeline ?? null,
      purpose: input.purpose ?? null,
      preferredContact: input.preferredContact ?? null,
      sourceKey: input.sourceKey ?? null,
      campaign: input.campaign ?? null,
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
      landingPage: input.landingPage ?? null,
      referrerUrl: input.referrerUrl ?? null,
      initialMessage: input.initialMessage ?? null,
      assignedToId: input.assignedToId ?? null,
      assignedAt: input.assignedToId ? new Date() : null,
      assignedById: input.assignedToId ? (input.createdById ?? null) : null,
      createdById: input.createdById ?? null,
      // Rule 4: every lead starts with a lifecycle status.
      status: "new",
      priority: "warm",
    });

  await recordActivity({
    leadId: id,
    kind: "created",
    summary: input.createdById ? "Lead created" : "Lead captured from the website",
    actorId: input.createdById ?? null,
  });

  if (input.initialMessage) {
    await db().insert(leadNotes).values({
      id: newId(),
      leadId: id,
      body: input.initialMessage,
      kind: "initial",
      authorId: input.createdById ?? null,
    });
  }

  for (const propertyId of input.propertyIds ?? []) {
    await linkProperty({
      leadId: id,
      propertyId,
      actorId: input.createdById ?? null,
    });
  }

  // Only website captures notify the team. A lead an employee just typed in
  // doesn't need to be emailed back to the people who watched them type it.
  if (!input.createdById) {
    const [property] = input.propertyIds?.length
      ? await db()
          .select({ name: properties.name })
          .from(properties)
          .where(eq(properties.id, input.propertyIds[0]))
          .limit(1)
      : [];

    notifyWebsiteEnquiry({
      id,
      reference,
      name: input.name,
      mobile: input.mobile,
      email: input.email ?? null,
      message: input.initialMessage ?? null,
      propertyName: property?.name ?? null,
    });
  }

  return { id, reference };
}

export async function linkProperty(input: {
  leadId: string;
  propertyId: string;
  note?: string | null;
  actorId?: string | null;
}) {
  const [property] = await db()
    .select({ name: properties.name, reference: properties.reference })
    .from(properties)
    .where(eq(properties.id, input.propertyId))
    .limit(1);
  if (!property) return;

  const inserted = await db()
    .insert(leadProperties)
    .values({
      id: newId(),
      leadId: input.leadId,
      propertyId: input.propertyId,
      note: input.note ?? null,
      createdById: input.actorId ?? null,
    })
    // A lead enquiring twice about the same listing isn't an error.
    .onConflictDoNothing()
    .returning({ id: leadProperties.id });

  if (inserted.length) {
    await recordActivity({
      leadId: input.leadId,
      kind: "property_linked",
      summary: `Property ${property.reference ?? property.name} associated`,
      toValue: input.propertyId,
      actorId: input.actorId ?? null,
    });
  }
}
