"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  FOLLOWUP_KINDS,
  FOLLOWUP_STATUSES,
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  leadFollowups,
  leadProperties,
  leads,
  users,
  type LeadStatus,
} from "@/lib/db/schema";
import { fail, requireUser, succeed, type ActionResult } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { createLead, linkProperty, recordActivity } from "@/lib/leads";
import { notifyLeadAssigned } from "@/lib/notify";
import {
  addLeadNote,
  scheduleFollowUp,
  setFollowUpStatus as applyFollowUpStatus,
  setLeadStatus,
} from "@/lib/leads.service";
import { visibleTo } from "@/lib/leads.admin";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Loads a lead the caller is actually allowed to touch.
 *
 * Every mutation below starts here. An employee who guesses another team
 * member's lead id gets "no longer exists" rather than a write — authorisation
 * is by query, not by an `if` a future edit could forget.
 */
async function loadWritable(user: SessionUser, id: string) {
  const [row] = await db()
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), isNull(leads.deletedAt), visibleTo(user)))
    .limit(1);
  return row ?? null;
}

function touch(id: string) {
  revalidatePath(`/admin/leads/${id}`);
  revalidatePath("/admin/leads");
  revalidatePath("/admin/leads/pipeline");
  revalidatePath("/admin/followups");
  revalidatePath("/admin/workspace");
}

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : null))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Enter a number.");

const leadSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  mobile: z
    .string()
    .trim()
    .regex(/^[+0-9][0-9 ()-]{6,19}$/, "Enter a valid phone number."),
  altMobile: optionalText,
  email: z
    .string()
    .trim()
    .email("Enter a valid email.")
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((v) => v ?? null),
  preferredContact: optionalText,
  location: optionalText,
  city: optionalText,
  country: optionalText,
  typeKey: optionalText,
  propertyKind: z
    .enum(["residential", "commercial"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  requirementType: optionalText,
  preferredLocation: optionalText,
  budgetMin: optionalNumber,
  budgetMax: optionalNumber,
  preferredPropertyType: optionalText,
  bedrooms: optionalNumber,
  landRequirement: optionalText,
  timeline: optionalText,
  purpose: optionalText,
  sourceKey: optionalText,
  campaign: optionalText,
  initialMessage: optionalText,
  assignedToId: optionalText,
  propertyIds: z.array(z.string()).default([]),
});

function parseLead(formData: FormData) {
  return leadSchema.safeParse({
    ...Object.fromEntries(formData),
    propertyIds: formData.getAll("propertyIds").map(String).filter(Boolean),
  });
}

export async function createLeadAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireUser();
  const parsed = parseLead(formData);
  if (!parsed.success) {
    return fail("Check the form.", z.flattenError(parsed.error).fieldErrors);
  }
  const input = parsed.data;

  // Only an admin may hand a lead to someone else; an employee's new lead is
  // their own. Without this, the assignee dropdown would be the authorisation.
  const assignedToId =
    actor.role === "admin" ? (input.assignedToId ?? null) : actor.id;

  const { id } = await createLead({
    ...input,
    budgetMin: input.budgetMin,
    budgetMax: input.budgetMax,
    bedrooms: input.bedrooms,
    assignedToId,
    createdById: actor.id,
    propertyIds: input.propertyIds,
  });

  await audit({
    actorId: actor.id,
    action: "lead.created",
    entity: "lead",
    entityId: id,
    after: { name: input.name, mobile: input.mobile },
  });

  touch(id);
  return succeed({ id });
}

export async function createLeadAndOpen(
  prev: ActionResult<{ id: string }> | null,
  formData: FormData,
) {
  const result = await createLeadAction(prev, formData);
  if (result.ok) redirect(`/admin/leads/${result.data.id}`);
  return result;
}

export async function updateLeadAction(
  id: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireUser();
  const before = await loadWritable(actor, id);
  if (!before) return fail("That lead no longer exists.");

  const parsed = parseLead(formData);
  if (!parsed.success) {
    return fail("Check the form.", z.flattenError(parsed.error).fieldErrors);
  }
  const input = parsed.data;

  await db()
    .update(leads)
    .set({
      name: input.name,
      mobile: input.mobile,
      altMobile: input.altMobile,
      email: input.email,
      preferredContact: input.preferredContact,
      location: input.location,
      city: input.city,
      country: input.country,
      typeKey: input.typeKey,
      propertyKind: input.propertyKind ?? null,
      requirementType: input.requirementType,
      preferredLocation: input.preferredLocation,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      preferredPropertyType: input.preferredPropertyType,
      bedrooms: input.bedrooms,
      landRequirement: input.landRequirement,
      timeline: input.timeline,
      purpose: input.purpose,
      sourceKey: input.sourceKey,
      campaign: input.campaign,
      updatedAt: sql`now()`,
    })
    .where(eq(leads.id, id));

  await audit({
    actorId: actor.id,
    action: "lead.updated",
    entity: "lead",
    entityId: id,
  });

  touch(id);
  return succeed({ id });
}

/** Rule 6 — a status change always writes a timeline entry. */
export async function changeStatus(
  id: string,
  status: LeadStatus,
): Promise<ActionResult<null>> {
  const actor = await requireUser();
  if (!LEAD_STATUSES.includes(status)) return fail("Unknown status.");

  const before = await loadWritable(actor, id);
  if (!before) return fail("That lead no longer exists.");
  if (before.status === status) return succeed(null);

  await setLeadStatus({
    leadId: id,
    from: before.status,
    status,
    actorId: actor.id,
  });

  touch(id);
  return succeed(null);
}

export async function changePriority(
  id: string,
  priority: (typeof LEAD_PRIORITIES)[number],
): Promise<ActionResult<null>> {
  const actor = await requireUser();
  if (!LEAD_PRIORITIES.includes(priority)) return fail("Unknown priority.");

  const before = await loadWritable(actor, id);
  if (!before) return fail("That lead no longer exists.");

  await db()
    .update(leads)
    .set({ priority, updatedAt: sql`now()` })
    .where(eq(leads.id, id));

  await recordActivity({
    leadId: id,
    kind: "priority",
    summary: `Priority set to ${priority}`,
    fromValue: before.priority,
    toValue: priority,
    actorId: actor.id,
  });

  touch(id);
  return succeed(null);
}

/** Assignment and reassignment are administrator actions (§23). */
export async function assignLead(
  id: string,
  employeeId: string | null,
): Promise<ActionResult<null>> {
  const actor = await requireUser();
  if (actor.role !== "admin") {
    return fail("Only an administrator can reassign a lead.");
  }

  const before = await loadWritable(actor, id);
  if (!before) return fail("That lead no longer exists.");

  let name = "nobody";
  let assigneeEmail: string | null = null;
  if (employeeId) {
    const [employee] = await db()
      .select({
        fullName: users.fullName,
        email: users.email,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, employeeId))
      .limit(1);
    if (!employee) return fail("That employee doesn't exist.");
    if (!employee.isActive) return fail("That employee is deactivated.");
    name = employee.fullName;
    assigneeEmail = employee.email;
  }

  await db()
    .update(leads)
    .set({
      assignedToId: employeeId,
      assignedAt: employeeId ? new Date() : null,
      assignedById: actor.id,
      updatedAt: sql`now()`,
    })
    .where(eq(leads.id, id));

  await recordActivity({
    leadId: id,
    kind: "assigned",
    summary: `Lead assigned to ${name}`,
    fromValue: before.assignedToId,
    toValue: employeeId,
    actorId: actor.id,
  });

  await audit({
    actorId: actor.id,
    action: before.assignedToId ? "lead.reassigned" : "lead.assigned",
    entity: "lead",
    entityId: id,
    before: { assignedToId: before.assignedToId },
    after: { assignedToId: employeeId },
  });

  // Fire-and-forget: an unreachable mail server must not fail an assignment
  // that already succeeded. Unassigning notifies nobody.
  if (assigneeEmail && employeeId !== before.assignedToId) {
    notifyLeadAssigned({
      leadId: id,
      reference: before.reference,
      leadName: before.name,
      mobile: before.mobile,
      assigneeEmail,
      assigneeName: name,
      assignedByName: actor.fullName,
    });
  }

  // §51: the same event, the other channel. Email stays primary; WhatsApp is
  // additive and, like the email above, cannot fail an assignment that has
  // already committed.
  if (employeeId && employeeId !== before.assignedToId) {
  }

  touch(id);
  return succeed(null);
}

/** Rule 11 — notes are appended, never edited or overwritten. */
export async function addNote(
  id: string,
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const actor = await requireUser();
  const lead = await loadWritable(actor, id);
  if (!lead) return fail("That lead no longer exists.");

  const parsed = z
    .object({
      body: z.string().trim().min(1, "Write something first.").max(5000),
      kind: z.enum(["note", "followup"]).catch("note"),
    })
    .safeParse({ body: formData.get("body"), kind: formData.get("kind") });

  if (!parsed.success) return fail("Write something first.");

  await addLeadNote({
    leadId: id,
    body: parsed.data.body,
    kind: parsed.data.kind,
    actorId: actor.id,
  });

  touch(id);
  return succeed(null);
}

/** Logged interactions — a call, a meeting, a WhatsApp exchange (§25). */
export async function logInteraction(
  id: string,
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const actor = await requireUser();
  const lead = await loadWritable(actor, id);
  if (!lead) return fail("That lead no longer exists.");

  const parsed = z
    .object({
      kind: z.enum(FOLLOWUP_KINDS),
      summary: z.string().trim().max(500).optional(),
    })
    .safeParse({ kind: formData.get("kind"), summary: formData.get("summary") });

  if (!parsed.success) return fail("Choose an interaction type.");

  const label = parsed.data.kind.replace(/_/g, " ");
  await recordActivity({
    leadId: id,
    kind: parsed.data.kind,
    summary: parsed.data.summary
      ? `${label}: ${parsed.data.summary}`
      : `${label} logged`,
    actorId: actor.id,
  });

  await db()
    .update(leads)
    .set({ lastContactedAt: new Date(), updatedAt: sql`now()` })
    .where(eq(leads.id, id));

  touch(id);
  return succeed(null);
}

export async function addFollowUp(
  id: string,
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const actor = await requireUser();
  const lead = await loadWritable(actor, id);
  if (!lead) return fail("That lead no longer exists.");

  const parsed = z
    .object({
      date: z.string().min(1, "Pick a date."),
      time: z.string().optional(),
      kind: z.enum(FOLLOWUP_KINDS),
      notes: z.string().trim().max(1000).optional(),
      assignedToId: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) return fail("Pick a date and a follow-up type.");
  const input = parsed.data;

  const dueAt = new Date(`${input.date}T${input.time || "09:00"}`);
  if (Number.isNaN(dueAt.getTime())) return fail("That date isn't valid.");

  // Employees schedule for themselves; only an admin can assign the task on.
  const assignedToId =
    actor.role === "admin" && input.assignedToId
      ? input.assignedToId
      : (lead.assignedToId ?? actor.id);

  await scheduleFollowUp({
    leadId: id,
    dueAt,
    kind: input.kind,
    notes: input.notes,
    assignedToId,
    actorId: actor.id,
  });

  touch(id);
  return succeed(null);
}

/** Rule 7 — a follow-up stays visible until completed or cancelled. */
export async function setFollowUpStatus(
  followUpId: string,
  status: (typeof FOLLOWUP_STATUSES)[number],
): Promise<ActionResult<null>> {
  const actor = await requireUser();
  if (!FOLLOWUP_STATUSES.includes(status)) return fail("Unknown status.");

  const [followUp] = await db()
    .select({ id: leadFollowups.id, leadId: leadFollowups.leadId, kind: leadFollowups.kind })
    .from(leadFollowups)
    .where(eq(leadFollowups.id, followUpId))
    .limit(1);
  if (!followUp) return fail("That follow-up no longer exists.");

  const lead = await loadWritable(actor, followUp.leadId);
  if (!lead) return fail("That lead no longer exists.");

  await applyFollowUpStatus({
    followUpId,
    leadId: followUp.leadId,
    kind: followUp.kind,
    status,
    actorId: actor.id,
  });

  touch(followUp.leadId);
  return succeed(null);
}

export async function linkPropertyAction(
  id: string,
  propertyId: string,
): Promise<ActionResult<null>> {
  const actor = await requireUser();
  const lead = await loadWritable(actor, id);
  if (!lead) return fail("That lead no longer exists.");

  await linkProperty({ leadId: id, propertyId, actorId: actor.id });
  touch(id);
  revalidatePath(`/admin/properties/${propertyId}`);
  return succeed(null);
}

export async function unlinkPropertyAction(
  id: string,
  propertyId: string,
): Promise<ActionResult<null>> {
  const actor = await requireUser();
  const lead = await loadWritable(actor, id);
  if (!lead) return fail("That lead no longer exists.");

  await db()
    .delete(leadProperties)
    .where(
      and(eq(leadProperties.leadId, id), eq(leadProperties.propertyId, propertyId)),
    );

  // The link is removed, but the timeline entry recording that it once existed
  // stays (Rule 11).
  await recordActivity({
    leadId: id,
    kind: "property_unlinked",
    summary: "Property association removed",
    toValue: propertyId,
    actorId: actor.id,
  });

  touch(id);
  revalidatePath(`/admin/properties/${propertyId}`);
  return succeed(null);
}
