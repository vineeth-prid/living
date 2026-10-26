"use client";

import { useState, useTransition } from "react";
import { Button, ErrorText } from "@/components/admin/ui";
import { drainNow, runTickNow, setOptOutAction } from "./actions";

// Small client islands for the hub page. Everything they can do is also done by
// the cron and by the inbound webhook — these are the buttons for a quiet
// afternoon, and for the day the cron turns out to have stopped.

export function QueueControls({
  queued,
  scheduled,
}: {
  queued: number;
  scheduled: number;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      setMessage(null);
      const result = (await action()) as
        | { ok: true; data: { message: string } }
        | { ok: false; error: string };
      if (result.ok) setMessage(result.data.message);
      else setError(result.error);
    });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || (queued === 0 && scheduled === 0)}
        onClick={() => run(drainNow)}
      >
        {pending ? "Working…" : "Send next batch"}
      </Button>

      {/* Identical to what the cron calls, so this both proves sending works
          and actually releases anything due — the useful thing to press when
          the heartbeat above says the cron has stopped. */}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(runTickNow)}
      >
        Run the scheduler now
      </Button>

      <span className="text-xs text-stone-500">
        {queued === 0
          ? scheduled > 0
            ? `${scheduled} scheduled and waiting.`
            : "Nothing queued."
          : `${queued} still to go. The queue also drains on its own, from the cron and from every incoming message.`}
      </span>

      {message && <span className="text-xs text-pine-700">{message}</span>}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

/**
 * §S5. Whether the scheduler is actually running.
 *
 * The one piece of this feature that is pure operations. A scheduled broadcast
 * that silently never goes out is the worst failure the panel can have, and the
 * difference between finding out here and finding out from a customer is this
 * box.
 */
export function SchedulerHealth({
  lastRunLabel,
  lastOkLabel,
  stale,
  neverRun,
  lastError,
  consecutiveFailures,
  staleAfterMinutes,
}: {
  lastRunLabel: string;
  lastOkLabel: string;
  stale: boolean;
  neverRun: boolean;
  lastError: string | null;
  consecutiveFailures: number;
  staleAfterMinutes: number;
}) {
  if (neverRun) {
    return (
      <div className="rounded-[10px] bg-clay-50 px-3 py-2 text-xs text-clay-800">
        <strong>The scheduler has never run.</strong> Scheduled broadcasts will
        still go out when a WhatsApp message arrives or when someone opens this
        page, but nothing is driving it on a timer yet — add the cron entry from
        docs/broadcasts.md, then press <em>Run the scheduler now</em> to check
        it works.
      </div>
    );
  }

  if (stale) {
    return (
      <div className="rounded-[10px] bg-[#fbeceb] px-3 py-2 text-xs text-[var(--color-danger)]">
        <strong>
          The scheduler has not run for over {staleAfterMinutes} minutes.
        </strong>{" "}
        Last run {lastRunLabel}. Check the cron on the VPS — a scheduled
        broadcast may not go out at the time it was set for. Pressing{" "}
        <em>Run the scheduler now</em> releases anything already due.
        {lastError && <span className="mt-1 block">Last error: {lastError}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
      <span className="font-medium text-pine-700">Scheduler running</span>
      <span>last run {lastRunLabel}</span>
      {lastOkLabel !== lastRunLabel && <span>last clean run {lastOkLabel}</span>}
      {consecutiveFailures > 0 && (
        <span className="text-[var(--color-danger)]">
          {consecutiveFailures} failed run{consecutiveFailures === 1 ? "" : "s"} in a row
          {lastError ? ` — ${lastError}` : ""}
        </span>
      )}
    </div>
  );
}

export function OptOutRow({
  phoneNumber,
  label,
}: {
  phoneNumber: string;
  label: string;
}) {
  const [pending, start] = useTransition();

  return (
    <li className="flex items-center justify-between gap-3 border-b border-stone-100 py-2 last:border-0">
      <span className="mono text-xs text-stone-700">{label}</span>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => start(() => setOptOutAction(phoneNumber, false).then(() => undefined))}
      >
        {pending ? "…" : "Opt back in"}
      </Button>
    </li>
  );
}
