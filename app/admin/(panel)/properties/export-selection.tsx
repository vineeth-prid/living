"use client";

import { useRef, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { Button, cx } from "@/components/admin/ui";

// §E4. Select rows, then export them.
//
// The form is the mechanism, not the JavaScript. The checkboxes are plain
// server-rendered inputs named `ids` inside a GET form pointed at the export
// route, so submitting it produces /export?ids=a&ids=b and the browser
// downloads the file itself — no fetch, no Blob, no object URL, no hidden
// anchor. With scripting broken the form still submits and still exports.
//
// This component adds only the things a form cannot do on its own: a live
// count, select-all, and clear.

export function ExportSelection({
  total,
  pageCount,
  exportAllHref,
  children,
}: {
  /** Everything matching the current filters, across all pages. */
  total: number;
  /** Rows rendered on this page — all that can be ticked here. */
  pageCount: number;
  exportAllHref: string;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState(0);

  const boxes = () =>
    Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][name="ids"]',
      ) ?? [],
    );

  // Counted from the DOM on change rather than mirrored into React state per
  // row: the checkboxes are the source of truth because they are what the form
  // submits, and a second copy of that could disagree with what gets sent.
  const recount = () => setSelected(boxes().filter((box) => box.checked).length);

  const setAll = (checked: boolean) => {
    for (const box of boxes()) box.checked = checked;
    recount();
  };

  const allOnPageSelected = selected > 0 && selected === pageCount;

  return (
    <form
      ref={formRef}
      method="get"
      action="/admin/properties/export"
      onChange={recount}
      // Nothing is selected and the button is disabled, so a stray Enter in the
      // filter bar above cannot post an empty selection.
      onSubmit={(event) => {
        if (selected === 0) event.preventDefault();
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[12px] border border-stone-200 bg-white px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-stone-600">
          <input
            type="checkbox"
            checked={allOnPageSelected}
            onChange={(event) => setAll(event.target.checked)}
            aria-label="Select every property on this page"
            className="h-4 w-4 accent-[var(--color-pine-600)]"
          />
          Select page
        </label>

        <span
          className={cx(
            "text-xs",
            selected > 0 ? "font-medium text-stone-800" : "text-stone-500",
          )}
        >
          {selected === 0
            ? "Nothing selected"
            : `${selected} selected${selected === pageCount && total > pageCount ? " (this page)" : ""}`}
        </span>

        {selected > 0 && (
          <button
            type="button"
            onClick={() => setAll(false)}
            className="text-xs text-stone-500 underline hover:text-stone-800"
          >
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button type="submit" size="sm" disabled={selected === 0}>
            <Download className="h-4 w-4" strokeWidth={1.8} />
            Export selected
          </Button>

          {/*
            A link, not a submit: it carries the filters rather than the ticks,
            so it exports everything matching the current view across every
            page — which is what "all properties" has to mean on page 3 of 9.
          */}
          <a
            href={exportAllHref}
            className="inline-flex items-center gap-2 rounded-[10px] border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 transition hover:bg-stone-50"
          >
            <Download className="h-4 w-4" strokeWidth={1.8} />
            Export all {total}
          </a>
        </div>
      </div>

      {children}
    </form>
  );
}
