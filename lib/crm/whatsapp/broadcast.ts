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
import {
  hasSendBudget,
  sendMedia,
  sendText,
} from "@/lib/integrations/whatsapp/service";
import { getObject, hasStorage } from "@/lib/storage";
import { broadcastMediaUrl } from "@/lib/site";
import type { Candidate } from "./audience";

// §B1/§B5. The broadcast engine.
//
// There is no broker, for the same reason retryFailedOutbound has none:
// `whatsapp_broadcast_recipients` IS the queue. A broadcast is created as rows,
// and `drainBroadcasts` sends a bounded batch whenever the system is awake.
//
// That matters more than it sounds. The gateway allows twenty messages a
// minute (OUTBOUND_RATE), so a 500-person broadcast is nearly half an hour of
// wall clock. Nothing in a web request can hold that open, so nothing tries:
// each pass sends what it can and leaves the rest queued exactly where it was.
//
// Four things call into this file, and none of them is the only one that can:
// the cron route via scheduler.ts, the inbound webhook, the admin action that
// starts a broadcast, and a button on the panel. Every entry point is
// idempotent and safe to run concurrently (see releaseDueBroadcasts and
// `claim` below), which is what makes a missed tick a delay rather than a
// broadcast that never went.

/** How many recipients one drain pass will attempt. */
const BATCH = Number(process.env.WHATSAPP_BROADCAST_BATCH ?? 15);

/**
 * How many times one recipient is attempted before giving up.
 *
 * The automatic loop had no ceiling at all: a row that kept failing retryably
 * went back on the queue every pass, forever. One reached 28 attempts before
 * somebody stopped it by hand. `requeueFailed` already used `attempts < 3` for
 * manual retries, so the convention existed — it just was not enforced where it
 * mattered, which is the loop nobody is watching.
 *
 * Three is enough to tell a flaky gateway from a number that will never work.
 */
export const MAX_ATTEMPTS = Number(process.env.WHATSAPP_BROADCAST_MAX_ATTEMPTS ?? 3);

/**
 * How the attachment reaches the gateway: as a URL it fetches, or inline.
 *
 * `url` is the default and the cheaper one — the gateway fetches it once per
 * recipient and nothing large goes through this process.
 *
 * `base64` exists because that fetch is a failure nobody can see. The gateway
 * answers the send request before it uploads anything, so if it cannot reach
 * our HTTPS URL — a missing ca-certificates in its container has already done
 * this twice — the API returns a clean success, records the message locally, and
 * the recipient's phone never shows it. There is no error to find, because the
 * part that failed had already been acknowledged.
 *
 * Switching to `base64` removes that step entirely: the bytes travel with the
 * request. It is the quickest way to tell a gateway-side upload problem from a
 * gateway-cannot-reach-us problem, and a usable fallback if the container's
 * trust store keeps getting wiped.
 */
const MEDIA_TRANSPORT =
  process.env.WHATSAPP_MEDIA_TRANSPORT === "base64" ? "base64" : "url";

/**
 * Ceiling on inline media.
 *
 * base64 inflates by a third and the payload goes over the wire once per
 * recipient, so a 48 MB video would be 64 MB of JSON two hundred times. Past
 * this the URL is used regardless of the setting, with a line in the log — a
 * degraded send beats a broadcast that takes the server down.
 */
const MAX_INLINE_BYTES = Number(
  process.env.WHATSAPP_MAX_INLINE_BYTES ?? 8 * 1024 * 1024,
);

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
  /**
   * When it should go out, if a time was chosen in the composer.
   *
   * Stored on the draft without arming it — see the note in the create action.
   * The review page offers this as the time to arm for, so the recipient list
   * is still seen before anything can go out.
   */
  scheduledFor?: Date | null;
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
      scheduledFor: input.scheduledFor ?? null,
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

/** Moves a draft, scheduled or paused broadcast into the sending state. */
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

// --- scheduling -----------------------------------------------------------

/**
 * How late a scheduled broadcast may still go out (§S4).
 *
 * This is the guard nobody asks for and everybody wants afterwards. If the
 * server was down overnight, firing a "this weekend only" offer on Monday
 * morning is worse than not firing it — the message is wrong, and it arrives
 * looking like a system nobody is watching. Past this window the broadcast is
 * parked for a human instead, with everything still intact so it can be
 * rescheduled in one click.
 */
export const SCHEDULE_GRACE_MINUTES = Number(
  process.env.WHATSAPP_SCHEDULE_GRACE_MINUTES ?? 180,
);

/** Arms a broadcast for a time in the future. */
export async function scheduleBroadcast(
  id: string,
  when: Date,
): Promise<string | null> {
  const [row] = await db()
    .select({ status: whatsappBroadcasts.status })
    .from(whatsappBroadcasts)
    .where(eq(whatsappBroadcasts.id, id))
    .limit(1);

  if (!row) return "That broadcast no longer exists.";
  if (row.status === "completed") return "That broadcast has already finished.";
  if (row.status === "sending") {
    return "That broadcast is already sending. Pause it first.";
  }
  if (when.getTime() <= Date.now()) {
    return "That time has already passed. Pick a later one, or send it now.";
  }

  await db()
    .update(whatsappBroadcasts)
    .set({ status: "scheduled", scheduledFor: when, updatedAt: new Date() })
    .where(eq(whatsappBroadcasts.id, id));
  return null;
}

/** Disarms a scheduled broadcast, leaving it as a draft with its list intact. */
export async function unscheduleBroadcast(id: string): Promise<string | null> {
  const rows = await db()
    .update(whatsappBroadcasts)
    .set({ status: "draft", scheduledFor: null, updatedAt: new Date() })
    .where(
      and(
        eq(whatsappBroadcasts.id, id),
        // Only an armed one. Racing the scheduler must not pull a broadcast
        // back out of `sending` and leave half its recipients messaged.
        eq(whatsappBroadcasts.status, "scheduled"),
      ),
    )
    .returning({ id: whatsappBroadcasts.id });

  return rows.length > 0
    ? null
    : "That broadcast is not waiting on a schedule any more — it may already have started.";
}

export type ReleaseResult = {
  /** Broadcasts moved from `scheduled` to `sending` on this tick. */
  released: string[];
  /** Ones parked because they were past the grace window. */
  missed: string[];
};

/**
 * Releases every armed broadcast whose time has come. The heart of scheduling.
 *
 * Two conditional UPDATEs, and the conditions *are* the locking. Postgres
 * evaluates `status = 'scheduled'` against the row it has locked for the
 * update, so of two callers arriving together — the cron tick and an inbound
 * webhook, say — exactly one sees the row as `scheduled` and gets it back from
 * RETURNING. The other sees `sending` and gets nothing. No advisory lock, no
 * leader election, and no window in which both start the same broadcast.
 *
 * It is also inherently catch-up: the query asks "which are due?", not "which
 * became due since the last tick". A tick that never ran delays a broadcast
 * rather than dropping it, and the next trigger of any kind picks it up. That
 * is what makes a missed cron survivable instead of silent.
 *
 * Never throws.
 */
export async function releaseDueBroadcasts(): Promise<ReleaseResult> {
  const grace = sql`now() - (${SCHEDULE_GRACE_MINUTES} * interval '1 minute')`;

  try {
    // Too late first. Doing it after the release would mean a broadcast three
    // days overdue was already sending by the time this ran.
    const missed = await db()
      .update(whatsappBroadcasts)
      .set({ status: "paused", updatedAt: new Date() })
      .where(
        and(
          eq(whatsappBroadcasts.status, "scheduled"),
          sql`${whatsappBroadcasts.scheduledFor} < ${grace}`,
        ),
      )
      .returning({ id: whatsappBroadcasts.id });

    const released = await db()
      .update(whatsappBroadcasts)
      .set({
        status: "sending",
        // coalesce, so a rescheduled broadcast keeps the time it first started
        // rather than claiming it began on its second attempt.
        startedAt: sql`coalesce(${whatsappBroadcasts.startedAt}, now())`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappBroadcasts.status, "scheduled"),
          // Postgres decides what "now" is, not the app server. One clock, and
          // it is the one the timestamps were written against.
          sql`${whatsappBroadcasts.scheduledFor} <= now()`,
          sql`${whatsappBroadcasts.scheduledFor} >= ${grace}`,
        ),
      )
      .returning({ id: whatsappBroadcasts.id });

    return {
      released: released.map((row) => row.id),
      missed: missed.map((row) => row.id),
    };
  } catch (error) {
    // Called from a webhook's after() and from a page render, where throwing
    // would take down something unrelated to scheduling.
    console.error("[whatsapp] releasing scheduled broadcasts failed", error);
    return { released: [], missed: [] };
  }
}

/** Armed broadcasts, soonest first, for the panel. */
export async function scheduledBroadcasts() {
  return db()
    .select({
      id: whatsappBroadcasts.id,
      name: whatsappBroadcasts.name,
      scheduledFor: whatsappBroadcasts.scheduledFor,
      totalCount: whatsappBroadcasts.totalCount,
      skippedCount: whatsappBroadcasts.skippedCount,
      /**
       * Due but still armed — so something should have released it by now.
       *
       * Decided by Postgres rather than by the page, for the same reason the
       * release query is: one clock, and it is the one the release compares
       * against. A page working this out from its own `Date.now()` could call a
       * broadcast overdue that the scheduler does not yet consider due.
       */
      overdue: sql<boolean>`${whatsappBroadcasts.scheduledFor} < now()`,
    })
    .from(whatsappBroadcasts)
    .where(eq(whatsappBroadcasts.status, "scheduled"))
    .orderBy(whatsappBroadcasts.scheduledFor)
    .limit(20);
}

/**
 * §S5. A broadcast that was armed, never went, and is now out of its window.
 *
 * Derived rather than stored. A paused broadcast that never started and whose
 * time is well past is one the scheduler failed to fire — which is exactly the
 * thing the operator has to be told about, and a column recording it would be
 * one more piece of state to keep true.
 */
export function missedItsWindow(broadcast: {
  status: string;
  startedAt: Date | null;
  scheduledFor: Date | null;
}): boolean {
  return (
    broadcast.status === "paused" &&
    broadcast.startedAt === null &&
    broadcast.scheduledFor !== null &&
    broadcast.scheduledFor.getTime() <
      Date.now() - SCHEDULE_GRACE_MINUTES * 60_000
  );
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

  await db().transaction(async (tx) => {
    await tx
      .update(whatsappBroadcasts)
      .set({
        status,
        updatedAt: new Date(),
        ...(status === "cancelled" ? { completedAt: new Date() } : {}),
      })
      .where(eq(whatsappBroadcasts.id, id));

    /**
     * Cancelling has to reach the recipient rows, in the same transaction.
     *
     * Setting only the broadcast's own status left its queued and sending rows
     * exactly as they were — still claimable. The drain does filter on
     * `status = 'sending'` so nothing picked them up directly, but
     * `requeueFailed` put the broadcast *back* to sending, which brought the
     * whole abandoned queue with it. "Cancel, then retry the failures" was
     * enough to resume a broadcast somebody had deliberately stopped.
     *
     * Pausing deliberately does NOT cascade: a paused broadcast is meant to
     * resume with its queue intact, which is the whole difference between the
     * two buttons.
     */
    if (status === "cancelled") {
      await tx
        .update(whatsappBroadcastRecipients)
        .set({ status: "skipped", reason: "Broadcast cancelled" })
        .where(
          and(
            eq(whatsappBroadcastRecipients.broadcastId, id),
            inArray(whatsappBroadcastRecipients.status, ["queued", "sending"]),
          ),
        );
    }
  });

  if (status === "cancelled") await refreshCounts(id);
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
  /**
   * A cancelled broadcast is not restartable, and this is where that used to
   * leak: it set the broadcast back to `sending` unconditionally, so retrying
   * the failures of something deliberately stopped resumed the entire
   * abandoned queue. Cancelled is terminal — the way to send it after all is
   * to make a new broadcast, which also gives the recipient list another look.
   */
  const [broadcast] = await db()
    .select({ status: whatsappBroadcasts.status })
    .from(whatsappBroadcasts)
    .where(eq(whatsappBroadcasts.id, id))
    .limit(1);
  if (!broadcast || broadcast.status === "cancelled") return 0;

  const rows = await db()
    .update(whatsappBroadcastRecipients)
    .set({ status: "queued", reason: null })
    .where(
      and(
        eq(whatsappBroadcastRecipients.broadcastId, id),
        eq(whatsappBroadcastRecipients.status, "failed"),
        // Three tries is enough to tell a flaky gateway from a dead number.
        // The automatic loop enforces the same ceiling — see MAX_ATTEMPTS.
        sql`${whatsappBroadcastRecipients.attempts} < ${MAX_ATTEMPTS}`,
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
      // Needed for a document send: WhatsApp renders one with no content type
      // as an unopenable blob. It was stored on the row from the start and
      // simply not read here, which is the whole of why documents could not go.
      mediaMimeType: whatsappBroadcasts.mediaMimeType,
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

    // Asked before claiming, not after. Claiming increments `attempts`, so
    // discovering the rate limit afterwards spent a retry on a recipient
    // nothing had tried to message — which, now that attempts are capped,
    // is how someone ends up permanently failed because the gateway was busy.
    if (!hasSendBudget()) break;

    const claimed = await claim(broadcast.id, budget);
    if (claimed.length === 0) {
      // Nothing claimable may mean nothing left, or everything left having
      // used up its attempts. Sweep those to failed so the broadcast can
      // finish instead of sitting at "sending" with phantom work queued.
      await failExhausted(broadcast.id);
      await completeIfDrained(broadcast.id);
      continue;
    }

    // Read once per broadcast per pass, not once per recipient — the file is
    // the same for everyone on the list.
    const inline =
      MEDIA_TRANSPORT === "base64" && broadcast.mediaKey
        ? await readInline(broadcast.mediaKey)
        : null;

    for (const recipient of claimed) {
      attempted += 1;
      // The message row id is minted here so the recipient row can point at
      // the conversation timeline entry whether the send works or not.
      const messageId = newId();

      const result = broadcast.mediaKey
        ? await sendMedia({
            to: recipient.phoneNumber,
            text: broadcast.body,
            // Inline when WHATSAPP_MEDIA_TRANSPORT says so and the file is
            // small enough; otherwise a URL the gateway fetches itself.
            ...(inline
              ? { base64: inline }
              : { url: broadcastMediaUrl(broadcast.mediaKey) }),
            filename: broadcast.mediaFilename ?? undefined,
            kind: broadcast.mediaKind ?? "image",
            mimeType: broadcast.mediaMimeType ?? undefined,
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

    await failExhausted(broadcast.id);
    await refreshCounts(broadcast.id);
    await completeIfDrained(broadcast.id);
  }

  return { attempted, sent, failed };
}

/**
 * The attachment as base64, or null to fall back to the URL.
 *
 * Returns null rather than throwing on every failure path: a broadcast that
 * cannot read its own file should still go out with a URL and let the report
 * say what happened, not stop dead because an optional optimisation failed.
 */
async function readInline(storageKey: string): Promise<string | null> {
  if (!hasStorage()) return null;

  try {
    const object = await getObject(storageKey);
    if (!object) {
      console.error(`[whatsapp] broadcast media missing from storage: ${storageKey}`);
      return null;
    }
    if (object.size > MAX_INLINE_BYTES) {
      console.warn(
        `[whatsapp] ${storageKey} is ${Math.round(object.size / 1024 / 1024)} MB — sending the URL instead of inlining it`,
      );
      return null;
    }

    const bytes = Buffer.from(await new Response(object.body).arrayBuffer());
    return bytes.toString("base64");
  } catch (error) {
    console.error("[whatsapp] could not read broadcast media for inlining", error);
    return null;
  }
}

/**
 * Gives up on recipients that have used their attempts.
 *
 * The reason is written onto the row so the report says why rather than just
 * "failed" — the difference between "this number does not work" and "we stopped
 * trying" is the difference between deleting a lead and ringing them.
 */
async function failExhausted(broadcastId: string): Promise<number> {
  const rows = await db()
    .update(whatsappBroadcastRecipients)
    .set({
      status: "failed",
      reason: sql`coalesce(${whatsappBroadcastRecipients.reason} || ' · ', '') || ${`gave up after ${MAX_ATTEMPTS} attempts`}`,
    })
    .where(
      and(
        eq(whatsappBroadcastRecipients.broadcastId, broadcastId),
        eq(whatsappBroadcastRecipients.status, "queued"),
        sql`${whatsappBroadcastRecipients.attempts} >= ${MAX_ATTEMPTS}`,
      ),
    )
    .returning({ id: whatsappBroadcastRecipients.id });

  if (rows.length > 0) {
    console.error(
      `[whatsapp] broadcast ${broadcastId}: gave up on ${rows.length} recipient(s) after ${MAX_ATTEMPTS} attempts`,
    );
  }
  return rows.length;
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
              // The ceiling. Exhausted rows are swept to `failed` by
              // failExhausted() so they do not sit queued for ever, invisible
              // and stopping the broadcast from ever completing.
              sql`${whatsappBroadcastRecipients.attempts} < ${MAX_ATTEMPTS}`,
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
      scheduledFor: whatsappBroadcasts.scheduledFor,
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
      scheduledFor: whatsappBroadcasts.scheduledFor,
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
    /**
     * This filter was missing, and it was not a display bug.
     *
     * The function took an id and never used it, so it returned up to 500
     * recipient rows from *every broadcast that has ever existed*, failed-first.
     * A brand-new broadcast with one recipient showed "4 people — 1 queued, 3
     * failed", the three being leftovers from an unrelated incident.
     *
     * The report page derives `sendable` from these rows, and `sendable` is the
     * number the send button makes you type back. So the one real safeguard on
     * this screen was validating a count polluted by other broadcasts — the
     * operator read a number, retyped it, and confirmed something that was not
     * what they were looking at. The send path itself was always scoped
     * correctly, so nothing went to the wrong audience; the check that was
     * supposed to catch it going to the wrong audience is what broke.
     */
    .where(eq(whatsappBroadcastRecipients.broadcastId, id))
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
