"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { archiveProperty, setPublished } from "./actions";
import { Button } from "@/components/admin/ui";

export function PropertyRowActions({
  id,
  isPublic,
  canPublish,
}: {
  id: string;
  isPublic: boolean;
  canPublish: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      {error && (
        <span className="max-w-[16rem] text-right text-xs text-[var(--color-danger)]">
          {error}
        </span>
      )}
      <Link href={`/admin/properties/${id}`} className="text-xs text-stone-500 hover:text-pine-700">
        Edit
      </Link>
      {isPublic && (
        <Link
          href={`/homes/${id}`}
          target="_blank"
          className="text-xs text-stone-500 hover:text-pine-700"
        >
          View
        </Link>
      )}
      {/* Hidden for employees without the grant — and refused server-side too. */}
      {canPublish && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await setPublished(id, !isPublic);
              if (!result.ok) setError(result.error);
            })
          }
        >
          {isPublic ? "Unpublish" : "Publish"}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (!confirm("Archive this property? It comes off the website but is kept.")) return;
            const result = await archiveProperty(id);
            if (!result.ok) setError(result.error);
          })
        }
      >
        Archive
      </Button>
    </div>
  );
}
