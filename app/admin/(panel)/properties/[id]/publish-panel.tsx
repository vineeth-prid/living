"use client";

import { useState, useTransition } from "react";
import { setPublished, setWorkflowStatus } from "../actions";
import { Button, Card, ErrorText } from "@/components/admin/ui";
import { WORKFLOW_STATUSES } from "@/lib/db/schema";

// The lifecycle moves that aren't publish/unpublish. Draft and published are
// driven by the publish button instead, so they aren't offered twice.
const MANUAL_STATUSES = WORKFLOW_STATUSES.filter(
  (s) => !["draft", "published"].includes(s),
);

export function PublishPanel({
  id,
  isPublic,
  workflowStatus,
  canPublish,
  publicImages,
}: {
  id: string;
  isPublic: boolean;
  workflowStatus: string;
  canPublish: boolean;
  publicImages: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card title="Publishing">
      {error && <ErrorText>{error}</ErrorText>}

      <p className="mb-4 text-xs leading-relaxed text-stone-500">
        {isPublic
          ? "This listing is visible on livingbyitr.com."
          : "This listing is not on the website. Publishing needs a title, location, price and at least one public photo."}
      </p>

      {publicImages === 0 && (
        <p className="mb-4 rounded-[10px] bg-clay-50 px-3 py-2 text-xs text-clay-800">
          No public photos yet — add one before publishing.
        </p>
      )}

      {canPublish ? (
        <Button
          variant={isPublic ? "secondary" : "primary"}
          disabled={pending}
          className="w-full"
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await setPublished(id, !isPublic);
              if (!result.ok) setError(result.error);
            })
          }
        >
          {isPublic ? "Unpublish" : "Publish to website"}
        </Button>
      ) : (
        <p className="rounded-[10px] bg-stone-100 px-3 py-2 text-xs text-stone-600">
          You can edit this listing, but only an administrator can publish it.
        </p>
      )}

      <label className="mt-5 block">
        <span className="text-xs font-semibold tracking-wide text-stone-700">
          Lifecycle status
        </span>
        <select
          value={workflowStatus}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              setError(null);
              const result = await setWorkflowStatus(
                id,
                e.target.value as (typeof WORKFLOW_STATUSES)[number],
              );
              if (!result.ok) setError(result.error);
            })
          }
          className="mt-1.5 w-full rounded-[10px] border border-stone-300 bg-white px-3 py-2 text-sm capitalize"
        >
          <option value={workflowStatus} className="capitalize">
            {workflowStatus.replace(/_/g, " ")}
          </option>
          {MANUAL_STATUSES.filter((s) => s !== workflowStatus).map((s) => (
            <option key={s} value={s} className="capitalize">
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-stone-500">
          Sold, rented, off-market and archived take the listing off the website
          automatically.
        </span>
      </label>
    </Card>
  );
}
