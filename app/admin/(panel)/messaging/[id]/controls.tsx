"use client";

import { useState, useTransition } from "react";
import { Button, ErrorText, Field, cx, inputClass } from "@/components/admin/ui";
import {
  requeueAction,
  scheduleBroadcastAction,
  sendBroadcastAction,
  setBroadcastStatusAction,
  unscheduleBroadcastAction,
} from "../actions";

// §B7. The send button, and the controls for a send already in flight.
//
// The confirmation is a typed count rather than an "are you sure?" — a dialog
// is clicked through on reflex, where retyping the number means having read it.

export function BroadcastControls({
  id,
  status,
  sendable,
  failed,
  stuck,
  scheduledFor,
  scheduledLabel,
  missedWindow,
  today,
}: {
  id: string;
  status: string;
  sendable: number;
  failed: number;
  stuck: number;
  /** "2026-10-05" and "10:00", prefilled from the draft if a time was typed. */
  scheduledFor: { date: string; time: string } | null;
  /** The same instant, already rendered in Kochi time by the server. */
  scheduledLabel: string | null;
  missedWindow: boolean;
  /** Today in Kochi, from the server — the earliest date a picker may offer. */
  today: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  // Arming is the default when a time came through from the composer, so the
  // choice made there is not quietly forgotten on this screen.
  const [arming, setArming] = useState(Boolean(scheduledFor));
  const [date, setDate] = useState(scheduledFor?.date ?? "");
  const [time, setTime] = useState(scheduledFor?.time ?? "10:00");

  const run = (action: () => Promise<{ ok: boolean } & Record<string, unknown>>) =>
    start(async () => {
      setError(null);
      setMessage(null);
      const result = (await action()) as
        | { ok: true; data: { message: string } }
        | { ok: false; error: string };
      if (result.ok) setMessage(result.data.message);
      else setError(result.error);
    });

  const confirmed = typed.trim() === String(sendable);

  return (
    <div className="flex flex-col gap-3">
      {missedWindow && (
        <p className="rounded-[10px] bg-[#fbeceb] px-3 py-2 text-sm text-[var(--color-danger)]">
          This was scheduled for {scheduledLabel} and never went out — it was
          already too far past its time to send safely, so it was parked here
          instead. Pick a new time, or send it now if it is still relevant.
        </p>
      )}

      {status === "draft" && (
        <>
          {/* One confirmation, whichever it is. The thing being confirmed is
              always the recipient count — arming for Sunday and sending now
              carry exactly the same risk of being the wrong 400 people. */}
          <div className="flex items-center gap-2">
            <ChoiceTab active={!arming} onClick={() => setArming(false)}>
              Send now
            </ChoiceTab>
            <ChoiceTab active={arming} onClick={() => setArming(true)}>
              Schedule
            </ChoiceTab>
          </div>

          {arming && (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Date" required className="w-44">
                <input
                  type="date"
                  value={date}
                  min={today}
                  onChange={(event) => setDate(event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Time" className="w-32" hint="Kochi time">
                <input
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          <p className="text-sm text-stone-600">
            {arming
              ? "This will go to"
              : "This will send to"}{" "}
            <strong>{sendable}</strong> people, about twenty a minute. Type the
            number to confirm.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              inputMode="numeric"
              placeholder={String(sendable)}
              aria-label="Type the recipient count to confirm"
              className="h-9 w-28 rounded-[8px] border border-stone-300 px-3 text-sm outline-none focus:border-pine-500 focus:ring-[3px] focus:ring-pine-500/20"
            />
            <Button
              disabled={
                pending ||
                !confirmed ||
                sendable === 0 ||
                (arming && !date)
              }
              onClick={() =>
                run(() =>
                  arming
                    ? scheduleBroadcastAction(id, date, time)
                    : sendBroadcastAction(id),
                )
              }
            >
              {pending
                ? arming
                  ? "Scheduling…"
                  : "Starting…"
                : arming
                  ? `Schedule for ${sendable}`
                  : `Send to ${sendable}`}
            </Button>
          </div>
        </>
      )}

      {status === "scheduled" && (
        <>
          <p className="rounded-[10px] bg-[#eaf1f6] px-3 py-2 text-sm text-[var(--color-info)]">
            Armed for <strong>{scheduledLabel}</strong>. It goes to {sendable}{" "}
            people on its own — nobody needs to be here.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => sendBroadcastAction(id))}
            >
              Send it now instead
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => unscheduleBroadcastAction(id))}
            >
              Clear the schedule
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => run(() => setBroadcastStatusAction(id, "cancelled"))}
            >
              Cancel it
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-stone-200 pt-3">
            <Field label="Move to" className="w-44">
              <input
                type="date"
                value={date}
                min={today}
                onChange={(event) => setDate(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Time" className="w-32" hint="Kochi time">
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Button
              size="sm"
              variant="secondary"
              className="mb-[1px]"
              disabled={pending || !date}
              onClick={() => run(() => scheduleBroadcastAction(id, date, time))}
            >
              Reschedule
            </Button>
          </div>
        </>
      )}

      {status === "sending" && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => setBroadcastStatusAction(id, "paused"))}
          >
            Pause
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => run(() => setBroadcastStatusAction(id, "cancelled"))}
          >
            Cancel the rest
          </Button>
        </div>
      )}

      {status === "paused" && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => setBroadcastStatusAction(id, "sending"))}
          >
            Resume
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => run(() => setBroadcastStatusAction(id, "cancelled"))}
          >
            Cancel the rest
          </Button>
        </div>
      )}

      {(failed > 0 || stuck > 0) && (
        <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-3">
          {failed > 0 && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => requeueAction(id, "failed"))}
            >
              Retry {failed} failed
            </Button>
          )}
          {stuck > 0 && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => requeueAction(id, "stuck"))}
            >
              Requeue {stuck} stuck
            </Button>
          )}
        </div>
      )}

      {message && <p className="text-sm text-pine-700">{message}</p>}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function ChoiceTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-[8px] border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-pine-600 bg-pine-600 text-white"
          : "border-stone-300 bg-white text-stone-600 hover:border-stone-400",
      )}
    >
      {children}
    </button>
  );
}
