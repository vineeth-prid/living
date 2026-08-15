"use client";

import { useActionState, useTransition, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Button,
  Card,
  ErrorText,
  Field,
  cx,
  inputClass,
} from "@/components/admin/ui";
import type { ActionResult } from "@/lib/auth/dal";
import {
  configureWebhook,
  retryOutbound,
  sendTestMessage,
  setEmployeeWhatsApp,
  testConnection,
} from "./actions";

type Employee = {
  id: string;
  fullName: string;
  whatsappEnabled: boolean;
  whatsappCrmEnabled: boolean;
  whatsappNumber: string | null;
  maskedNumber: string;
  scope: string[];
};

export type ScopeOption = { intent: string; help: string };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

/** §45/§42. Both are read-mostly checks against the live gateway. */
export function ConnectionPanel({ configured }: { configured: boolean }) {
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<ActionResult<{ lines?: string[]; message?: string }>>) =>
    start(async () => {
      setError(null);
      setLines(null);
      const result = await action();
      if (result.ok) setLines(result.data.lines ?? [result.data.message ?? "Done."]);
      else setError(result.error);
    });

  return (
    <Card title="Connection">
      {!configured && (
        <p className="mb-4 rounded-[10px] bg-clay-50 px-3 py-2 text-xs text-clay-800">
          The integration is off. Set the OPENWA_* variables in .env.local and
          restart before testing.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending || !configured}
          onClick={() => run(testConnection)}
        >
          Test connection
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || !configured}
          onClick={() => run(configureWebhook)}
        >
          Configure webhook
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || !configured}
          onClick={() => run(retryOutbound)}
        >
          Resend failed
        </Button>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {lines && (
        <ul className="mt-4 flex flex-col gap-1 text-xs text-stone-600">
          {lines.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** §46. Recipients are staff with access, chosen from a list — never typed. */
export function TestMessagePanel({ employees }: { employees: Employee[] }) {
  const [state, formAction] = useActionState(sendTestMessage, null);
  const allowed = employees.filter((e) => e.whatsappEnabled);

  return (
    <Card title="Send a test message">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        {state && !state.ok && (
          <div className="w-full">
            <ErrorText>{state.error}</ErrorText>
          </div>
        )}
        {state?.ok && (
          <p className="w-full text-sm text-pine-700">{state.data.message}</p>
        )}
        <Field label="To" className="min-w-[14rem] flex-1">
          <select name="employeeId" className={inputClass}>
            <option value="">Choose an employee…</option>
            {allowed.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} — {employee.maskedNumber}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="…or a number"
          className="w-48"
          hint="Must belong to an employee with access."
        >
          <input
            name="testNumber"
            inputMode="tel"
            placeholder="+91 …"
            className={inputClass}
          />
        </Field>
        <Submit label="Send test" />
      </form>
      {allowed.length === 0 && (
        <p className="mt-3 text-xs text-stone-500">
          No employee has WhatsApp access yet. Enable one below first.
        </p>
      )}
    </Card>
  );
}

/** §13. The allowlist — the only route by which a number can drive the CRM. */
export function AccessPanel({
  employees,
  scopeOptions,
}: {
  employees: Employee[];
  scopeOptions: ScopeOption[];
}) {
  const [state, formAction] = useActionState(setEmployeeWhatsApp, null);

  return (
    <Card title="Employee access">
      <p className="mb-4 text-xs text-stone-500">
        Only these numbers can run CRM commands over WhatsApp. Being listed as an
        employee is not enough — access is granted here, one person at a time.
      </p>

      {state && !state.ok && <ErrorText>{state.error}</ErrorText>}
      {state?.ok && <p className="mb-3 text-sm text-pine-700">{state.data.message}</p>}

      <ul className="flex flex-col gap-3">
        {employees.map((employee) => (
          <li
            key={employee.id}
            className="rounded-[10px] border border-stone-200 p-3"
          >
            <form action={formAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="employeeId" value={employee.id} />
              <div className="min-w-[10rem] flex-1">
                <span className="block text-sm font-medium text-stone-900">
                  {employee.fullName}
                </span>
                <span className="text-xs text-stone-400">
                  {employee.whatsappEnabled
                    ? `${employee.maskedNumber}${employee.whatsappCrmEnabled ? " · can command" : " · notifications only"}`
                    : "No access"}
                </span>
              </div>
              <Field label="WhatsApp number" className="w-52">
                <input
                  name="whatsappNumber"
                  defaultValue={employee.whatsappNumber ?? ""}
                  placeholder="Falls back to their mobile"
                  className={cx(inputClass, "text-sm")}
                />
              </Field>
              <label className="flex items-center gap-2 pb-2 text-xs text-stone-600">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={employee.whatsappEnabled}
                  className="h-4 w-4 accent-[var(--color-pine-600)]"
                />
                WhatsApp
              </label>
              <label className="flex items-center gap-2 pb-2 text-xs text-stone-600">
                <input
                  type="checkbox"
                  name="crmEnabled"
                  defaultChecked={employee.whatsappCrmEnabled}
                  className="h-4 w-4 accent-[var(--color-pine-600)]"
                />
                CRM commands
              </label>
              <Submit label="Save" />

              {/* §13. Leave every box clear for the usual case: their role and
                  permissions decide. Ticking any turns this into an allow-list,
                  which can only ever take capability away. */}
              <details className="w-full">
                <summary className="cursor-pointer text-xs text-stone-500 hover:text-stone-800">
                  Limit to specific commands
                  {employee.scope.length > 0 && ` (${employee.scope.length} selected)`}
                </summary>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {scopeOptions.map((option) => (
                    <label
                      key={option.intent}
                      className="flex items-start gap-2 text-xs text-stone-600"
                    >
                      <input
                        type="checkbox"
                        name="scope"
                        value={option.intent}
                        defaultChecked={employee.scope.includes(option.intent)}
                        className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-pine-600)]"
                      />
                      {option.help}
                    </label>
                  ))}
                </div>
              </details>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}
