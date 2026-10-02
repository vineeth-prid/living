import { timingSafeEqual } from "node:crypto";
import { runBroadcastTick } from "@/lib/crm/whatsapp/scheduler";

// §S2. The scheduler's primary trigger: a cron on the VPS calls this.
//
//   */5 * * * * curl -fsS -m 120 -H "X-Cron-Key: $CRON_SECRET" \
//     https://livingbyitr.com/api/cron/whatsapp >/dev/null
//
// Five minutes is the suggested interval and nothing depends on it. The tick
// asks what is due rather than what became due, so a longer interval only makes
// broadcasts start later, and a missed tick is caught by the next one.
//
// It answers 200 even when the work inside failed, and says so in the body. A
// non-2xx from a cron job is mailed by some daemons, silently dropped by others,
// and retried by none of them — so the failure is recorded in `job_runs`, where
// the admin panel reads it, rather than thrown at a caller that cannot act on
// it. The one exception is a bad key, which is a 401: that is the caller's
// problem to fix and must not look like a successful tick.

export const dynamic = "force-dynamic";

/** Long enough for one batch at the gateway's pace, well short of a hang. */
export const maxDuration = 120;

function authorised(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  // No secret means no endpoint. An unauthenticated trigger for sending
  // hundreds of WhatsApp messages is not something to leave open by default,
  // and "I forgot to set it" must fail closed.
  if (!expected || expected.length < 16) return false;

  const presented =
    request.headers.get("x-cron-key") ??
    // Bearer too, because that is what a hosted scheduler usually sends.
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  // Constant-time, and length-guarded because timingSafeEqual throws on a
  // mismatch. A plain === leaks the secret a character at a time to anyone
  // patient enough to measure.
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function tick(request: Request) {
  if (!authorised(request)) {
    // Terse on purpose. Whether the secret is unset or merely wrong is not
    // something to tell an anonymous caller.
    return new Response("Unauthorised", { status: 401 });
  }

  const result = await runBroadcastTick();

  return Response.json(
    { ok: result.error === null, ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Both verbs: crontab-plus-curl defaults to GET, hosted schedulers mostly POST,
// and there is no reason to make the ops setup depend on guessing which.
export const GET = tick;
export const POST = tick;
