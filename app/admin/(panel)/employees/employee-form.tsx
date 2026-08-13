"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { PERMISSIONS } from "@/lib/auth/constants";
import {
  Button,
  Card,
  ErrorText,
  Field,
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

export function EmployeeForm<T>({
  action,
  initial,
  submitLabel,
  children,
}: {
  action: (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;
  initial?: Partial<EmployeeFormValues>;
  submitLabel: string;
  /** Rendered on success — e.g. the generated password. */
  children?: (data: T) => React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;

  if (state?.ok && children) return <>{children(state.data)}</>;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state && !state.ok && <ErrorText>{state.error}</ErrorText>}

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
