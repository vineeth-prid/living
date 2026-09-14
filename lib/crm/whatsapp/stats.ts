import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  leads,
  whatsappCommandExecutions,
  whatsappConversations,
  whatsappMessages,
  whatsappSessions,
} from "@/lib/db/schema";

// §63/§64. Operational figures for the admin dashboard, and per-employee
// activity for the workspace.
//
// Both windows are computed in Postgres rather than JavaScript: one clock, and
// it is the one the rows were written against.

const DAY = sql`now() - interval '24 hours'`;

/** §63 — admin only. Everything that happened over WhatsApp today. */
export async function whatsappDayStats() {
  const [[messages], [commands], [created], [session]] = await Promise.all([
    db()
      .select({
        inbound: sql<number>`count(*) filter (where ${whatsappMessages.direction} = 'inbound')::int`,
        outbound: sql<number>`count(*) filter (where ${whatsappMessages.direction} = 'outbound')::int`,
        failed: sql<number>`count(*) filter (where ${whatsappMessages.status} = 'failed')::int`,
      })
      .from(whatsappMessages)
      .where(gte(whatsappMessages.createdAt, DAY)),

    db()
      .select({
        executed: sql<number>`count(*) filter (where ${whatsappCommandExecutions.status} = 'executed')::int`,
        clarify: sql<number>`count(*) filter (where ${whatsappCommandExecutions.status} = 'awaiting_clarification')::int`,
        failed: sql<number>`count(*) filter (where ${whatsappCommandExecutions.status} in ('failed','rejected'))::int`,
        followups: sql<number>`count(*) filter (where ${whatsappCommandExecutions.intent} in ('ADD_FOLLOWUP','RESCHEDULE_FOLLOWUP') and ${whatsappCommandExecutions.status} = 'executed')::int`,
      })
      .from(whatsappCommandExecutions)
      .where(gte(whatsappCommandExecutions.createdAt, DAY)),

    // Leads whose source is the channel itself — the number that answers
    // "is WhatsApp bringing anything in?".
    db()
      .select({ total: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.sourceKey, "whatsapp"), gte(leads.createdAt, DAY))),

    db()
      .select({
        status: whatsappSessions.status,
        lastInboundAt: whatsappSessions.lastInboundAt,
      })
      .from(whatsappSessions)
      .orderBy(desc(whatsappSessions.updatedAt))
      .limit(1),
  ]);

  return {
    inbound: messages?.inbound ?? 0,
    outbound: messages?.outbound ?? 0,
    failedMessages: messages?.failed ?? 0,
    commandsExecuted: commands?.executed ?? 0,
    commandsClarifying: commands?.clarify ?? 0,
    commandsFailed: commands?.failed ?? 0,
    followupsCreated: commands?.followups ?? 0,
    leadsCreated: created?.total ?? 0,
    status: session?.status ?? null,
    lastInboundAt: session?.lastInboundAt ?? null,
  };
}

/**
 * §64 — one employee's own recent WhatsApp activity. Scoped by employeeId at
 * the query, so the workspace cannot show another person's traffic.
 */
export async function myWhatsAppActivity(userId: string, limit = 6) {
  return db()
    .select({
      id: whatsappCommandExecutions.id,
      intent: whatsappCommandExecutions.intent,
      status: whatsappCommandExecutions.status,
      summary: whatsappCommandExecutions.resultSummary,
      targetEntity: whatsappCommandExecutions.targetEntity,
      targetEntityId: whatsappCommandExecutions.targetEntityId,
      createdAt: whatsappCommandExecutions.createdAt,
    })
    .from(whatsappCommandExecutions)
    .where(eq(whatsappCommandExecutions.employeeId, userId))
    .orderBy(desc(whatsappCommandExecutions.createdAt))
    .limit(limit);
}

/** Anything still waiting on this employee to answer (§57). */
export async function myPendingWhatsApp(userId: string) {
  const rows = await db()
    .select({
      id: whatsappCommandExecutions.id,
      intent: whatsappCommandExecutions.intent,
      question: whatsappCommandExecutions.resultSummary,
      status: whatsappCommandExecutions.status,
    })
    .from(whatsappCommandExecutions)
    .leftJoin(
      whatsappConversations,
      eq(whatsappConversations.id, whatsappCommandExecutions.conversationId),
    )
    .where(
      and(
        eq(whatsappCommandExecutions.employeeId, userId),
        sql`${whatsappCommandExecutions.status} in ('awaiting_confirmation','awaiting_clarification')`,
        sql`${whatsappCommandExecutions.expiresAt} > now()`,
      ),
    )
    .orderBy(desc(whatsappCommandExecutions.createdAt))
    .limit(5);
  return rows;
}
