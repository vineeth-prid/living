"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { archiveExpense } from "./actions";
import { Button } from "@/components/admin/ui";
import { cdnUrl } from "@/lib/images";

export function ExpenseRowActions({
  id,
  receiptKey,
}: {
  id: string;
  receiptKey: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      {error && (
        <span className="text-xs text-[var(--color-danger)]">{error}</span>
      )}
      {receiptKey && (
        <a
          href={cdnUrl(receiptKey)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-stone-500 hover:text-pine-700"
        >
          Receipt
        </a>
      )}
      <Link
        href={`/admin/expenses/${id}`}
        className="text-xs text-stone-500 hover:text-pine-700"
      >
        Edit
      </Link>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (!confirm("Archive this expense? It's kept, but leaves the ledger."))
              return;
            const result = await archiveExpense(id);
            if (!result.ok) setError(result.error);
          })
        }
      >
        Archive
      </Button>
    </div>
  );
}
