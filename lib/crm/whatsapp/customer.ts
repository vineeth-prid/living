import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  leadActivities,
  leadSources,
  properties,
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";
import { createLead, findDuplicateLeads, linkProperty, recordActivity } from "@/lib/leads";
import { formatPhone } from "@/lib/integrations/whatsapp/phone";
import { sendText } from "@/lib/integrations/whatsapp/service";
import { resolveProperty } from "./resolve";
import { notifyWhatsAppEnquiry } from "./events";
import { t } from "./templates";

// §1/§5/§8. The customer path.
//
// There is no branch in this file that can run a CRM command, change a status,
// or read an internal figure. A customer message becomes a lead or a timeline
// entry, and can be answered about availability — nothing else. "Delete my
// lead" from a customer is a message recorded against their lead, which is
// exactly what it should be.

export async function handleCustomerMessage(input: {
  conversationId: string;
  leadId: string | null;
  contactId: string;
  fromPhone: string;
  senderName: string | null;
  text: string;
}): Promise<void> {
  const text = input.text.trim();
  if (!text) return;

  // §4. What they are asking about, if it can be told without guessing.
  const property = await propertyInContext(input.conversationId, text);

  const existing = input.leadId ?? (await existingLeadFor(input.fromPhone));
  const leadId = existing ?? (await createLeadFor(input, text, property?.id ?? null));
  const isNew = !existing;

  await recordActivity({
    leadId,
    kind: "whatsapp_inbound",
    summary: `WhatsApp: ${text.slice(0, 300)}`,
  });

  if (property) {
    // §4. Kept on both: the lead so the CRM shows the interest, the
    // conversation so the next message has context without re-deriving it.
    await linkProperty({ leadId, propertyId: property.id, actorId: null });
    await db()
      .update(whatsappConversations)
      .set({ propertyId: property.id, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, input.conversationId));
  }

  // §7. The team hears about a new enquiry. createLead already emails them
  // (notifyWebsiteEnquiry); this adds the WhatsApp notice for staff who have it
  // enabled, and only on the first message — not on every reply.
  if (isNew) {
    void notifyWhatsAppEnquiry({
      leadId,
      name: input.senderName?.trim() || formatPhone(input.fromPhone),
      propertyLabel: property?.reference ?? property?.name ?? null,
    });
  }

  // §29. Availability is answered from the database, never from what an older
  // message in the thread said — the CRM is authoritative, and a listing that
  // sold last week must not still read as available.
  const answer = await availabilityAnswer(text, property);
  if (answer) {
    await sendText({ to: input.fromPhone, text: answer, conversationId: input.conversationId });
    return;
  }

  // §6. Otherwise acknowledge once, on first contact only. A reply to every
  // message is an auto-responder, which is how a number gets reported.
  if (isNew) {
    await sendText({
      to: input.fromPhone,
      text: t.customerAcknowledged(property?.reference ?? null),
      conversationId: input.conversationId,
    });
  }
}

/**
 * §3. A lead already on file for this number.
 *
 * `resolveSender` looks this up too, but two messages arriving close together
 * both find nothing there and would both create a lead. Checking again here,
 * immediately before creating, closes most of that window — and matches on the
 * last ten digits, so a lead saved as "+91 98765 43210" is found.
 */
async function existingLeadFor(phone: string): Promise<string | null> {
  const duplicates = await findDuplicateLeads(phone);
  return duplicates[0]?.id ?? null;
}

async function createLeadFor(
  input: {
    contactId: string;
    conversationId: string;
    fromPhone: string;
    senderName: string | null;
  },
  text: string,
  propertyId: string | null,
): Promise<string> {
  const lead = await createLead({
    name: input.senderName?.trim() || `WhatsApp ${formatPhone(input.fromPhone)}`,
    mobile: input.fromPhone,
    // §2. Null rather than a key that isn't there: the source list is seeded
    // data, and a missing row must cost the attribution, never the enquiry.
    sourceKey: await whatsappSourceKey(),
    initialMessage: text.slice(0, 2000),
    propertyIds: propertyId ? [propertyId] : [],
  });

  await db()
    .update(whatsappContacts)
    .set({ leadId: lead.id, contactType: "customer", updatedAt: new Date() })
    .where(eq(whatsappContacts.id, input.contactId));

  await db()
    .update(whatsappConversations)
    .set({ leadId: lead.id, updatedAt: new Date() })
    .where(eq(whatsappConversations.id, input.conversationId));

  return lead.id;
}

/**
 * `leads.source_key` is a foreign key into a seeded table. If the seed has not
 * been run, inserting "whatsapp" fails and the enquiry is lost — which is the
 * one outcome this system must never produce.
 */
const globalForSource = globalThis as unknown as { __waSourceKey?: string | null };

async function whatsappSourceKey(): Promise<string | null> {
  if (globalForSource.__waSourceKey !== undefined) return globalForSource.__waSourceKey;

  const [row] = await db()
    .select({ key: leadSources.key })
    .from(leadSources)
    .where(eq(leadSources.key, "whatsapp"))
    .limit(1);

  if (!row) {
    console.warn(
      "[whatsapp] no 'whatsapp' row in lead_sources — leads will be created without a source. Run npm run db:seed.",
    );
  }
  globalForSource.__waSourceKey = row?.key ?? null;
  return globalForSource.__waSourceKey;
}

const AVAILABILITY = /\b(available|still (there|on|open)|sold|sold out|booked|on the market)\b/i;

type PropertyContext = {
  id: string;
  reference: string | null;
  name: string;
  locality: string;
  priceLabel: string;
  workflowStatus: string;
  isPublic: boolean;
};

/**
 * §29. Answers "is this still available?" about the listing the thread is
 * about.
 *
 * Deliberately narrow. This is the one question a customer gets an automated
 * answer to, and the projection carries no internal figure.
 */
async function availabilityAnswer(
  text: string,
  property: PropertyContext | null,
): Promise<string | null> {
  if (!AVAILABILITY.test(text) || !property) return null;

  const live = property.isPublic && property.workflowStatus === "published";
  const gone = ["sold", "rented", "off_market", "archived"].includes(
    property.workflowStatus,
  );
  const label = `${property.name} (${property.reference ?? "—"}) in ${property.locality}`;

  if (live) {
    return `Yes — ${label} is available at ${property.priceLabel}. Would you like us to arrange a viewing?`;
  }
  if (gone) {
    return `${label} is no longer available. We can suggest similar properties — shall we have someone call you?`;
  }
  // Reserved, draft, under review: not a yes and not a no, and not something to
  // guess at in an automated reply.
  return `Let me check on ${label} and come back to you — one of our team will be in touch shortly.`;
}

/**
 * §4. The property this conversation is about: the one already pinned to it,
 * or one the message names unambiguously.
 *
 * "Unambiguously" is the whole rule. A message matching three listings links
 * none of them — attaching a lead to the wrong property is worse than
 * attaching it to nothing, because nobody goes looking for a link that is
 * already there.
 */
async function propertyInContext(
  conversationId: string,
  text: string,
): Promise<PropertyContext | null> {
  const [conversation] = await db()
    .select({ propertyId: whatsappConversations.propertyId })
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, conversationId))
    .limit(1);

  if (conversation?.propertyId) {
    const [row] = await db()
      .select({
        id: properties.id,
        reference: properties.reference,
        name: properties.name,
        locality: properties.locality,
        priceLabel: properties.priceLabel,
        workflowStatus: properties.workflowStatus,
        isPublic: properties.isPublic,
      })
      .from(properties)
      .where(and(eq(properties.id, conversation.propertyId), isNull(properties.deletedAt)))
      .limit(1);
    if (row) return row;
  }

  const found = await resolveProperty({ text });
  return found.kind === "one" ? found.value : null;
}

/**
 * §52. Recent turns of a conversation, for context.
 *
 * Bounded on purpose: the last few messages, not the whole history. And it is
 * only ever context — the database decides what is true, so nothing read here
 * can override a listing's current state.
 */
export async function conversationContext(conversationId: string, limit = 6) {
  const messages = await db()
    .select({
      direction: whatsappMessages.direction,
      text: whatsappMessages.text,
      createdAt: whatsappMessages.createdAt,
    })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.conversationId, conversationId))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(limit);

  const [conversation] = await db()
    .select({ leadId: whatsappConversations.leadId })
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, conversationId))
    .limit(1);

  const activities = conversation?.leadId
    ? await db()
        .select({ kind: leadActivities.kind, summary: leadActivities.summary })
        .from(leadActivities)
        .where(eq(leadActivities.leadId, conversation.leadId))
        .orderBy(desc(leadActivities.createdAt))
        .limit(3)
    : [];

  return { messages: messages.reverse(), activities };
}
