import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  leadFollowups,
  leadNotes,
  leads,
  type LeadStatus,
  FOLLOWUP_STATUSES,
} from "./db/schema";
import { newId } from "./ids";
import { audit } from "./audit";
import { recordActivity } from "./leads";

// Sprint 4 §2. The lead operations themselves, with no idea which channel asked.
//
// Extracted because the admin panel and the WhatsApp handlers had each grown
// their own copy, and the copies had already diverged: the WhatsApp path was
// not setting closedAt when a lead closed, not setting lastContactedAt when a
// follow-up completed, and not writing the audit row on a status change. Same
// operation, two behaviours, one of them quietly wrong.
//
// Nothing here authorises anything and nothing here revalidates a page. The
// caller has already decided the actor may do this — `loadWritable` in the web
// actions, `resolveLead` over WhatsApp — and the caller owns its own cache.

/**
 * The lead's `nextFollowUpAt` is a denormalised pointer at its earliest pending
 * follow-up. Recomputed rather than patched, so completing one and scheduling
 * another in either order still lands on the truth.
 */
export async function syncNextFollowUp(leadId: string) {
  const [next] = await db()
    .select({ dueAt: leadFollowups.dueAt })
    .from(leadFollowups)
    .where(and(eq(leadFollowups.leadId, leadId), eq(leadFollowups.status, "pending")))
    .orderBy(asc(leadFollowups.dueAt))
    .limit(1);

  await db()
    .update(leads)
    .set({ nextFollowUpAt: next?.dueAt ?? null })
    .where(eq(leads.id, leadId));
}

export async function scheduleFollowUp(input: {
  leadId: string;
  dueAt: Date;
  kind: string;
  notes?: string | null;
  assignedToId: string | null;
  actorId: string;
  /** Appended to the activity line, so the timeline says where it came from. */
  via?: string;
}) {
  const id = newId();
  await db().insert(leadFollowups).values({
    id,
    leadId: input.leadId,
    dueAt: input.dueAt,
    kind: input.kind,
    notes: input.notes ?? null,
    assignedToId: input.assignedToId,
    createdById: input.actorId,
  });

  await recordActivity({
    leadId: input.leadId,
    kind: "followup",
    summary: `${input.kind.replace(/_/g, " ")} scheduled for ${input.dueAt.toLocaleString("en-IN")}${input.via ? ` (${input.via})` : ""}`,
    actorId: input.actorId,
  });

  await syncNextFollowUp(input.leadId);
  return { id };
}

export async function setFollowUpStatus(input: {
  followUpId: string;
  leadId: string;
  kind: string;
  status: (typeof FOLLOWUP_STATUSES)[number];
  actorId: string;
  via?: string;
}) {
  await db()
    .update(leadFollowups)
    .set({
      status: input.status,
      completedAt: input.status === "completed" ? new Date() : null,
    })
    .where(eq(leadFollowups.id, input.followUpId));

  await recordActivity({
    leadId: input.leadId,
    kind: "followup",
    summary: `${input.kind.replace(/_/g, " ")} ${input.status}${input.via ? ` (${input.via})` : ""}`,
    actorId: input.actorId,
  });

  // Completing a follow-up is the record that somebody actually spoke to them.
  if (input.status === "completed") {
    await db()
      .update(leads)
      .set({ lastContactedAt: new Date() })
      .where(eq(leads.id, input.leadId));
  }

  await syncNextFollowUp(input.leadId);
}

export async function rescheduleFollowUp(input: {
  followUpId: string;
  leadId: string;
  from: Date;
  dueAt: Date;
  actorId: string;
  via?: string;
}) {
  await db()
    .update(leadFollowups)
    .set({ dueAt: input.dueAt })
    .where(eq(leadFollowups.id, input.followUpId));

  await recordActivity({
    leadId: input.leadId,
    kind: "followup",
    summary: `Follow-up moved${input.via ? ` (${input.via})` : ""}`,
    fromValue: input.from.toLocaleString("en-IN"),
    toValue: input.dueAt.toLocaleString("en-IN"),
    actorId: input.actorId,
  });

  await syncNextFollowUp(input.leadId);
}

export async function addLeadNote(input: {
  leadId: string;
  body: string;
  kind?: "note" | "followup";
  actorId: string;
  via?: string;
}) {
  await db().insert(leadNotes).values({
    id: newId(),
    leadId: input.leadId,
    body: input.body,
    kind: input.kind ?? "note",
    authorId: input.actorId,
  });

  await recordActivity({
    leadId: input.leadId,
    kind: "note",
    summary: `Note added${input.via ? ` (${input.via})` : ""}`,
    actorId: input.actorId,
  });
}

/**
 * Returns `changed: false` when the lead is already in that state, so callers
 * can say "already there" rather than reporting a change that did not happen.
 */
export async function setLeadStatus(input: {
  leadId: string;
  from: LeadStatus;
  status: LeadStatus;
  actorId: string;
  via?: string;
}): Promise<{ changed: boolean }> {
  if (input.from === input.status) return { changed: false };

  const closing = input.status === "closed_won" || input.status === "closed_lost";

  await db()
    .update(leads)
    .set({
      status: input.status,
      // Cleared when a lead reopens, or a reopened lead keeps a close date.
      closedAt: closing ? new Date() : null,
      updatedAt: sql`now()`,
    })
    .where(eq(leads.id, input.leadId));

  await recordActivity({
    leadId: input.leadId,
    kind: "status",
    summary: `Status changed from ${input.from.replace(/_/g, " ")} to ${input.status.replace(/_/g, " ")}${input.via ? ` (${input.via})` : ""}`,
    fromValue: input.from,
    toValue: input.status,
    actorId: input.actorId,
  });

  await audit({
    actorId: input.actorId,
    action: "lead.status_changed",
    entity: "lead",
    entityId: input.leadId,
    before: { status: input.from },
    after: { status: input.status, ...(input.via ? { channel: input.via } : {}) },
  });

  return { changed: true };
}

/** The earliest pending follow-up on a lead that belongs to this employee. */
export async function nextPendingFollowUp(leadId: string, assignedToId: string) {
  const [row] = await db()
    .select({
      id: leadFollowups.id,
      dueAt: leadFollowups.dueAt,
      kind: leadFollowups.kind,
    })
    .from(leadFollowups)
    .where(
      and(
        eq(leadFollowups.leadId, leadId),
        eq(leadFollowups.status, "pending"),
        eq(leadFollowups.assignedToId, assignedToId),
      ),
    )
    .orderBy(asc(leadFollowups.dueAt))
    .limit(1);
  return row ?? null;
}
