"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  Button,
  Card,
  ErrorText,
  Field,
  cx,
  inputClass,
} from "@/components/admin/ui";
import { LEAD_STATUS_LABELS } from "@/components/admin/crm";
import { checkDuplicates, type DuplicateLead } from "./duplicates";
import type { ActionResult } from "@/lib/auth/dal";

type Option = { key: string; label: string };
type Employee = { id: string; fullName: string };
type PropertyOption = {
  id: string;
  name: string;
  reference: string | null;
  locality: string;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function LeadForm({
  action,
  submitLabel,
  types,
  sources,
  employees,
  propertyOptions,
  isAdmin,
  initial,
}: {
  action: (
    prev: ActionResult<{ id: string }> | null,
    formData: FormData,
  ) => Promise<ActionResult<{ id: string }>>;
  submitLabel: string;
  types: Option[];
  sources: Option[];
  employees: Employee[];
  propertyOptions: PropertyOption[];
  isAdmin: boolean;
  initial?: Record<string, unknown>;
}) {
  const [state, formAction] = useActionState(action, null);
  const [duplicates, setDuplicates] = useState<DuplicateLead[]>([]);
  const [, startCheck] = useTransition();

  const errors = state && !state.ok ? state.fieldErrors : undefined;
  const val = (key: string) => {
    const v = initial?.[key];
    return v === null || v === undefined ? "" : String(v);
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state && !state.ok && <ErrorText>{state.error}</ErrorText>}

      {/* Warns, never blocks. The employee decides whether this is the same
          person — §30 explicitly rules out automatic merging. */}
      {duplicates.length > 0 && (
        <div className="rounded-[12px] border border-clay-200 bg-clay-50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-clay-800">
            <AlertTriangle className="h-4 w-4" />
            A possible existing lead was found.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {duplicates.map((dup) => (
              <li key={dup.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Link
                  href={`/admin/leads/${dup.id}`}
                  target="_blank"
                  className="font-medium text-clay-900 underline underline-offset-2"
                >
                  {dup.name}
                </Link>
                <span className="mono text-xs text-clay-700">{dup.reference}</span>
                <span className="text-xs text-clay-700">{dup.mobile}</span>
                <span className="text-xs text-clay-700">
                  {LEAD_STATUS_LABELS[dup.status] ?? dup.status}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-clay-700">
            Open the existing lead, or carry on to create a separate record.
          </p>
        </div>
      )}

      <Card title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors?.name?.[0]}>
            <input name="name" required defaultValue={val("name")} className={inputClass} />
          </Field>
          <Field label="Mobile" required error={errors?.mobile?.[0]}>
            <input
              name="mobile"
              type="tel"
              required
              defaultValue={val("mobile")}
              className={inputClass}
              placeholder="+91 …"
              onBlur={(e) => {
                const mobile = e.target.value;
                startCheck(async () => {
                  setDuplicates(await checkDuplicates(mobile));
                });
              }}
            />
          </Field>
          <Field label="Alternate mobile">
            <input name="altMobile" type="tel" defaultValue={val("altMobile")} className={inputClass} />
          </Field>
          <Field label="Email" error={errors?.email?.[0]}>
            <input name="email" type="email" defaultValue={val("email")} className={inputClass} />
          </Field>
          <Field label="Preferred contact">
            <select name="preferredContact" defaultValue={val("preferredContact")} className={inputClass}>
              <option value="">—</option>
              <option value="call">Call</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </Field>
          <Field label="City">
            <input name="city" defaultValue={val("city")} className={inputClass} />
          </Field>
          <Field label="Location / area">
            <input name="location" defaultValue={val("location")} className={inputClass} />
          </Field>
          <Field label="Country" hint="For NRI leads.">
            <input name="country" defaultValue={val("country")} className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card title="Requirement">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lead type">
            <select name="typeKey" defaultValue={val("typeKey")} className={inputClass}>
              <option value="">—</option>
              {types.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Property type">
            <select name="propertyKind" defaultValue={val("propertyKind")} className={inputClass}>
              <option value="">—</option>
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
            </select>
          </Field>
          <Field label="Requirement">
            <select name="requirementType" defaultValue={val("requirementType")} className={inputClass}>
              <option value="">—</option>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="rent">Rent</option>
              <option value="lease">Lease</option>
            </select>
          </Field>
          <Field label="Preferred location">
            <input name="preferredLocation" defaultValue={val("preferredLocation")} className={inputClass} />
          </Field>
          <Field label="Budget from (₹)" error={errors?.budgetMin?.[0]}>
            <input name="budgetMin" defaultValue={val("budgetMin")} className={inputClass} placeholder="8000000" />
          </Field>
          <Field label="Budget to (₹)" error={errors?.budgetMax?.[0]}>
            <input name="budgetMax" defaultValue={val("budgetMax")} className={inputClass} placeholder="15000000" />
          </Field>
          <Field label="Preferred property type">
            <input name="preferredPropertyType" defaultValue={val("preferredPropertyType")} className={inputClass} placeholder="3 BHK apartment" />
          </Field>
          <Field label="Bedrooms">
            <input name="bedrooms" defaultValue={val("bedrooms")} className={inputClass} />
          </Field>
          <Field label="Land requirement">
            <input name="landRequirement" defaultValue={val("landRequirement")} className={inputClass} placeholder="5–10 cents" />
          </Field>
          <Field label="Timeline">
            <select name="timeline" defaultValue={val("timeline")} className={inputClass}>
              <option value="">—</option>
              <option value="immediate">Immediate</option>
              <option value="1-3m">1–3 months</option>
              <option value="3-6m">3–6 months</option>
              <option value="6m+">6 months or more</option>
            </select>
          </Field>
          <Field label="Purpose">
            <select name="purpose" defaultValue={val("purpose")} className={inputClass}>
              <option value="">—</option>
              <option value="own_use">Own use</option>
              <option value="investment">Investment</option>
              <option value="rental">Rental</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Source and ownership">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Source">
            <select name="sourceKey" defaultValue={val("sourceKey")} className={inputClass}>
              <option value="">—</option>
              {sources.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Campaign">
            <input name="campaign" defaultValue={val("campaign")} className={inputClass} />
          </Field>

          {/* Employees can't hand leads to each other — the server ignores this
              field for them and assigns the lead to its creator. */}
          {isAdmin && (
            <Field label="Assign to" hint="Leave blank to assign later.">
              <select name="assignedToId" defaultValue={val("assignedToId")} className={inputClass}>
                <option value="">Unassigned</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Interested properties" className="sm:col-span-2" hint="Ctrl/Cmd-click to choose more than one.">
            <select name="propertyIds" multiple size={5} className={cx(inputClass, "h-auto")}>
              {propertyOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.reference ? `${p.reference} — ` : ""}{p.name}, {p.locality}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Initial comments" className="sm:col-span-2">
            <textarea name="initialMessage" rows={3} defaultValue={val("initialMessage")} className={cx(inputClass, "resize-y")} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Submit label={submitLabel} />
        <Link href="/admin/leads" className="text-sm text-stone-500 hover:text-stone-800">
          Cancel
        </Link>
      </div>
    </form>
  );
}
