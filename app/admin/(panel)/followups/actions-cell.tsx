"use client";

import { useState, useTransition } from "react";
import { setFollowUpStatus } from "../leads/actions";
import { Button } from "@/components/admin/ui";

export function FollowUpActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (status: "completed" | "cancelled") =>
    start(async () => {
      setError(null);
      const result = await setFollowUpStatus(id, status);
      if (!result.ok) setError(result.error);
    });

  return (
    <div className="flex items-center justify-end gap-1.5">
      {error && (
        <span className="text-xs text-[var(--color-danger)]">{error}</span>
      )}
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("completed")}>
        Complete
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("cancelled")}>
        Cancel
      </Button>
    </div>
  );
}
