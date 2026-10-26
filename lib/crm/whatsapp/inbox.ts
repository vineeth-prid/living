import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  leads,
  users,
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";

// §B10. Reads for the messaging inbox.
//
// The inbox is a view over data the integration was already storing — every
// inbound and outbound message has been in `whatsapp_messages` since the
// integration shipped. Nothing here is a new source of truth, which is why it
// can be added without touching the inbound path at all.

export type ThreadFilter = "all" | "customers" | "employees" | "unanswered";

/**
 * One row per conversation, newest activity first.
 *
 * The last message and the unanswered flag are computed in SQL rather than by
 * reading every thread's messages in the page — the N+1 version of this screen
 * is a query per conversation, and a busy week is several hundred of them.
 */
export async function listThreads({
  filter = "all",
  q,
  limit = 60,
}: {
  filter?: ThreadFilter;
  q?: string;
  limit?: number;
} = {}) {
  // Correlated subqueries, one per column, against
  // whatsapp_messages_conversation_idx — which is (conversation_id, created_at)
  // and so answers each of these with a single index lookup.
  const lastMessage = sql<string | null>`(
    select m.text from whatsapp_messages m
    where m.conversation_id = ${whatsappConversations.id}
    order by m.created_at desc limit 1
  )`;
  const lastDirection = sql<string | null>`(
    select m.direction from whatsapp_messages m
    where m.conversation_id = ${whatsappConversations.id}
    order by m.created_at desc limit 1
  )`;
  const messageCount = sql<number>`(
    select count(*)::int from whatsapp_messages m
    where m.conversation_id = ${whatsappConversations.id}
  )`;

  const rows = await db()
    .select({
      id: whatsappConversations.id,
      chatId: whatsappConversations.chatId,
      lastMessageAt: whatsappConversations.lastMessageAt,
      contactId: whatsappContacts.id,
      phoneNumber: whatsappContacts.phoneNumber,
      displayName: whatsappContacts.displayName,
      contactType: whatsappContacts.contactType,
      isAllowed: whatsappContacts.isAllowed,
      optedOutAt: whatsappContacts.marketingOptOutAt,
      leadId: whatsappConversations.leadId,
      leadName: leads.name,
      leadReference: leads.reference,
      leadStatus: leads.status,
      employeeName: users.fullName,
      lastMessage,
      lastDirection,
      messageCount,
    })
    .from(whatsappConversations)
    .innerJoin(
      whatsappContacts,
      eq(whatsappContacts.id, whatsappConversations.contactId),
    )
    .leftJoin(leads, eq(leads.id, whatsappConversations.leadId))
    .leftJoin(users, eq(users.id, whatsappConversations.employeeId))
    .where(
      and(
        filter === "customers"
          ? eq(whatsappContacts.contactType, "customer")
          : undefined,
        filter === "employees"
          ? eq(whatsappContacts.contactType, "employee")
          : undefined,
        // "Unanswered" is the question the inbox exists to answer: the last
        // thing in the thread came from them and nobody has replied.
        filter === "unanswered" ? sql`${lastDirection} = 'inbound'` : undefined,
        q
          ? or(
              ilike(whatsappContacts.phoneNumber, `%${q}%`),
              ilike(whatsappContacts.displayName, `%${q}%`),
              ilike(leads.name, `%${q}%`),
              ilike(leads.reference, `%${q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(whatsappConversations.lastMessageAt))
    .limit(limit);

  return rows;
}

/** Counts for the filter tabs. */
export async function threadCounts() {
  const [row] = await db()
    .select({
      total: sql<number>`count(*)::int`,
      customers: sql<number>`count(*) filter (where ${whatsappContacts.contactType} = 'customer')::int`,
      employees: sql<number>`count(*) filter (where ${whatsappContacts.contactType} = 'employee')::int`,
      unanswered: sql<number>`count(*) filter (where (
        select m.direction from whatsapp_messages m
        where m.conversation_id = ${whatsappConversations.id}
        order by m.created_at desc limit 1
      ) = 'inbound')::int`,
    })
    .from(whatsappConversations)
    .innerJoin(
      whatsappContacts,
      eq(whatsappContacts.id, whatsappConversations.contactId),
    );

  return (
    row ?? { total: 0, customers: 0, employees: 0, unanswered: 0 }
  );
}

/** One thread: who it is with, and what has been said. */
export async function getThread(conversationId: string) {
  const [thread] = await db()
    .select({
      id: whatsappConversations.id,
      chatId: whatsappConversations.chatId,
      contactId: whatsappContacts.id,
      phoneNumber: whatsappContacts.phoneNumber,
      displayName: whatsappContacts.displayName,
      contactType: whatsappContacts.contactType,
      isAllowed: whatsappContacts.isAllowed,
      optedOutAt: whatsappContacts.marketingOptOutAt,
      leadId: whatsappConversations.leadId,
      leadName: leads.name,
      leadReference: leads.reference,
      leadStatus: leads.status,
      leadMobile: leads.mobile,
      propertyId: whatsappConversations.propertyId,
      employeeName: users.fullName,
      lastMessageAt: whatsappConversations.lastMessageAt,
    })
    .from(whatsappConversations)
    .innerJoin(
      whatsappContacts,
      eq(whatsappContacts.id, whatsappConversations.contactId),
    )
    .leftJoin(
      leads,
      and(eq(leads.id, whatsappConversations.leadId), isNull(leads.deletedAt)),
    )
    .leftJoin(users, eq(users.id, whatsappConversations.employeeId))
    .where(eq(whatsappConversations.id, conversationId))
    .limit(1);

  if (!thread) return null;

  const messages = await db()
    .select({
      id: whatsappMessages.id,
      direction: whatsappMessages.direction,
      text: whatsappMessages.text,
      messageType: whatsappMessages.messageType,
      mediaMetadata: whatsappMessages.mediaMetadata,
      status: whatsappMessages.status,
      error: whatsappMessages.error,
      createdAt: whatsappMessages.createdAt,
      sentAt: whatsappMessages.sentAt,
    })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.conversationId, conversationId))
    // Oldest first: a chat reads downwards. The last 200 turns, because a
    // thread with a thousand messages in it is a page nobody can load.
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(200);

  return { thread, messages: messages.reverse() };
}
