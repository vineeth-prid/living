import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  FOLLOWUP_KINDS,
  leadFollowups,
  leadProperties,
  leads,
  properties,
  propertyMedia,
  users,
  whatsappConversations,
} from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { createLead, findDuplicateLeads, recordActivity } from "@/lib/leads";
import {
  addLeadNote as addNoteService,
  nextPendingFollowUp,
  rescheduleFollowUp as rescheduleService,
  scheduleFollowUp,
  setFollowUpStatus,
  setLeadStatus,
} from "@/lib/leads.service";
import { systemHealth } from "@/lib/health";
import { visibleTo } from "@/lib/leads.admin";
import { can } from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/constants";
import { priceLabelFor, publishBlockers } from "@/lib/validation/property";
import { amountFrom } from "@/lib/money";
import { matchOption } from "./intake";
import type { SessionUser } from "@/lib/auth/session";
import type { Entities } from "@/lib/ai/crm-intent/schema";
import {
  LEAD_FORM,
  missingRequired,
  reaskFor,
  renderForm,
  type IntakeState,
} from "./intake";
import type { LeadStatus } from "@/lib/db/schema";
import { propertyInThread, resolveLead, resolveProperty } from "./resolve";
import { helpFor } from "./registry";
import { t, dateTime, inr } from "./templates";
import { crmDayBounds, zonedDateTime } from "./time";
import { resolveRelativeDate, scheduleAt } from "./dates";

// The CRM half. Every function here has already passed the registry's
// permission check and, where required, an explicit confirmation — so each one
// does its job and reports honestly, and none of them re-decides who is allowed
// to be here (§72).
//
// Nothing in this file trusts the model's entities as identifiers. A name
// becomes a row only through resolve.ts, which refuses to guess.

export type HandlerContext = {
  user: SessionUser;
  /** §13 per-employee narrowing, so HELP lists only what they can run. */
  scope: string[];
  conversationId: string;
  /**
   * §7. The message verbatim. Date phrases are resolved from this rather than
   * from the model's arithmetic, which is the part it gets quietly wrong.
   */
  text: string;
};

export type HandlerResult = {
  reply: string;
  /** What was touched, for the audit row. */
  target?: { entity: string; id: string };
  summary?: string;
  /**
   * Set when the handler cannot finish without another answer. The pipeline
   * parks the question and merges the reply back in (§57) rather than making
   * the employee retype the whole instruction.
   */
  needs?: { question: string; entities: Record<string, unknown> };
  /**
   * Set when a file arrived with nothing to attach it to. The pipeline parks a
   * question so the next message is still an answer to "which property?"
   * rather than an unanchored sentence for the classifier to guess at.
   */
  needsProperty?: boolean;
  ok: boolean;
};

const ok = (reply: string, extra: Partial<HandlerResult> = {}): HandlerResult => ({
  reply,
  ok: true,
  ...extra,
});
const no = (reply: string): HandlerResult => ({ reply, ok: false });

/** Ask for one missing field, keeping what has already been gathered. */
const needs = (question: string, entities: Record<string, unknown>): HandlerResult => ({
  reply: question,
  ok: true,
  needs: { question, entities },
});

/** Shared shape for "I couldn't pin that down" across every handler. */
type Need<T> = { ok: true; value: T } | { ok: false; fail: string };

type LeadRow = { id: string; name: string; reference: string; status: string };

async function needLead(
  ctx: HandlerContext,
  e: Entities,
): Promise<Need<LeadRow>> {
  const found = await resolveLead(ctx.user, {
    name: e.leadName,
    reference: e.leadReference,
    mobile: e.mobile,
  });
  if (found.kind === "one") return { ok: true, value: found.value };
  if (found.kind === "many") return { ok: false, fail: t.ambiguous("leads", found.options) };
  return { ok: false, fail: t.noneFound(`a lead called “${e.leadName ?? e.leadReference ?? "that"}”`) };
}

type ResolvedProperty = Awaited<ReturnType<typeof resolveProperty>>;
type PropertyRow = Extract<ResolvedProperty, { kind: "one" }>["value"];

async function needProperty(
  e: Entities,
  /** Falls back to the property this thread is about, when none is named. */
  conversationId?: string,
): Promise<Need<PropertyRow>> {
  // Nothing named at all: "publish", straight after creating and
  // photographing a draft. The thread already knows which one.
  //
  // Only when nothing was named. An explicit reference that fails to resolve
  // must stay an error — "publish LIV-9999" publishing whatever was last
  // discussed is exactly the kind of confident wrong answer to avoid.
  if (!e.propertyReference && !e.propertyQuery && conversationId) {
    const inThread = await propertyInThread(conversationId);
    if (inThread) return { ok: true, value: inThread };
  }

  const found = await resolveProperty({
    reference: e.propertyReference,
    text: e.propertyQuery,
  });
  if (found.kind === "one") return { ok: true, value: found.value };
  if (found.kind === "many") return { ok: false, fail: t.ambiguous("properties", found.options) };
  return {
    ok: false,
    fail: t.noneFound(`a property matching “${e.propertyReference ?? e.propertyQuery ?? "that"}”`),
  };
}

// --- reads ----------------------------------------------------------------

export async function getMyFollowups(ctx: HandlerContext): Promise<HandlerResult> {
  // "Show my follow-ups tomorrow" used to return today's, silently. The day is
  // read from the message the same way a follow-up's due date is.
  const said = resolveRelativeDate(ctx.text);
  const namedDay = said?.kind === "date" ? said.iso : null;

  const today = crmDayBounds();
  const start = namedDay ? zonedDateTime(namedDay, "00:00") : null;
  const isToday = start !== null && start.getTime() === today.from.getTime();

  // A named future day is that day alone. With no day named — or with "today"
  // — anything already overdue still needs calling, so the window opens at the
  // beginning of time.
  const from = start && !isToday ? start : null;
  const to =
    from !== null ? new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1) : today.to;
  const when = namedDay && !isToday ? `on ${namedDay}` : undefined;

  const rows = await db()
    .select({
      dueAt: leadFollowups.dueAt,
      kind: leadFollowups.kind,
      leadName: leads.name,
      leadReference: leads.reference,
    })
    .from(leadFollowups)
    .innerJoin(leads, eq(leads.id, leadFollowups.leadId))
    .where(
      and(
        eq(leadFollowups.assignedToId, ctx.user.id),
        eq(leadFollowups.status, "pending"),
        // Today and anything already overdue — an old one still needs calling.
        lte(leadFollowups.dueAt, to),
        from ? gte(leadFollowups.dueAt, from) : undefined,
        isNull(leads.deletedAt),
      ),
    )
    .orderBy(asc(leadFollowups.dueAt))
    // §27: a phone is not a report. Ten is a list; two hundred is a wall.
    .limit(10);

  if (rows.length === 0) return ok(t.followupsEmpty(when));
  return ok(t.followups(rows, when));
}

export async function getMyLeads(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  // "Show my hot leads" comes back from the model as "Hot" as often as "hot",
  // and a case-sensitive check silently dropped the filter — answering a
  // question about hot leads with every open lead, labelled as such.
  //
  // Refused rather than dropped when it matches nothing: a filter that quietly
  // does not apply is a wrong answer wearing a right one's clothes.
  let priority: string | undefined;
  if (e.priority) {
    const matched = matchOption(e.priority, LEAD_PRIORITIES);
    if (!matched) {
      return no(
        `"${e.priority}" isn't a priority. Valid ones: ${LEAD_PRIORITIES.join(", ")}.`,
      );
    }
    priority = matched;
  }

  const rows = await db()
    .select({
      name: leads.name,
      reference: leads.reference,
      budgetMax: leads.budgetMax,
      city: leads.city,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        visibleTo(ctx.user),
        eq(leads.assignedToId, ctx.user.id),
        priority ? eq(leads.priority, priority as "hot") : undefined,
        sql`${leads.status} not in ('closed_won','closed_lost')`,
      ),
    )
    .orderBy(desc(leads.createdAt))
    .limit(10);

  if (rows.length === 0) return ok(t.leadsEmpty());
  return ok(t.leads(rows, priority ? `Your ${priority} leads` : "Your open leads"));
}

export async function getLead(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const found = await needLead(ctx, e);
  if (!found.ok) return no(found.fail);

  const [row] = await db()
    .select({
      name: leads.name,
      reference: leads.reference,
      status: leads.status,
      priority: leads.priority,
      mobile: leads.mobile,
      city: leads.city,
      budgetMax: leads.budgetMax,
      nextFollowUpAt: leads.nextFollowUpAt,
    })
    .from(leads)
    .where(eq(leads.id, found.value.id))
    .limit(1);

  return ok(t.lead(row), { target: { entity: "lead", id: found.value.id } });
}

/**
 * §25: the projection is the protection. resolveProperty never selects
 * finalPrice, sellerName, sellerContact or internalNotes, so no formatting
 * mistake downstream can print them.
 *
 * §8: the internal price is then fetched by one explicit, separately
 * permissioned query — the same rule the admin panel applies, so a holder of
 * property.final_price sees it here too and nobody else can.
 */
export async function getProperty(
  e: Entities,
  viewer?: SessionUser,
  conversationId?: string,
): Promise<HandlerResult> {
  const found = await needProperty(e, conversationId);
  if (!found.ok) return no(found.fail);

  let finalPrice: number | null = null;
  if (viewer && can(viewer, PERMISSIONS.propertyFinalPrice)) {
    const [row] = await db()
      .select({ finalPrice: properties.finalPrice })
      .from(properties)
      .where(eq(properties.id, found.value.id))
      .limit(1);
    finalPrice = row?.finalPrice ?? null;
  }

  return ok(t.property(found.value, finalPrice), {
    target: { entity: "property", id: found.value.id },
  });
}

// --- writes ---------------------------------------------------------------

export async function addFollowup(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const found = await needLead(ctx, e);
  if (!found.ok) return no(found.fail);

  const when = scheduleAt({ text: ctx.text, modelDate: e.date, time: e.time });
  if (!when.ok) return needs(when.ask, e);
  const dueAt = when.dueAt;

  // Defaulting to "call" is right when nothing was said, and wrong when
  // something was: "site visit" coming back as "Site Visit" booked a call.
  let kind = "call";
  if (e.followUpKind) {
    const matched = matchOption(e.followUpKind, FOLLOWUP_KINDS);
    if (!matched) {
      return no(
        `"${e.followUpKind}" isn't a follow-up kind. Valid ones: ${FOLLOWUP_KINDS.join(", ").replace(/_/g, " ")}.`,
      );
    }
    kind = matched;
  }

  // §2: the shared service, so a follow-up booked here is identical to one
  // booked in the panel — same activity kind, same nextFollowUpAt recompute.
  await scheduleFollowUp({
    leadId: found.value.id,
    dueAt,
    kind,
    notes: e.note,
    assignedToId: ctx.user.id,
    actorId: ctx.user.id,
    via: "WhatsApp",
  });

  return ok(t.followupAdded(found.value.name, dateTime(dueAt)), {
    target: { entity: "lead", id: found.value.id },
    summary: `follow-up ${dateTime(dueAt)}`,
  });
}

export async function addLeadNote(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const found = await needLead(ctx, e);
  if (!found.ok) return no(found.fail);
  if (!e.note) return no("What should the note say?");

  await addNoteService({
    leadId: found.value.id,
    body: e.note,
    actorId: ctx.user.id,
    via: "WhatsApp",
  });

  return ok(t.noteAdded(found.value.name), {
    target: { entity: "lead", id: found.value.id },
    summary: "note",
  });
}

export async function changeLeadStatus(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const found = await needLead(ctx, e);
  if (!found.ok) return no(found.fail);

  const wanted = (e.status ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (!(LEAD_STATUSES as readonly string[]).includes(wanted)) {
    return no(
      `“${e.status ?? ""}” isn't a lead status. Valid ones: ${LEAD_STATUSES.join(", ").replace(/_/g, " ")}.`,
    );
  }

  const from = found.value.status;
  if (from === wanted) return ok(`${found.value.name} is already ${wanted.replace(/_/g, " ")}.`);

  // §2 again. The service is what sets closedAt on a close and writes the
  // audit row — both of which this handler used to skip.
  await setLeadStatus({
    leadId: found.value.id,
    from: from as LeadStatus,
    status: wanted as LeadStatus,
    actorId: ctx.user.id,
    via: "WhatsApp",
  });

  return ok(t.statusChanged(found.value.name, from, wanted), {
    target: { entity: "lead", id: found.value.id },
    summary: `${from} → ${wanted}`,
  });
}

export async function addLeadActivity(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const found = await needLead(ctx, e);
  if (!found.ok) return no(found.fail);

  const summary = e.note ?? e.summary;
  if (!summary) return no("What should I record against them?");

  await recordActivity({
    leadId: found.value.id,
    kind: "interaction",
    summary: `${summary.slice(0, 300)} (via WhatsApp)`,
    actorId: ctx.user.id,
  });

  return ok(`✅ Recorded against ${found.value.name}.`, {
    target: { entity: "lead", id: found.value.id },
    summary: "activity",
  });
}

export async function associatePropertyToLead(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const lead = await needLead(ctx, e);
  if (!lead.ok) return no(lead.fail);
  const property = await needProperty(e, ctx.conversationId);
  if (!property.ok) return no(property.fail);

  await db()
    .insert(leadProperties)
    .values({
      id: newId(),
      leadId: lead.value.id,
      propertyId: property.value.id,
      createdById: ctx.user.id,
    })
    // Saying it twice is not an error, and must not create a second row.
    .onConflictDoNothing();

  await recordActivity({
    leadId: lead.value.id,
    kind: "property_linked",
    summary: `${property.value.reference ?? property.value.name} linked via WhatsApp`,
    actorId: ctx.user.id,
  });

  return ok(
    t.propertyLinked(lead.value.name, property.value.reference ?? property.value.name),
    { target: { entity: "lead", id: lead.value.id }, summary: "property linked" },
  );
}

export async function completeFollowup(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const found = await needLead(ctx, e);
  if (!found.ok) return no(found.fail);

  const pending = await nextPendingFollowUp(found.value.id, ctx.user.id);
  if (!pending) return no(`${found.value.name} has no follow-up of yours pending.`);

  // The service sets lastContactedAt, which this handler used to skip.
  await setFollowUpStatus({
    followUpId: pending.id,
    leadId: found.value.id,
    kind: pending.kind,
    status: "completed",
    actorId: ctx.user.id,
    via: "WhatsApp",
  });

  return ok(`✅ Follow-up for ${found.value.name} marked done.`, {
    target: { entity: "lead", id: found.value.id },
    summary: "follow-up completed",
  });
}

// --- properties -----------------------------------------------------------

export async function updatePropertyPrice(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const found = await needProperty(e, ctx.conversationId);
  if (!found.ok) return no(found.fail);

  // §7's rule, applied to money. The employee's own words decide the figure;
  // the model's number is only a fallback. "92 lakh" coming back as 92 would
  // put a listing on the site at ninety-two rupees.
  const amount = amountFrom(ctx.text, e.amount);
  if (amount === null) return no("What should the new asking price be?");

  const before = found.value.askingPrice;
  const label = priceLabelFor(amount) ?? "On request";

  await db()
    .update(properties)
    .set({
      askingPrice: amount,
      priceValue: amount,
      priceLabel: label,
      updatedById: ctx.user.id,
      updatedAt: sql`now()`,
    })
    .where(eq(properties.id, found.value.id));

  await audit({
    actorId: ctx.user.id,
    action: "property.price_changed",
    entity: "property",
    entityId: found.value.id,
    before: { askingPrice: before },
    after: { askingPrice: amount, channel: "whatsapp" },
  });

  return ok(
    t.priceChanged(found.value.reference ?? found.value.name, inr(before), label),
    {
      target: { entity: "property", id: found.value.id },
      summary: `${inr(before)} → ${label}`,
    },
  );
}

/**
 * §11 again, over WhatsApp. The same `publishBlockers` the panel uses decides
 * this — a listing that the panel refuses to publish is not publishable from a
 * phone either.
 */
export async function setPublished(
  ctx: HandlerContext,
  e: Entities,
  publish: boolean,
): Promise<HandlerResult> {
  if (!can(ctx.user, PERMISSIONS.propertyPublish)) return no(t.notPermitted());

  const found = await needProperty(e, ctx.conversationId);
  if (!found.ok) return no(found.fail);
  const label = found.value.reference ?? found.value.name;

  if (publish) {
    const [{ mediaCount }] = await db()
      .select({ mediaCount: sql<number>`count(*)::int` })
      .from(propertyMedia)
      .where(
        and(
          eq(propertyMedia.propertyId, found.value.id),
          eq(propertyMedia.kind, "image"),
          eq(propertyMedia.isPublic, true),
        ),
      );

    const blockers = publishBlockers({
      name: found.value.name,
      summary: found.value.summary,
      city: found.value.city,
      locality: found.value.locality,
      priceLabel: found.value.priceLabel,
      askingPrice: found.value.askingPrice,
      listingType: found.value.listingType,
      mediaCount,
    });
    if (blockers.length) return no(t.publishBlocked(label, blockers));
  }

  await db()
    .update(properties)
    .set({
      workflowStatus: publish ? "published" : "draft",
      isPublic: publish,
      publishedAt: publish ? new Date() : undefined,
      updatedById: ctx.user.id,
      updatedAt: sql`now()`,
    })
    .where(eq(properties.id, found.value.id));

  await audit({
    actorId: ctx.user.id,
    action: publish ? "property.published" : "property.unpublished",
    entity: "property",
    entityId: found.value.id,
    after: { channel: "whatsapp" },
  });

  return ok(publish ? t.published(label) : t.unpublished(label), {
    target: { entity: "property", id: found.value.id },
    summary: publish ? "published" : "unpublished",
  });
}

export async function getProfile(ctx: HandlerContext): Promise<HandlerResult> {
  return ok(t.profile(ctx.user.fullName, ctx.user.role));
}

export async function help(ctx: HandlerContext): Promise<HandlerResult> {
  return ok(t.help(helpFor(ctx.user, ctx.scope)));
}

/** Employee lookup for ASSIGN_LEAD, kept here so the handler stays readable. */
export async function findEmployee(name: string) {
  const rows = await db()
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.isActive, true), sql`${users.fullName} ilike ${`%${name}%`}`))
    .limit(2);
  return rows.length === 1 ? rows[0] : null;
}

export async function assignLead(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const found = await needLead(ctx, e);
  if (!found.ok) return no(found.fail);
  if (!e.employeeName) return no("Who should I assign it to?");

  const employee = await findEmployee(e.employeeName);
  if (!employee) {
    return no(t.noneFound(`exactly one employee called “${e.employeeName}”`));
  }

  await db()
    .update(leads)
    .set({ assignedToId: employee.id, assignedAt: new Date(), updatedAt: sql`now()` })
    .where(eq(leads.id, found.value.id));

  await recordActivity({
    leadId: found.value.id,
    kind: "assigned",
    summary: `Assigned to ${employee.fullName} via WhatsApp`,
    actorId: ctx.user.id,
  });

  return ok(`✅ ${found.value.name} assigned to ${employee.fullName}.`, {
    target: { entity: "lead", id: found.value.id },
    summary: `assigned to ${employee.fullName}`,
  });
}

/** Kept for the daily-figures reads; the range is Living-local, not UTC. */
export async function todaysFollowupCount(userId: string) {
  const { from, to } = crmDayBounds();
  const [row] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(leadFollowups)
    .where(
      and(
        eq(leadFollowups.assignedToId, userId),
        eq(leadFollowups.status, "pending"),
        gte(leadFollowups.dueAt, from),
        lte(leadFollowups.dueAt, to),
      ),
    );
  return row?.total ?? 0;
}

// --- §17 remainder --------------------------------------------------------

/**
 * §21 hand-off. Marks the conversation as being about one property so the next
 * photo has somewhere to go, without guessing (§55).
 */
export async function awaitPropertyMedia(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const found = await needProperty(e, ctx.conversationId);
  if (!found.ok) return no(found.fail);

  await db()
    .update(whatsappConversations)
    .set({ propertyId: found.value.id, updatedAt: new Date() })
    .where(eq(whatsappConversations.id, ctx.conversationId));

  return ok(
    `Send the photos now and I'll attach them to ${found.value.reference ?? found.value.name}.`,
    { target: { entity: "property", id: found.value.id } },
  );
}

/** Fields an employee may change by name over WhatsApp. */
const LEAD_FIELDS: Record<string, "city" | "email" | "preferredLocation" | "timeline" | "purpose" | "requirementType"> = {
  city: "city",
  email: "email",
  location: "preferredLocation",
  "preferred location": "preferredLocation",
  timeline: "timeline",
  purpose: "purpose",
  requirement: "requirementType",
};

export async function updateLead(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const found = await needLead(ctx, e);
  if (!found.ok) return no(found.fail);

  // Budget and status have their own paths; routing them here would bypass the
  // status vocabulary check.
  if (e.status) return changeLeadStatus(ctx, e);

  const key = (e.field ?? "").toLowerCase().trim();
  const column = LEAD_FIELDS[key];
  if (!column) {
    return no(
      `I can change ${Object.keys(LEAD_FIELDS).join(", ")} on a lead. For anything else, use the panel.`,
    );
  }
  const value = e.value === undefined ? undefined : String(e.value);
  if (!value) return no(`What should ${key} be?`);

  await db()
    .update(leads)
    .set({ [column]: value, updatedAt: sql`now()` })
    .where(eq(leads.id, found.value.id));

  await recordActivity({
    leadId: found.value.id,
    kind: "updated",
    summary: `${key} set via WhatsApp`,
    toValue: value.slice(0, 200),
    actorId: ctx.user.id,
  });

  return ok(`✅ ${found.value.name}: ${key} updated.`, {
    target: { entity: "lead", id: found.value.id },
    summary: `${key} → ${value}`,
  });
}

export async function createLeadCommand(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const name = e.leadName?.trim();
  const mobile = e.mobile?.replace(/\D/g, "");

  // Same template intake as the property draft, for the same reason: two
  // questions in two messages, each re-interpreted by the classifier, is worse
  // than one form — and the form collects the optional fields that the
  // question loop simply never asked for.
  //
  // A message that already carries a name and a number skips it entirely, so
  // "Add lead Raj 9876543210" is still one message in, one lead out.
  if (!name || !mobile || mobile.length < 10) {
    const state = e as Entities & IntakeState;
    const missing = missingRequired(LEAD_FORM, e as Record<string, unknown>);
    const question = state.__formSent ? reaskFor(missing) : renderForm(LEAD_FORM);
    return {
      ok: true,
      reply: question,
      needs: {
        question,
        entities: { ...e, __intake: LEAD_FORM.id, __formSent: true },
      },
    };
  }

  // §30 duplicate rule, reused rather than re-implemented: createLead runs
  // findDuplicateLeads itself, so a WhatsApp-created lead is checked exactly as
  // a website one is.
  const existing = await findDuplicateLeads(mobile);
  if (existing.length > 0) {
    return no(
      `${existing[0].name} (${existing[0].reference}) already has that number. Nothing was created.`,
    );
  }

  const lead = await createLead({
    name,
    mobile,
    email: e.email ?? null,
    city: e.city ?? null,
    preferredLocation: e.locality ?? null,
    budgetMax: e.amount ?? null,
    propertyKind:
      e.propertyKind === "commercial" || e.propertyKind === "residential"
        ? e.propertyKind
        : null,
    sourceKey: "whatsapp",
    initialMessage: e.note ?? null,
    assignedToId: ctx.user.id,
    createdById: ctx.user.id,
  });

  return ok(`✅ Lead created — ${lead.reference}, ${name}. Assigned to you.`, {
    target: { entity: "lead", id: lead.id },
    summary: lead.reference,
  });
}

export async function rescheduleFollowup(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  const found = await needLead(ctx, e);
  if (!found.ok) return no(found.fail);
  const when = scheduleAt({ text: ctx.text, modelDate: e.date, time: e.time });
  if (!when.ok) return needs(when.ask, e);
  const dueAt = when.dueAt;

  const pending = await nextPendingFollowUp(found.value.id, ctx.user.id);
  // Nothing to move is not an error — booking one is what was meant.
  if (!pending) return addFollowup(ctx, e);

  await rescheduleService({
    followUpId: pending.id,
    leadId: found.value.id,
    from: pending.dueAt,
    dueAt,
    actorId: ctx.user.id,
    via: "WhatsApp",
  });

  return ok(`✅ ${found.value.name}'s follow-up moved to ${dateTime(dueAt)}.`, {
    target: { entity: "lead", id: found.value.id },
    summary: `rescheduled ${dateTime(dueAt)}`,
  });
}

/** Fields on a listing that are safe to set from a phone. */
const PROPERTY_FIELDS: Record<string, "status" | "summary" | "description" | "facing" | "parking" | "propertyAge" | "furnishedStatus"> = {
  possession: "status",
  status: "status",
  summary: "summary",
  description: "description",
  facing: "facing",
  parking: "parking",
  age: "propertyAge",
  furnishing: "furnishedStatus",
};

export async function updatePropertyField(
  ctx: HandlerContext,
  e: Entities,
): Promise<HandlerResult> {
  if (e.amount !== undefined && !e.field) return updatePropertyPrice(ctx, e);

  const found = await needProperty(e, ctx.conversationId);
  if (!found.ok) return no(found.fail);

  const key = (e.field ?? "").toLowerCase().trim();

  // §8. The internal figure, behind the same permission as everywhere else.
  // Refused rather than ignored, so nobody believes they changed it.
  if (/^(final|internal)\s*price$/.test(key)) {
    if (!can(ctx.user, PERMISSIONS.propertyFinalPrice)) return no(t.notPermitted());
    const finalAmount = amountFrom(ctx.text, e.amount);
    if (finalAmount === null) return needs("What should the final price be?", e);

    await db()
      .update(properties)
      .set({
        finalPrice: finalAmount,
        updatedById: ctx.user.id,
        updatedAt: sql`now()`,
      })
      .where(eq(properties.id, found.value.id));

    await audit({
      actorId: ctx.user.id,
      action: "property.final_price_changed",
      entity: "property",
      entityId: found.value.id,
      // The figure itself is not written into the audit payload — the audit
      // log is read by more people than hold the permission.
      after: { changed: true, channel: "whatsapp" },
    });

    return ok(`✅ ${found.value.reference ?? found.value.name}: final price updated. It is never shown publicly.`, {
      target: { entity: "property", id: found.value.id },
      summary: "final price",
    });
  }

  const column = PROPERTY_FIELDS[key];
  if (!column) {
    return no(
      `I can change ${Object.keys(PROPERTY_FIELDS).join(", ")} on a listing, or the asking price. Anything else needs the panel.`,
    );
  }
  const value = e.value === undefined ? undefined : String(e.value);
  if (!value) return no(`What should ${key} be?`);

  // Possession is a fixed vocabulary the public badge renders.
  if (column === "status" && !PROPERTY_POSSESSION.includes(value)) {
    return no(`Possession has to be one of: ${PROPERTY_POSSESSION.join(", ")}.`);
  }

  await db()
    .update(properties)
    .set({ [column]: value, updatedById: ctx.user.id, updatedAt: sql`now()` })
    .where(eq(properties.id, found.value.id));

  await audit({
    actorId: ctx.user.id,
    action: "property.updated",
    entity: "property",
    entityId: found.value.id,
    after: { [column]: value, channel: "whatsapp" },
  });

  return ok(`✅ ${found.value.reference ?? found.value.name}: ${key} updated.`, {
    target: { entity: "property", id: found.value.id },
    summary: `${key} → ${value}`,
  });
}

const PROPERTY_POSSESSION = ["Ready to move", "Under construction", "New launch"];

/** §67, reported to the one channel that can ask for it. */
export async function getSystemStatus(): Promise<HandlerResult> {
  const health = await systemHealth();
  return ok(
    [
      "*Living system status*",
      ...health.map((row) => `${row.ok ? "✅" : "⚠️"} ${row.label}: ${row.detail}`),
    ].join("\n"),
  );
}

/** Current asking price, for the confirmation question (§6). */
export async function currentAskingPrice(
  e: Entities,
  conversationId?: string,
): Promise<number | null> {
  const found = await needProperty(e, conversationId);
  return found.ok ? found.value.askingPrice : null;
}
