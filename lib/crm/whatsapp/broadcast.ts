import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  leads,
  users,
  whatsappBroadcastRecipients,
  whatsappBroadcasts,
  type BroadcastStatus,
} from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { isWhatsAppEnabled } from "@/lib/integrations/whatsapp/config";
import { sendMedia, sendText } from "@/lib/integrations/whatsapp/service";
import { broadcastMediaUrl } from "@/lib/site";
import type { Candidate } from "./audience";

// §B1/§B5. The broadcast engine.
//
// There is no scheduler and no broker, for the same reason retryFailedOutbound
// has neither: `whatsapp_broadcast_recipients` IS the queue. A broadcast is
// created as rows, and `drainBroadcasts` sends a bounded batch whenever the
// system is awake — from the admin action that started it, and from the inbound
// webhook, which fires every time a message arrives.
//
// That matters more than it sounds. The gateway allows twenty messages a
// minute (OUTBOUND_RATE), so a 500-person broadcast is nearly half an hour of
// wall clock. Nothing in a web request can hold that open, so nothing tries:
// each pass sends what it can and leaves the rest queued exactly where it was.

/** How many recipients one drain pass will attempt. */
const BATCH = Number(process.env.WHATSAPP_BROADCAST_BATCH ?? 15);

export type NewBroadcast = {
  name: string;
  body: string;
  media: {
    storageKey: string;
    mimeType: string;
    filename: string;
    kind: "image" | "video" | "document";
  } | null;
  audience: unknown;
  createdById: string;
};

/**
 * Creates the broadcast and materialises its recipient list. Sends nothing.
 *
 * Excluded candidates are written as `skipped` rows carrying their reason,
 * rather than left out. A report that says "sent 391 of 391" when 21 people
 * were dropped on the way in is a report that hides its own behaviour.
 */
export async function createBroadcast(
  input: NewBroadcast,
  candidates: Candidate[],
): Promise<{ id: string; queued: number; skipped: number }> {
  const id = newId();
  const queued = candidates.filter((c) => !c.excluded && c.phoneNumber);
  const skipped = candidates.filter((c) => c.excluded || !c.phoneNumber);

  await db().transaction(async (tx) => {
    await tx.insert(whatsappBroadcasts).values({
      id,
      name: input.name,
      body: input.body,
      mediaKey: input.media?.storageKey ?? null,
      mediaMimeType: input.media?.mimeType ?? null,
      mediaFilename: input.media?.filename ?? null,
      mediaKind: input.media?.kind ?? null,
      status: "draft",
      audience: input.audience ?? null,
      totalCount: candidates.length,
      skippedCount: skipped.length,
      createdById: input.createdById,
    });

    const rows = [
      ...queued.map((c) => ({
        id: newId(),
        broadcastId: id,
        leadId: c.leadId,
        phoneNumber: c.phoneNumber!,
        name: c.name,
        status: "queued" as const,
        reason: null,
      })),
      ...skipped.map((c) => ({
        id: newId(),
        broadcastId: id,
        leadId: c.leadId,
        // A skipped row still needs a phone column for the unique index. The
        // lead id stands in when there is no usable number, which is exactly
        // the case that produced the skip.
        phoneNumber: c.phoneNumber ?? `unusable:${c.leadId}`,
        name: c.name,
        status: "skipped" as const,
        reason: c.excluded,
      })),
    ];

    // Chunked: Postgres caps bound parameters per statement, and a 2,000-row
    // insert with six columns each is past it.
    for (let i = 0; i < rows.length; i += 500) {
      await tx
        .insert(whatsappBroadcastRecipients)
        .values(rows.slice(i, i + 500))
        // The unique index is the real dedupe. onConflictDoNothing turns a
        // number that slipped past the in-memory check into one row, not a
        // failed transaction that loses the whole broadcast.
        .onConflictDoNothing();
    }
  });

  return { id, queued: queued.length, skipped: skipped.length };
}

/** Moves a draft or paused broadcast into the sending state. */
export async function startBroadcast(id: string): Promise<string | null> {
  const [row] = await db()
    .select({ status: whatsappBroadcasts.status, startedAt: whatsappBroadcasts.startedAt })
    .from(whatsappBroadcasts)
    .where(eq(whatsappBroadcasts.id, id))
    .limit(1);

  if (!row) return "That broadcast no longer exists.";
  if (row.status === "sending") return null;
  if (row.status === "completed") return "That broadcast has already finished.";
  if (row.status === "cancelled") return "That broadcast was cancelled.";

  await db()
    .update(whatsappBroadcasts)
    .set({
      status: "sending",
      startedAt: row.startedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappBroadcasts.id, id));
  return null;
}

/**
 * Pause, resume or cancel.
 *
 * Cancelling abandons the queued rows rather than deleting them — what was
 * never sent is as much a part of the record as what was.
 */
export async function setBroadcastStatus(
  id: string,
  status: Extract<BroadcastStatus, "paused" | "cancelled" | "sending">,
): Promise<string | null> {
  if (status === "sending") return startBroadcast(id);

  const [row] = await db()
    .select({ status: whatsappBroadcasts.status })
    .from(whatsappBroadcasts)
    .where(eq(whatsappBroadcasts.id, id))
    .limit(1);
  if (!row) return "That broadcast no longer exists.";
  if (row.status === "completed") return "That broadcast has already finished.";

  await db()
    .update(whatsappBroadcasts)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === "cancelled" ? { completedAt: new Date() } : {}),
    })
    .where(eq(whatsappBroadcasts.id, id));
  return null;
}

/** Puts rows stuck in `sending` back on the queue. See the schema comment. */
export async function requeueStuck(id: string): Promise<number> {
  const rows = await db()
    .update(whatsappBroadcastRecipients)
    .set({ status: "queued" })
    .where(
      and(
        eq(whatsappBroadcastRecipients.broadcastId, id),
        eq(whatsappBroadcastRecipients.status, "sending"),
      ),
    )
    .returning({ id: whatsappBroadcastRecipients.id });
  return rows.length;
}

/** Puts failed rows back on the queue, for a retry after the gateway is fixed. */
export async function requeueFailed(id: string): Promise<number> {
  const rows = await db()
    .update(whatsappBroadcastRecipients)
    .set({ status: "queued", reason: null })
    .where(
      and(
        eq(whatsappBroadcastRecipients.broadcastId, id),
        eq(whatsappBroadcastRecipients.status, "failed"),
        // Three tries is enough to tell a flaky gateway from a dead number.
        sql`${whatsappBroadcastRecipients.attempts} < 3`,
      ),
    )
    .returning({ id: whatsappBroadcastRecipients.id });

  if (rows.length > 0) {
    await db()
      .update(whatsappBroadcasts)
      .set({ status: "sending", completedAt: null, updatedAt: new Date() })
      .where(eq(whatsappBroadcasts.id, id));
  }
  return rows.length;
}

/**
 * Sends one bounded batch across every broadcast that is currently sending.
 *
 * Never throws: it runs from `after()` on a webhook, where an exception has
 * nowhere to go and would only be a log line with the queue silently stalled.
 */
export async function drainBroadcasts(
  limit = BATCH,
): Promise<{ attempted: number; sent: number; failed: number }> {
  if (!isWhatsAppEnabled()) return { attempted: 0, sent: 0, failed: 0 };

  const active = await db()
    .select({
      id: whatsappBroadcasts.id,
      body: whatsappBroadcasts.body,
      mediaKey: whatsappBroadcasts.mediaKey,
      mediaFilename: whatsappBroadcasts.mediaFilename,
      mediaKind: whatsappBroadcasts.mediaKind,
    })
    .from(whatsappBroadcasts)
    .where(eq(whatsappBroadcasts.status, "sending"))
    // Oldest first, so a broadcast started this morning finishes before one
    // started at lunchtime gets a turn.
    .orderBy(whatsappBroadcasts.startedAt)
    .limit(5);

  let attempted = 0;
  let sent = 0;
  let failed = 0;

  for (const broadcast of active) {
    const budget = limit - attempted;
    if (budget <= 0) break;

    const claimed = await claim(broadcast.id, budget);
    if (claimed.length === 0) {
      await completeIfDrained(broadcast.id);
      continue;
    }

    for (const recipient of claimed) {
      attempted += 1;
      // The message row id is minted here so the recipient row can point at
      // the conversation timeline entry whether the send works or not.
      const messageId = newId();

      const result = broadcast.mediaKey
        ? await sendMedia({
            to: recipient.phoneNumber,
            text: broadcast.body,
            // A URL, never base64. The gateway fetches it once per recipient
            // instead of this process re-encoding the file for each of them.
            url: broadcastMediaUrl(broadcast.mediaKey),
            filename: broadcast.mediaFilename ?? undefined,
            kind: broadcast.mediaKind ?? "image",
            messageId,
          })
        : await sendText({ to: recipient.phoneNumber, text: broadcast.body });

      if (result.ok) {
        sent += 1;
        await db()
          .update(whatsappBroadcastRecipients)
          .set({
            status: "sent",
            sentAt: new Date(),
            messageId: broadcast.mediaKey ? messageId : null,
            reason: null,
          })
          .where(eq(whatsappBroadcastRecipients.id, recipient.id));
      } else if (result.retryable) {
        // Out of rate budget, or the gateway is down. Back on the queue
        // untouched — this is the normal way a batch ends, not a failure.
        failed += 1;
        await db()
          .update(whatsappBroadcastRecipients)
          .set({ status: "queued", reason: result.error.slice(0, 300) })
          .where(eq(whatsappBroadcastRecipients.id, recipient.id));
        break;
      } else {
        failed += 1;
        await db()
          .update(whatsappBroadcastRecipients)
          .set({ status: "failed", reason: result.error.slice(0, 300) })
          .where(eq(whatsappBroadcastRecipients.id, recipient.id));
      }
    }

    await refreshCounts(broadcast.id);
    await completeIfDrained(broadcast.id);
  }

  return { attempted, sent, failed };
}

/**
 * Claims up to `limit` queued rows atomically.
 *
 * `for update skip locked` is the whole point: the admin page and an inbound
 * webhook can both call drain at the same moment, and without this they would
 * both read the same queued rows and message those people twice.
 */
async function claim(broadcastId: string, limit: number) {
  const claimed = await db()
    .update(whatsappBroadcastRecipients)
    .set({
      status: "sending",
      attempts: sql`${whatsappBroadcastRecipients.attempts} + 1`,
    })
    .where(
      inArray(
        whatsappBroadcastRecipients.id,
        db()
          .select({ id: whatsappBroadcastRecipients.id })
          .from(whatsappBroadcastRecipients)
          .where(
            and(
              eq(whatsappBroadcastRecipients.broadcastId, broadcastId),
              eq(whatsappBroadcastRecipients.status, "queued"),
            ),
          )
          .orderBy(whatsappBroadcastRecipients.createdAt)
          .limit(limit)
          .for("update", { skipLocked: true }),
      ),
    )
    .returning({
      id: whatsappBroadcastRecipients.id,
      phoneNumber: whatsappBroadcastRecipients.phoneNumber,
      name: whatsappBroadcastRecipients.name,
    });

  return claimed;
}

/** Recomputed from the rows, never incremented — a counter that drifts lies. */
async function refreshCounts(broadcastId: string) {
  const [counts] = await db()
    .select({
      sent: sql<number>`count(*) filter (where ${whatsappBroadcastRecipients.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${whatsappBroadcastRecipients.status} = 'failed')::int`,
      skipped: sql<number>`count(*) filter (where ${whatsappBroadcastRecipients.status} = 'skipped')::int`,
    })
    .from(whatsappBroadcastRecipients)
    .where(eq(whatsappBroadcastRecipients.broadcastId, broadcastId));

  await db()
    .update(whatsappBroadcasts)
    .set({
      sentCount: counts?.sent ?? 0,
      failedCount: counts?.failed ?? 0,
      skippedCount: counts?.skipped ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(whatsappBroadcasts.id, broadcastId));
}

/** Marks it finished once nothing is queued or in flight. */
async function completeIfDrained(broadcastId: string) {
  const [remaining] = await db()
    .select({ left: sql<number>`count(*)::int` })
    .from(whatsappBroadcastRecipients)
    .where(
      and(
        eq(whatsappBroadcastRecipients.broadcastId, broadcastId),
        inArray(whatsappBroadcastRecipients.status, ["queued", "sending"]),
      ),
    );

  if ((remaining?.left ?? 0) > 0) return;

  await refreshCounts(broadcastId);
  await db()
    .update(whatsappBroadcasts)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(whatsappBroadcasts.id, broadcastId),
        eq(whatsappBroadcasts.status, "sending"),
      ),
    );
}

// --- reads for the panel ---------------------------------------------------

export async function listBroadcasts(limit = 30) {
  return db()
    .select({
      id: whatsappBroadcasts.id,
      name: whatsappBroadcasts.name,
      body: whatsappBroadcasts.body,
      status: whatsappBroadcasts.status,
      mediaKind: whatsappBroadcasts.mediaKind,
      totalCount: whatsappBroadcasts.totalCount,
      sentCount: whatsappBroadcasts.sentCount,
      failedCount: whatsappBroadcasts.failedCount,
      skippedCount: whatsappBroadcasts.skippedCount,
      createdAt: whatsappBroadcasts.createdAt,
      startedAt: whatsappBroadcasts.startedAt,
      completedAt: whatsappBroadcasts.completedAt,
      createdByName: users.fullName,
    })
    .from(whatsappBroadcasts)
    .leftJoin(users, eq(users.id, whatsappBroadcasts.createdById))
    .orderBy(desc(whatsappBroadcasts.createdAt))
    .limit(limit);
}

export async function getBroadcast(id: string) {
  const [row] = await db()
    .select({
      id: whatsappBroadcasts.id,
      name: whatsappBroadcasts.name,
      body: whatsappBroadcasts.body,
      status: whatsappBroadcasts.status,
      mediaKey: whatsappBroadcasts.mediaKey,
      mediaKind: whatsappBroadcasts.mediaKind,
      mediaFilename: whatsappBroadcasts.mediaFilename,
      mediaMimeType: whatsappBroadcasts.mediaMimeType,
      audience: whatsappBroadcasts.audience,
      totalCount: whatsappBroadcasts.totalCount,
      sentCount: whatsappBroadcasts.sentCount,
      failedCount: whatsappBroadcasts.failedCount,
      skippedCount: whatsappBroadcasts.skippedCount,
      createdAt: whatsappBroadcasts.createdAt,
      startedAt: whatsappBroadcasts.startedAt,
      completedAt: whatsappBroadcasts.completedAt,
      createdByName: users.fullName,
    })
    .from(whatsappBroadcasts)
    .leftJoin(users, eq(users.id, whatsappBroadcasts.createdById))
    .where(eq(whatsappBroadcasts.id, id))
    .limit(1);
  return row ?? null;
}

export async function broadcastRecipients(id: string, limit = 500) {
  return db()
    .select({
      id: whatsappBroadcastRecipients.id,
      name: whatsappBroadcastRecipients.name,
      phoneNumber: whatsappBroadcastRecipients.phoneNumber,
      status: whatsappBroadcastRecipients.status,
      reason: whatsappBroadcastRecipients.reason,
      attempts: whatsappBroadcastRecipients.attempts,
      sentAt: whatsappBroadcastRecipients.sentAt,
      leadId: whatsappBroadcastRecipients.leadId,
      leadReference: leads.reference,
    })
    .from(whatsappBroadcastRecipients)
    .leftJoin(leads, eq(leads.id, whatsappBroadcastRecipients.leadId))
    // Problems first: the rows anyone opens this page to look at.
    .orderBy(
      sql`case ${whatsappBroadcastRecipients.status} when 'failed' then 0 when 'sending' then 1 when 'queued' then 2 when 'skipped' then 3 else 4 end`,
      whatsappBroadcastRecipients.createdAt,
    )
    .limit(limit);
}

/** Queued across every sending broadcast — the "still to go" line. */
export async function queuedTotal(): Promise<number> {
  const [row] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(whatsappBroadcastRecipients)
    .innerJoin(
      whatsappBroadcasts,
      eq(whatsappBroadcasts.id, whatsappBroadcastRecipients.broadcastId),
    )
    .where(
      and(
        eq(whatsappBroadcasts.status, "sending"),
        eq(whatsappBroadcastRecipients.status, "queued"),
      ),
    );
  return row?.total ?? 0;
}
