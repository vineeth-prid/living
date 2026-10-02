import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import { isWhatsAppEnabled } from "@/lib/integrations/whatsapp/config";
import { retryFailedOutbound } from "@/lib/integrations/whatsapp/service";
import {
  SCHEDULE_GRACE_MINUTES,
  drainBroadcasts,
  releaseDueBroadcasts,
} from "./broadcast";

// §S2/§S3. The tick, and the honest answer to "the cron must not fail".
//
// Code cannot promise a cron runs. A crontab gets removed, a container gets
// rebuilt without it, a secret gets rotated, a VPS reboots and the timer does
// not come back. So this is built on the assumption that the schedule WILL be
// missed sometimes, and arranged so that missing it costs a delay rather than a
// broadcast:
//
//  1. The tick is idempotent and catch-up. It asks "what is due?", never "what
//     became due since last time", so one successful run after an outage
//     releases everything waiting.
//  2. It is safe to run concurrently. Releasing is a conditional UPDATE and
//     claiming recipients is `for update skip locked`, so two triggers firing
//     together cannot double-send.
//  3. There is more than one trigger. The cron route is the primary one, but
//     every inbound WhatsApp message and every load of the messaging page also
//     ticks. A business with any WhatsApp traffic at all keeps its own
//     scheduler alive without knowing it.
//  4. When it does stop, that is visible. Every run writes to `job_runs`, and
//     the panel says how long ago the last one was and shouts when it is
//     stale. A dead scheduler must not look like a quiet week.
//  5. A broadcast that is too late is not sent. See SCHEDULE_GRACE_MINUTES —
//     an offer arriving three days after its deadline is worse than one that
//     did not arrive.

export const BROADCAST_JOB = "whatsapp.broadcast_tick";

/**
 * How stale the heartbeat may get before the panel calls it broken.
 *
 * Deliberately several times the expected cron interval: a tick that is two
 * minutes late on a five-minute schedule is normal, and an alert that cries
 * wolf is one people learn to ignore — which costs exactly the outage it was
 * supposed to catch.
 */
export const HEARTBEAT_STALE_MINUTES = Number(
  process.env.WHATSAPP_HEARTBEAT_STALE_MINUTES ?? 30,
);

export type TickResult = {
  released: number;
  missed: number;
  attempted: number;
  sent: number;
  failed: number;
  retried: number;
  /** Set when the tick itself went wrong. The caller still answers 200. */
  error: string | null;
};

/**
 * One pass: release what is due, send a batch, drain stragglers, record it.
 *
 * Never throws. A tick that throws out of a cron route produces a non-2xx that
 * some cron daemons email about and others silently drop, and either way the
 * next tick is the fix — so the failure is recorded and reported rather than
 * propagated.
 */
export async function runBroadcastTick(): Promise<TickResult> {
  const result: TickResult = {
    released: 0,
    missed: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    retried: 0,
    error: null,
  };

  if (!isWhatsAppEnabled()) {
    // Still a heartbeat. "Configured and idle" and "not running at all" have to
    // be distinguishable, and this is the only thing that tells them apart.
    await recordRun(result, null);
    return result;
  }

  try {
    const { released, missed } = await releaseDueBroadcasts();
    result.released = released.length;
    result.missed = missed.length;

    if (missed.length > 0) {
      // Loud, because nobody is watching a log for this. The panel shows it too.
      console.error(
        `[whatsapp] ${missed.length} scheduled broadcast(s) missed their window by more than ${SCHEDULE_GRACE_MINUTES} minutes and were paused:`,
        missed.join(", "),
      );
    }

    const drained = await drainBroadcasts();
    result.attempted = drained.attempted;
    result.sent = drained.sent;
    result.failed = drained.failed;

    // The same cheap moment the webhook uses: whatever failed while the gateway
    // was down gets another go now that something is clearly awake.
    const { retried } = await retryFailedOutbound(5);
    result.retried = retried;

    await recordRun(result, null);
  } catch (error) {
    result.error = (
      error instanceof Error ? error.message : String(error)
    ).slice(0, 500);
    console.error("[whatsapp] broadcast tick failed", error);
    await recordRun(result, result.error);
  }

  return result;
}

/**
 * Upserts the job's heartbeat row.
 *
 * Swallows its own errors, for the same reason lib/audit.ts does: failing to
 * record that the scheduler ran must not stop the scheduler running.
 */
async function recordRun(detail: TickResult, error: string | null) {
  try {
    const now = new Date();
    await db()
      .insert(jobRuns)
      .values({
        name: BROADCAST_JOB,
        lastRunAt: now,
        lastOkAt: error ? null : now,
        lastError: error,
        detail,
        consecutiveFailures: error ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: jobRuns.name,
        set: {
          lastRunAt: now,
          // A failing tick must not advance lastOkAt — that is the field the
          // panel reads to decide whether sending actually works.
          lastOkAt: error ? sql`${jobRuns.lastOkAt}` : now,
          lastError: error,
          detail,
          consecutiveFailures: error
            ? sql`${jobRuns.consecutiveFailures} + 1`
            : sql`0`,
        },
      });
  } catch (caught) {
    console.error("[whatsapp] could not record the scheduler heartbeat", caught);
  }
}

export type Heartbeat = {
  lastRunAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  /** True when nothing has ticked recently — the panel's alarm. */
  stale: boolean;
  /** True when it has never run at all, which reads differently to "stale". */
  neverRun: boolean;
};

/** What the panel shows about the scheduler. */
export async function broadcastHeartbeat(): Promise<Heartbeat> {
  const [row] = await db()
    .select()
    .from(jobRuns)
    .where(eq(jobRuns.name, BROADCAST_JOB))
    .limit(1);

  if (!row) {
    return {
      lastRunAt: null,
      lastOkAt: null,
      lastError: null,
      consecutiveFailures: 0,
      stale: true,
      neverRun: true,
    };
  }

  return {
    lastRunAt: row.lastRunAt,
    lastOkAt: row.lastOkAt,
    lastError: row.lastError,
    consecutiveFailures: row.consecutiveFailures,
    stale:
      row.lastRunAt.getTime() < Date.now() - HEARTBEAT_STALE_MINUTES * 60_000,
    neverRun: false,
  };
}
