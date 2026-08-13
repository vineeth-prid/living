"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  Button,
  Card,
  ErrorText,
  Field,
  cx,
  inputClass,
} from "@/components/admin/ui";
import { PAYMENT_METHODS } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/auth/dal";

type Option = { id: string; label: string };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function ExpenseForm({
  action,
  submitLabel,
  categories,
  properties,
  leads,
  initial,
  existingReceiptUrl,
}: {
  action: (
    prev: ActionResult<{ id: string }> | null,
    formData: FormData,
  ) => Promise<ActionResult<{ id: string }>>;
  submitLabel: string;
  categories: { key: string; label: string }[];
  properties: Option[];
  leads: Option[];
  initial?: Record<string, unknown>;
  existingReceiptUrl?: string | null;
}) {
  const [state, formAction] = useActionState(action, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;

  const val = (key: string) => {
    const v = initial?.[key];
    return v === null || v === undefined ? "" : String(v);
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state && !state.ok && <ErrorText>{state.error}</ErrorText>}

      <Card title="Expense">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="What was this for?"
            required
            error={errors?.description?.[0]}
            className="sm:col-span-2"
          >
            <input
              name="description"
              required
              defaultValue={val("description")}
              className={inputClass}
              placeholder="Drone photography for The Arbour"
            />
          </Field>

          <Field
            label="Amount (₹)"
            required
            error={errors?.amount?.[0]}
            hint="Rupees, e.g. 12500 or 12,500.50"
          >
            <input
              name="amount"
              required
              inputMode="decimal"
              defaultValue={val("amount")}
              className={inputClass}
              placeholder="12500"
            />
          </Field>

          <Field label="Tax / GST (₹)" error={errors?.tax?.[0]} hint="Included in the amount above, if any.">
            <input
              name="tax"
              inputMode="decimal"
              defaultValue={val("tax")}
              className={inputClass}
            />
          </Field>

          <Field label="Date" required error={errors?.spentAt?.[0]}>
            <input
              type="date"
              name="spentAt"
              required
              defaultValue={val("spentAt")}
              className={inputClass}
            />
          </Field>

          <Field label="Category">
            <select
              name="categoryKey"
              defaultValue={val("categoryKey")}
              className={inputClass}
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Paid to (vendor)">
            <input name="vendor" defaultValue={val("vendor")} className={inputClass} />
          </Field>

          <Field label="Payment method">
            <select
              name="paymentMethod"
              defaultValue={val("paymentMethod")}
              className={inputClass}
            >
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {m.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Invoice / bill number">
            <input
              name="invoiceNumber"
              defaultValue={val("invoiceNumber")}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      {/* Both optional — an electricity bill belongs to neither a listing nor
          a lead, and forcing a choice would produce junk attribution. */}
      <Card title="Attribution">
        <p className="mb-4 text-xs text-stone-500">
          Optional. Tagging an expense lets you see what a listing or a lead
          actually cost. Leave both blank for general overheads.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property">
            <select
              name="propertyId"
              defaultValue={val("propertyId")}
              className={inputClass}
            >
              <option value="">Not property-specific</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lead">
            <select
              name="leadId"
              defaultValue={val("leadId")}
              className={inputClass}
            >
              <option value="">Not lead-specific</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Receipt and notes">
        <div className="flex flex-col gap-4">
          <Field
            label="Receipt"
            hint="PDF or image, up to 25 MB. Uploading a new file replaces the old one."
          >
            <input
              type="file"
              name="receipt"
              accept="application/pdf,image/*"
              className={cx(
                inputClass,
                "file:mr-3 file:rounded file:border-0 file:bg-stone-200 file:px-3 file:py-1 file:text-xs",
              )}
            />
          </Field>

          {existingReceiptUrl && (
            <p className="text-xs">
              <a
                href={existingReceiptUrl}
                target="_blank"
                rel="noreferrer"
                className="text-pine-700 underline underline-offset-2"
              >
                View the current receipt
              </a>
            </p>
          )}

          <Field label="Notes">
            <textarea
              name="notes"
              rows={3}
              defaultValue={val("notes")}
              className={cx(inputClass, "resize-y")}
            />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Submit label={submitLabel} />
        <Link
          href="/admin/expenses"
          className="text-sm text-stone-500 hover:text-stone-800"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
