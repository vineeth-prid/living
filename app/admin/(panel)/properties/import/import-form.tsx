"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button, Card, ErrorText, Field, cx, inputClass } from "@/components/admin/ui";
import type { ActionResult } from "@/lib/auth/dal";
import type { ImportReport } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Importing…" : "Import properties"}
    </Button>
  );
}

export function ImportForm({
  action,
}: {
  action: (
    prev: ActionResult<ImportReport> | null,
    formData: FormData,
  ) => Promise<ActionResult<ImportReport>>;
}) {
  const [state, formAction] = useActionState(action, null);
  const report = state?.ok ? state.data : null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state && !state.ok && <ErrorText>{state.error}</ErrorText>}

      {report && (
        <Card title="Result">
          <p className="text-sm text-stone-800">
            {report.created} propert{report.created === 1 ? "y" : "ies"} created
            as draft{report.created === 1 ? "" : "s"}.
            {report.failures.length > 0 &&
              ` ${report.failures.length} row${report.failures.length === 1 ? "" : "s"} skipped.`}
          </p>

          {report.failures.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 text-xs">
              {report.failures.map((failure) => (
                <li key={failure.line} className="text-stone-600">
                  <span className="mono text-stone-400">Line {failure.line}</span>{" "}
                  <span className="font-medium text-stone-800">{failure.name}</span>
                  {" — "}
                  <span className="text-[var(--color-danger)]">{failure.reason}</span>
                </li>
              ))}
            </ul>
          )}

          {report.created > 0 && (
            <Link
              href="/admin/properties"
              className="mt-4 inline-block text-sm text-pine-700 hover:underline"
            >
              See the imported listings
            </Link>
          )}
        </Card>
      )}

      <Card title="Upload">
        <Field
          label="CSV file"
          hint="In Excel: File → Save As → CSV UTF-8. Up to 500 rows at a time."
        >
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className={cx(
              inputClass,
              "file:mr-3 file:rounded file:border-0 file:bg-stone-200 file:px-3 file:py-1 file:text-xs",
            )}
          />
        </Field>
        <div className="mt-5 flex items-center gap-3">
          <Submit />
          <Link
            href="/admin/properties"
            className="text-sm text-stone-500 hover:text-stone-800"
          >
            Cancel
          </Link>
        </div>
      </Card>
    </form>
  );
}
