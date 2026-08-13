"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { changeStatus } from "../actions";
import { ErrorText, cx } from "@/components/admin/ui";
import {
  LEAD_STATUS_LABELS,
  PIPELINE_ORDER,
  PRIORITY_CLASS,
  budgetRange,
  relativeDue,
} from "@/components/admin/crm";
import type { LeadStatus } from "@/lib/db/schema";

export type BoardCard = {
  id: string;
  reference: string;
  name: string;
  status: string;
  priority: string;
  budgetMin: number | null;
  budgetMax: number | null;
  assignedToName: string | null;
  propertyName: string | null;
  nextFollowUpAt: Date | null;
};

// Drag and drop with the platform's own API rather than a DnD library — the
// board only needs "pick a card up, drop it in a column", which draggable +
// onDragOver + onDrop already do. Every drop still goes through changeStatus,
// so a move made here writes the same timeline entry as one made from the
// lead page (Rule 6).
export function PipelineBoard({
  cards,
  totals,
  columnLimit,
}: {
  cards: BoardCard[];
  totals: Record<string, number>;
  columnLimit: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticCards, moveCard] = useOptimistic(
    cards,
    (state: BoardCard[], move: { id: string; status: string }) =>
      state.map((c) => (c.id === move.id ? { ...c, status: move.status } : c)),
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const drop = (status: string) => {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id) return;

    const card = optimisticCards.find((c) => c.id === id);
    if (!card || card.status === status) return;

    startTransition(async () => {
      moveCard({ id, status });
      setError(null);
      const result = await changeStatus(id, status as LeadStatus);
      // The optimistic move reverts on its own when the transition ends
      // without a matching server update.
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <>
      {error && <ErrorText>{error}</ErrorText>}
      <p className="mb-3 text-xs text-stone-500">
        Drag a card to another column to change its status. Every move is
        recorded on the lead&apos;s timeline.
      </p>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_ORDER.map((status) => {
          const columnCards = optimisticCards.filter((c) => c.status === status);
          const total = totals[status] ?? 0;
          const hidden = total - columnCards.length;

          return (
            <section
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={() => drop(status)}
              className={cx(
                "flex w-64 shrink-0 flex-col rounded-[12px] border bg-stone-50/70 transition",
                over === status
                  ? "border-pine-500 bg-pine-50"
                  : "border-stone-200",
              )}
            >
              <header className="flex items-center justify-between border-b border-stone-200 px-3 py-2">
                <h2 className="text-xs font-semibold text-stone-700">
                  {LEAD_STATUS_LABELS[status]}
                </h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-stone-500">
                  {total}
                </span>
              </header>

              <div className="flex flex-1 flex-col gap-2 p-2">
                {columnCards.map((card) => {
                  const due = relativeDue(card.nextFollowUpAt);
                  return (
                    <article
                      key={card.id}
                      draggable
                      onDragStart={() => setDragging(card.id)}
                      onDragEnd={() => setDragging(null)}
                      className={cx(
                        "cursor-grab rounded-[10px] border border-stone-200 bg-white p-2.5 shadow-soft transition active:cursor-grabbing",
                        dragging === card.id && "opacity-40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/admin/leads/${card.id}`}
                          className="text-sm font-medium text-stone-900 hover:text-pine-700"
                        >
                          {card.name}
                        </Link>
                        <span
                          className={cx(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
                            PRIORITY_CLASS[card.priority],
                          )}
                        >
                          {card.priority}
                        </span>
                      </div>

                      <p className="mono mt-1 text-[11px] text-stone-400">
                        {card.reference}
                      </p>
                      <p className="mt-1 text-xs text-stone-600">
                        {budgetRange(card.budgetMin, card.budgetMax)}
                      </p>
                      {card.propertyName && (
                        <p className="mt-1 truncate text-xs text-stone-500">
                          {card.propertyName}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate text-stone-400">
                          {card.assignedToName ?? "Unassigned"}
                        </span>
                        {card.nextFollowUpAt && (
                          <span className={due.overdue ? "text-[var(--color-danger)]" : "text-stone-400"}>
                            {due.overdue ? "Overdue" : "Scheduled"}
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}

                {/* §45 — say what was capped rather than silently truncating. */}
                {hidden > 0 && (
                  <Link
                    href={`/admin/leads?status=${status}`}
                    className="rounded-[10px] border border-dashed border-stone-300 px-2 py-2 text-center text-[11px] text-stone-500 hover:bg-white"
                  >
                    {hidden} more not shown (first {columnLimit} only) — open list
                  </Link>
                )}

                {columnCards.length === 0 && hidden === 0 && (
                  <p className="px-1 py-3 text-center text-[11px] text-stone-400">
                    Empty
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
