import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, properties, users } from "@/lib/db/schema";
import { normalisePhone } from "@/lib/integrations/whatsapp/phone";
import { isWhatsAppEnabled } from "@/lib/integrations/whatsapp/config";
import { sendText } from "@/lib/integrations/whatsapp/service";
import { inr } from "./templates";

// §51. CRM events that are worth a WhatsApp message.
//
// Loose coupling in the only sense that matters here: every function returns
// void, catches its own failures and is safe to call without awaiting a result.
// A lead is assigned whether or not the notification leaves (§50) — the CRM
// write has already committed by the time any of this runs.
//
// Deliberately not a generic event bus. There is no publisher, no subscriber
// registry and no queue, because there are four events and one channel; the
// abstraction would be larger than the thing it abstracts.

/** WhatsApp number for a member of staff, if they are set up for it (§13). */
async function reachable(userId: string | null): Promise<string | null> {
  if (!userId || !isWhatsAppEnabled()) return null;

  const [user] = await db()
    .select({
      mobile: users.mobile,
      whatsappNumber: users.whatsappNumber,
      whatsappEnabled: users.whatsappEnabled,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.isActive || !user.whatsappEnabled) return null;
  return normalisePhone(user.whatsappNumber ?? user.mobile)?.phoneNumber ?? null;
}

/** Never throws, never blocks the caller's outcome. */
async function tell(userId: string | null, text: string) {
  try {
    const to = await reachable(userId);
    if (!to) return;
    await sendText({ to, text });
  } catch (error) {
    console.error("[whatsapp] notification failed", error);
  }
}

export async function notifyLeadAssigned(leadId: string, assigneeId: string | null) {
  if (!assigneeId) return;
  const [lead] = await db()
    .select({
      name: leads.name,
      reference: leads.reference,
      mobile: leads.mobile,
      budgetMax: leads.budgetMax,
      city: leads.city,
      priority: leads.priority,
    })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!lead) return;

  await tell(
    assigneeId,
    [
      `*New lead assigned to you*`,
      `${lead.name} — ${lead.reference}`,
      `${lead.mobile}${lead.city ? ` · ${lead.city}` : ""}`,
      lead.budgetMax ? `Budget up to ${inr(lead.budgetMax)}` : null,
      lead.priority === "hot" ? "🔥 Hot" : null,
      "",
      "Reply *show me " + lead.name + "* for the details.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

export async function notifyLeadCreated(leadId: string, assigneeId: string | null) {
  if (!assigneeId) return;
  const [lead] = await db()
    .select({ name: leads.name, reference: leads.reference, mobile: leads.mobile })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!lead) return;

  await tell(
    assigneeId,
    `*New enquiry* — ${lead.name} (${lead.reference}), ${lead.mobile}.`,
  );
}

/**
 * §7. A WhatsApp enquiry has just become a lead.
 *
 * It arrives unassigned — nobody has picked it up yet — so this goes to the
 * administrators who have WhatsApp enabled. Email has already gone to the team
 * via createLead's notifyWebsiteEnquiry; this is the second channel, not a
 * replacement, and it fires once per lead rather than once per message.
 *
 * Capped deliberately. A handful of internal notices is expected traffic; a
 * message to every account on every enquiry is the pattern that gets a number
 * restricted (§68).
 */
export async function notifyWhatsAppEnquiry(input: {
  leadId: string;
  name: string;
  propertyLabel: string | null;
}) {
  if (!isWhatsAppEnabled()) return;

  const [lead] = await db()
    .select({ reference: leads.reference, mobile: leads.mobile })
    .from(leads)
    .where(eq(leads.id, input.leadId))
    .limit(1);
  if (!lead) return;

  const recipients = await db()
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        eq(users.whatsappEnabled, true),
        eq(users.role, "admin"),
      ),
    )
    .limit(3);

  const message = [
    "🔔 *New WhatsApp enquiry*",
    input.name,
    input.propertyLabel ? `Interested in ${input.propertyLabel}` : null,
    `${lead.mobile} · ${lead.reference}`,
    "Please follow up.",
  ]
    .filter(Boolean)
    .join("\n");

  for (const recipient of recipients) await tell(recipient.id, message);
}

export async function notifyFollowupCreated(input: {
  assigneeId: string | null;
  leadName: string;
  when: string;
  /** Suppressed when the person who scheduled it is the person doing it. */
  scheduledById: string | null;
}) {
  if (!input.assigneeId || input.assigneeId === input.scheduledById) return;
  await tell(
    input.assigneeId,
    `*Follow-up scheduled for you* — ${input.leadName}, ${input.when}.`,
  );
}

export async function notifyPropertyPublished(propertyId: string, actorId: string | null) {
  const [property] = await db()
    .select({ reference: properties.reference, name: properties.name })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!property) return;

  await tell(
    actorId,
    `✅ ${property.reference ?? property.name} is now live on livingbyitr.com.`,
  );
}
