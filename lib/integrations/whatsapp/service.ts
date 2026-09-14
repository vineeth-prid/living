import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
  whatsappSessions,
  type WhatsAppContactType,
} from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { OUTBOUND_RATE, isWhatsAppEnabled, openWAConfig } from "./config";
import { OpenWAProvider } from "./openwa/provider";
import { normalisePhone } from "./phone";
import type { SendResult, WhatsAppProvider } from "./types";

// The seam (§2). CRM code calls this module and never a provider directly, so
// swapping OpenWA for Meta's Cloud API touches one function here and nothing
// in leads, properties or follow-ups.

let cachedProvider: WhatsAppProvider | null = null;

export function whatsappProvider(): WhatsAppProvider {
  cachedProvider ??= new OpenWAProvider();
  return cachedProvider;
}

/**
 * The Living-side row for the configured provider session, created on first
 * use. §43: this does not start or create a WhatsApp session — the connection
 * is managed on the VPS. It only records the one Living is configured against.
 */
export async function currentSessionRow() {
  const config = openWAConfig();
  const [existing] = await db()
    .select()
    .from(whatsappSessions)
    .where(
      and(
        eq(whatsappSessions.provider, "openwa"),
        eq(whatsappSessions.providerSessionId, config.sessionId),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [created] = await db()
    .insert(whatsappSessions)
    .values({
      id: newId(),
      provider: "openwa",
      providerSessionId: config.sessionId,
    })
    // A concurrent webhook and a page load can both get here first.
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  // Lost the insert race — the other writer's row is the one to use.
  const [row] = await db()
    .select()
    .from(whatsappSessions)
    .where(
      and(
        eq(whatsappSessions.provider, "openwa"),
        eq(whatsappSessions.providerSessionId, config.sessionId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Could not create or read the WhatsApp session row.");
  return row;
}

/** Upsert on the canonical number. Never invents a classification. */
export async function upsertContact(input: {
  phoneNumber: string;
  nationalDigits: string;
  whatsappId?: string | null;
  displayName?: string | null;
  contactType?: WhatsAppContactType;
  employeeId?: string | null;
  leadId?: string | null;
}) {
  const [row] = await db()
    .insert(whatsappContacts)
    .values({
      id: newId(),
      phoneNumber: input.phoneNumber,
      nationalDigits: input.nationalDigits,
      whatsappId: input.whatsappId ?? null,
      displayName: input.displayName ?? null,
      contactType: input.contactType ?? "unknown",
      employeeId: input.employeeId ?? null,
      leadId: input.leadId ?? null,
      lastMessageAt: new Date(),
    })
    .onConflictDoUpdate({
      target: whatsappContacts.phoneNumber,
      set: {
        // A name only ever improves: a later delivery arriving without a
        // pushName must not blank the one already recorded.
        displayName: sql`coalesce(excluded.display_name, ${whatsappContacts.displayName})`,
        whatsappId: sql`coalesce(excluded.whatsapp_id, ${whatsappContacts.whatsappId})`,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/** One conversation per (session, chat). Created on first contact. */
export async function upsertConversation(input: {
  sessionId: string;
  contactId: string;
  chatId: string;
  employeeId?: string | null;
  leadId?: string | null;
}) {
  const [existing] = await db()
    .select()
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.sessionId, input.sessionId),
        eq(whatsappConversations.chatId, input.chatId),
      ),
    )
    .limit(1);

  if (existing) {
    // Fill in associations discovered later without ever clearing one.
    const patch: Record<string, unknown> = { lastMessageAt: new Date() };
    if (input.employeeId && !existing.employeeId) patch.employeeId = input.employeeId;
    if (input.leadId && !existing.leadId) patch.leadId = input.leadId;
    await db()
      .update(whatsappConversations)
      .set(patch)
      .where(eq(whatsappConversations.id, existing.id));
    return { ...existing, ...patch } as typeof existing;
  }

  const [created] = await db()
    .insert(whatsappConversations)
    .values({
      id: newId(),
      sessionId: input.sessionId,
      contactId: input.contactId,
      chatId: input.chatId,
      employeeId: input.employeeId ?? null,
      leadId: input.leadId ?? null,
      lastMessageAt: new Date(),
    })
    .returning();
  return created;
}

// --- outbound -------------------------------------------------------------

/**
 * Process-wide outbound throttle (§47).
 *
 * ponytail: an in-process gap, matching the enquiry rate limiter already in
 * app/actions/enquiry.ts. Behind more than one instance each node throttles
 * separately, which for a handful of replies a minute is harmless — move both
 * to Postgres or Redis together if Living ever runs a fleet.
 */
const globalForRate = globalThis as unknown as {
  __waLastSend?: number;
  __waWindow?: number[];
};

function throttleCheck(): string | null {
  const now = Date.now();
  const window = (globalForRate.__waWindow ?? []).filter((t) => now - t < 60_000);
  if (window.length >= OUTBOUND_RATE.perMinute) {
    return "Outbound WhatsApp rate limit reached for this minute.";
  }
  globalForRate.__waWindow = window;
  return null;
}

async function spaceOut() {
  const gap = Date.now() - (globalForRate.__waLastSend ?? 0);
  if (gap < OUTBOUND_RATE.minGapMs) {
    await new Promise((r) => setTimeout(r, OUTBOUND_RATE.minGapMs - gap));
  }
  globalForRate.__waLastSend = Date.now();
  globalForRate.__waWindow = [...(globalForRate.__waWindow ?? []), Date.now()];
}

/**
 * The one way anything in Living sends a WhatsApp message.
 *
 * Never throws (§50). An unconfigured, unreachable or rate-limited provider
 * returns a failure that the caller is free to ignore — a CRM write must not
 * roll back because WhatsApp is down.
 */
export async function sendText(input: {
  to: string;
  text: string;
  /** Ties the message to what caused it, for the conversation timeline. */
  conversationId?: string;
}): Promise<SendResult> {
  if (!isWhatsAppEnabled()) {
    return { ok: false, error: "WhatsApp integration is disabled.", retryable: false };
  }

  const phone = normalisePhone(input.to);
  if (!phone) {
    return { ok: false, error: `Not a usable number: ${input.to}`, retryable: false };
  }

  const limited = throttleCheck();
  if (limited) return { ok: false, error: limited, retryable: true };
  await spaceOut();

  const session = await currentSessionRow();
  const contact = await upsertContact(phone);
  const conversation =
    input.conversationId
      ? null
      : await upsertConversation({
          sessionId: session.id,
          contactId: contact.id,
          chatId: `${phone.phoneNumber}@c.us`,
        });
  const conversationId = input.conversationId ?? conversation!.id;

  const messageId = newId();
  await db().insert(whatsappMessages).values({
    id: messageId,
    conversationId,
    direction: "outbound",
    recipientPhone: phone.phoneNumber,
    messageType: "text",
    text: input.text,
    status: "pending",
  });

  const result = await whatsappProvider().sendText({
    to: phone.phoneNumber,
    text: input.text,
  });

  await db()
    .update(whatsappMessages)
    .set(
      result.ok
        ? {
            status: "processed",
            providerMessageId: result.providerMessageId,
            sentAt: new Date(),
          }
        : { status: "failed", error: result.error.slice(0, 500) },
    )
    .where(eq(whatsappMessages.id, messageId));

  if (result.ok) {
    await db()
      .update(whatsappSessions)
      .set({ lastOutboundAt: new Date() })
      .where(eq(whatsappSessions.id, session.id));
  } else {
    // Logged, not thrown. The caller's CRM write has already committed.
    console.error("[whatsapp] send failed", {
      to: phone.nationalDigits,
      error: result.error,
    });
  }

  return result;
}

/**
 * §48/§49. Retries outbound messages that failed transiently.
 *
 * `whatsapp_messages` is the queue — rows sit at `failed` until this drains
 * them. There is no broker because this project has none to reuse, and adding
 * Redis for a handful of replies a minute would be infrastructure to run
 * forever in exchange for nothing measurable.
 *
 * Driven by the admin page and by the webhook route, so it runs whenever the
 * system is already awake. Nothing here retries for ever: `attempts` is capped
 * and an exhausted row stays failed and visible rather than looping.
 */
export async function retryFailedOutbound(limit = 10): Promise<{
  retried: number;
  sent: number;
}> {
  if (!isWhatsAppEnabled()) return { retried: 0, sent: 0 };

  const stale = await db()
    .select({
      id: whatsappMessages.id,
      recipientPhone: whatsappMessages.recipientPhone,
      text: whatsappMessages.text,
      error: whatsappMessages.error,
    })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.direction, "outbound"),
        eq(whatsappMessages.status, "failed"),
        // A permanent failure is not worth a second attempt (§49): a bad key
        // or a rejected number fails identically every time.
        sql`coalesce(${whatsappMessages.error}, '') not ilike '%401%'`,
        sql`coalesce(${whatsappMessages.error}, '') not ilike '%403%'`,
        sql`coalesce(${whatsappMessages.error}, '') not ilike '%not a usable number%'`,
        // Give up after roughly a day rather than accumulating for ever.
        sql`${whatsappMessages.createdAt} > now() - interval '24 hours'`,
      ),
    )
    .orderBy(whatsappMessages.createdAt)
    .limit(limit);

  let sent = 0;

  for (const row of stale) {
    if (!row.recipientPhone || !row.text) continue;
    if (throttleCheck()) break; // out of budget this minute; try again later
    await spaceOut();

    const result = await whatsappProvider().sendText({
      to: row.recipientPhone,
      text: row.text,
    });

    await db()
      .update(whatsappMessages)
      .set(
        result.ok
          ? {
              status: "processed",
              providerMessageId: result.providerMessageId,
              sentAt: new Date(),
              error: null,
            }
          : { error: result.error.slice(0, 500) },
      )
      .where(eq(whatsappMessages.id, row.id));

    if (result.ok) sent += 1;
  }

  return { retried: stale.length, sent };
}

/**
 * §3. The named seam CRM code is meant to call.
 *
 * A facade over the functions above rather than a second implementation —
 * there is exactly one send path, one session-row path and one provider
 * lookup, and this is the name they answer to. Nothing outside
 * `lib/integrations/whatsapp/` should import `OpenWAProvider` directly.
 */
export const WhatsAppService = {
  /** The active provider. Swapping OpenWA for Meta changes this line only. */
  provider: whatsappProvider,
  isEnabled: isWhatsAppEnabled,
  sendText,
  retryFailedOutbound,
  currentSession: currentSessionRow,
  recentMessages: (limit?: number) => recentMessages(limit),
  /** Session status straight from the provider, unstored. */
  getSessionStatus: () => whatsappProvider().getSessionStatus(),
} as const;

/** Recent traffic for the admin integration page. */
export async function recentMessages(limit = 20) {
  return db()
    .select({
      id: whatsappMessages.id,
      direction: whatsappMessages.direction,
      text: whatsappMessages.text,
      status: whatsappMessages.status,
      messageType: whatsappMessages.messageType,
      createdAt: whatsappMessages.createdAt,
      senderPhone: whatsappMessages.senderPhone,
      recipientPhone: whatsappMessages.recipientPhone,
      contactName: whatsappContacts.displayName,
    })
    .from(whatsappMessages)
    .leftJoin(
      whatsappConversations,
      eq(whatsappConversations.id, whatsappMessages.conversationId),
    )
    .leftJoin(
      whatsappContacts,
      eq(whatsappContacts.id, whatsappConversations.contactId),
    )
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(limit);
}
