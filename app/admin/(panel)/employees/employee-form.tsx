"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Check } from "lucide-react";
import { PERMISSIONS } from "@/lib/auth/constants";
import {
  Button,
  Card,
  ErrorText,
  Field,
  LinkButton,
  inputClass,
} from "@/components/admin/ui";
import type { ActionResult } from "@/lib/auth/dal";

export type EmployeeFormValues = {
  fullName: string;
  email: string;
  mobile: string;
  role: "admin" | "employee";
  department: string;
  employeeCode: string;
  joinedAt: string;
  permissions: string[];
};

const GRANTS = [
  {
    value: PERMISSIONS.propertyPublish,
    label: "Publish properties",
    hint: "Otherwise only an admin can push a listing live.",
  },
  {
    value: PERMISSIONS.propertyFinalPrice,
    label: "See final (internal) price",
    hint: "Internal negotiated figure. Never shown on the website.",
  },
];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** Create returns the one-time password; update has nothing to hand back. */
export type EmployeeResult = { password: string } | null;

export function EmployeeForm({
  action,
  initial,
  submitLabel,
}: {
  action: (
    prev: ActionResult<EmployeeResult> | null,
    formData: FormData,
  ) => Promise<ActionResult<EmployeeResult>>;
  initial?: Partial<EmployeeFormValues>;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;

  // The success panel is rendered here rather than handed in as a render prop
  // by the page: a Server Component cannot pass a function to a Client
  // Component, and doing it threw before /admin/employees/new could render.
  if (state?.ok && state.data?.password) {
    return (
      <Card title="Employee created">
        <p className="text-sm text-stone-600">
          Share this temporary password with them directly. It is shown once and
          cannot be retrieved again — only reset. They&apos;ll be asked to
          change it at first sign-in.
        </p>
        <p className="mono mt-4 rounded-[10px] bg-stone-100 px-4 py-3 text-lg text-stone-900">
          {state.data.password}
        </p>
        <div className="mt-5 flex gap-3">
          <LinkButton href="/admin/employees" variant="primary">
            Back to employees
          </LinkButton>
          <LinkButton href="/admin/employees/new">Add another</LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state && !state.ok && <ErrorText>{state.error}</ErrorText>}
      {state?.ok && !state.data?.password && (
        <p className="flex items-center gap-2 rounded-[10px] bg-pine-50 px-3 py-2 text-sm text-pine-800">
          <Check className="h-4 w-4" />
          Saved.
        </p>
      )}

      <Card title="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors?.fullName?.[0]}>
            <input
              name="fullName"
              required
              defaultValue={initial?.fullName}
              className={inputClass}
            />
          </Field>
          <Field label="Email" required error={errors?.email?.[0]}>
            <input
              name="email"
              type="email"
              required
              defaultValue={initial?.email}
              className={inputClass}
            />
          </Field>
          <Field label="Mobile" error={errors?.mobile?.[0]}>
            <input
              name="mobile"
              type="tel"
              defaultValue={initial?.mobile}
              className={inputClass}
              placeholder="+91 …"
            />
          </Field>
          <Field label="Employee ID">
            <input
              name="employeeCode"
              defaultValue={initial?.employeeCode}
              className={inputClass}
              placeholder="LIV-EMP-004"
            />
          </Field>
          <Field label="Department / team">
            <input
              name="department"
              defaultValue={initial?.department}
              className={inputClass}
              placeholder="Sales"
            />
          </Field>
          <Field label="Date joined">
            <input
              name="joinedAt"
              type="date"
              defaultValue={initial?.joinedAt}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card title="Role and permissions">
        <Field
          label="Role"
          required
          hint="Administrators see reporting and can manage employees. Employees cannot."
        >
          <select
            name="role"
            defaultValue={initial?.role ?? "employee"}
            className={inputClass}
          >
            <option value="employee">Employee</option>
            <option value="admin">Administrator</option>
          </select>
        </Field>

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold tracking-wide text-stone-700">
            Extra permissions
          </legend>
          <p className="mb-3 mt-1 text-xs text-stone-500">
            Ignored for administrators, who already hold every permission.
          </p>
          <div className="flex flex-col gap-3">
            {GRANTS.map((grant) => (
              <label key={grant.value} className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  name="permissions"
                  value={grant.value}
                  defaultChecked={initial?.permissions?.includes(grant.value)}
                  className="mt-0.5 h-4 w-4 accent-[var(--color-pine-600)]"
                />
                <span>
                  <span className="block text-sm text-stone-800">
                    {grant.label}
                  </span>
                  <span className="block text-xs text-stone-500">
                    {grant.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <div className="flex items-center gap-3">
        <Submit label={submitLabel} />
        <Link
          href="/admin/employees"
          className="text-sm text-stone-500 hover:text-stone-800"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
