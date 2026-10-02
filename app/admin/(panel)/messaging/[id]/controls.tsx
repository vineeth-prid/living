"use client";

import { useState, useTransition } from "react";
import { Button, ErrorText } from "@/components/admin/ui";
import {
  requeueAction,
  sendBroadcastAction,
  setBroadcastStatusAction,
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
}: {
  id: string;
  status: string;
  sendable: number;
  failed: number;
  stuck: number;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

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
      {status === "draft" && (
        <>
          <p className="text-sm text-stone-600">
            This will send to <strong>{sendable}</strong> people, about twenty a
            minute. Type the number to confirm.
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
              disabled={pending || !confirmed || sendable === 0}
              onClick={() => run(() => sendBroadcastAction(id))}
            >
              {pending ? "Starting…" : `Send to ${sendable}`}
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
