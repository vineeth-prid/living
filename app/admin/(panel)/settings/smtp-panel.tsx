"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendTestNotification } from "./actions";
import {
  Button,
  Card,
  ErrorText,
  Field,
  cx,
  inputClass,
} from "@/components/admin/ui";
import type { ActionResult } from "@/lib/auth/dal";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sending…" : "Send test"}
    </Button>
  );
}

export function SmtpPanel({
  configured,
  host,
  from,
  team,
  defaultEmail,
}: {
  configured: boolean;
  host: string | null;
  from: string | null;
  team: string[];
  defaultEmail: string;
}) {
  const [state, formAction] = useActionState<
    ActionResult<{ message: string }> | null,
    FormData
  >(sendTestNotification, null);

  return (
    <Card title="Email notifications">
      <div className="mb-4 flex items-center gap-2">
        <span
          className={cx(
            "h-2 w-2 rounded-full",
            configured ? "bg-[var(--color-success)]" : "bg-stone-300",
          )}
        />
        <span className="text-sm text-stone-700">
          {configured ? "SMTP configured" : "SMTP not configured"}
        </span>
      </div>

      {configured ? (
        <dl className="mb-5 grid gap-2 text-xs">
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">Host</dt>
            <dd className="mono text-stone-800">{host}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">From</dt>
            <dd className="mono text-stone-800">{from}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">Team alerts to</dt>
            <dd className="mono text-right text-stone-800">
              {team.join(", ")}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mb-5 rounded-[10px] bg-clay-50 px-3 py-2 text-xs text-clay-800">
          Set SMTP_HOST and SMTP_FROM in .env.local and restart the app.
          Notifications are recorded as skipped until then, so nothing is lost
          silently.
        </p>
      )}

      <div className="mb-5 rounded-[10px] bg-stone-50 p-3">
        <p className="text-xs font-medium text-stone-700">What triggers email</p>
        <ul className="mt-2 flex flex-col gap-1 text-xs text-stone-600">
          <li>· A website or property enquiry arrives → the team</li>
          <li>· A lead is assigned or reassigned → that employee</li>
        </ul>
        <p className="mt-2 text-xs text-stone-500">
          Follow-up reminders are not emailed — they need a scheduler. The
          Follow-ups page carries what&apos;s due and overdue.
        </p>
      </div>

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        {state && !state.ok && (
          <div className="w-full">
            <ErrorText>{state.error}</ErrorText>
          </div>
        )}
        {state?.ok && (
          <p className="w-full rounded-[10px] bg-pine-50 px-3 py-2 text-sm text-pine-800">
            {state.data.message}
          </p>
        )}
        <Field label="Send a test to" className="flex-1 min-w-[14rem]">
          <input
            name="email"
            type="email"
            required
            defaultValue={defaultEmail}
            className={inputClass}
          />
        </Field>
        <Submit />
      </form>
    </Card>
  );
}
