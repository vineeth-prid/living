"use client";

import { useState, useTransition } from "react";
import { Button, ErrorText } from "@/components/admin/ui";
import { drainNow, setOptOutAction } from "./actions";

// Small client islands for the hub page. Everything they can do is also done by
// the background drain — these are the buttons for a quiet afternoon when no
// inbound message has arrived to trigger it.

export function QueueControls({ queued }: { queued: number }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || queued === 0}
        onClick={() =>
          start(async () => {
            setError(null);
            setMessage(null);
            const result = await drainNow();
            if (result.ok) setMessage(result.data.message);
            else setError(result.error);
          })
        }
      >
        {pending ? "Sending…" : "Send next batch"}
      </Button>

      <span className="text-xs text-stone-500">
        {queued === 0
          ? "Nothing queued."
          : `${queued} still to go. The queue also drains itself whenever a message comes in.`}
      </span>

      {message && <span className="text-xs text-pine-700">{message}</span>}
      {error && <ErrorText>{error}</ErrorText>}
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
