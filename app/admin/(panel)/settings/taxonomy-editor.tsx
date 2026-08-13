"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { addTaxonomy, toggleTaxonomy, type TaxonomyKind } from "./actions";
import {
  Button,
  Card,
  ErrorText,
  cx,
  inputClass,
} from "@/components/admin/ui";
import type { ActionResult } from "@/lib/auth/dal";

type Entry = { key: string; label: string; isActive: boolean };

function Add() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Adding…" : "Add"}
    </Button>
  );
}

export function TaxonomyEditor({
  kind,
  title,
  entries,
}: {
  kind: TaxonomyKind;
  title: string;
  entries: Entry[];
}) {
  const [state, formAction] = useActionState<ActionResult<null> | null, FormData>(
    addTaxonomy,
    null,
  );
  const [pending, start] = useTransition();

  return (
    <Card title={title}>
      {state && !state.ok && <ErrorText>{state.error}</ErrorText>}

      <form action={formAction} className="mb-4 flex gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input
          name="label"
          required
          placeholder={kind === "type" ? "e.g. Channel partner" : "e.g. Housing.com"}
          className={cx(inputClass, "flex-1")}
        />
        <Add />
      </form>

      <ul className="flex flex-col divide-y divide-stone-100">
        {entries.map((entry) => (
          <li key={entry.key} className="flex items-center justify-between gap-3 py-2">
            <span className={cx("text-sm", entry.isActive ? "text-stone-800" : "text-stone-400 line-through")}>
              {entry.label}
              <span className="mono ml-2 text-[11px] text-stone-400">{entry.key}</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await toggleTaxonomy(kind, entry.key, !entry.isActive);
                })
              }
            >
              {entry.isActive ? "Disable" : "Enable"}
            </Button>
          </li>
        ))}
      </ul>

      {entries.length === 0 && (
        <p className="text-sm text-stone-500">Nothing configured yet.</p>
      )}

      <p className="mt-4 text-xs text-stone-500">
        Disabling hides an option from new records. Existing leads keep theirs —
        history is never rewritten.
      </p>
    </Card>
  );
}
