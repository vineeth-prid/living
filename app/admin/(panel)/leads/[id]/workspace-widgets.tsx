"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Check, Plus, X } from "lucide-react";
import {
  addFollowUp,
  addNote,
  assignLead,
  changePriority,
  changeStatus,
  linkPropertyAction,
  logInteraction,
  setFollowUpStatus,
  unlinkPropertyAction,
} from "../actions";
import { LEAD_STATUSES, LEAD_PRIORITIES, FOLLOWUP_KINDS } from "@/lib/db/schema";
import {
  Button,
  Card,
  ErrorText,
  Field,
  cx,
  inputClass,
} from "@/components/admin/ui";
import { LEAD_STATUS_LABELS, relativeDue, dateTime } from "@/components/admin/crm";
import type { ActionResult } from "@/lib/auth/dal";

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) setError(result.error);
    });
  return { pending, error, run };
}

/** Status, priority and assignment — the three controls used most. */
export function LeadControls({
  id,
  status,
  priority,
  assignedToId,
  employees,
  isAdmin,
}: {
  id: string;
  status: string;
  priority: string;
  assignedToId: string | null;
  employees: { id: string; fullName: string }[];
  isAdmin: boolean;
}) {
  const { pending, error, run } = useAction();

  return (
    <Card title="Status">
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex flex-col gap-4">
        <Field label="Pipeline status">
          <select
            value={status}
            disabled={pending}
            onChange={(e) => run(() => changeStatus(id, e.target.value as typeof LEAD_STATUSES[number]))}
            className={inputClass}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>

        <Field label="Priority">
          <div className="flex gap-2">
            {LEAD_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                disabled={pending}
                onClick={() => run(() => changePriority(id, p))}
                className={cx(
                  "flex-1 rounded-[9px] border px-2 py-1.5 text-xs font-medium capitalize transition",
                  priority === p
                    ? "border-pine-600 bg-pine-50 text-pine-800"
                    : "border-stone-300 text-stone-600 hover:bg-stone-50",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>

        {/* Reassignment is an admin action; employees see the owner, read-only. */}
        {isAdmin ? (
          <Field label="Assigned to">
            <select
              value={assignedToId ?? ""}
              disabled={pending}
              onChange={(e) => run(() => assignLead(id, e.target.value || null))}
              className={inputClass}
            >
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.fullName}</option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
    </Card>
  );
}

function SubmitRow({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function NoteComposer({ id }: { id: string }) {
  const bound = addNote.bind(null, id);
  const [state, formAction] = useActionState<ActionResult<null> | null, FormData>(
    bound,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state && !state.ok && <ErrorText>{state.error}</ErrorText>}
      <textarea
        name="body"
        rows={3}
        required
        placeholder="What was discussed?"
        className={cx(inputClass, "resize-y")}
      />
      <div className="flex items-center gap-3">
        <SubmitRow label="Add note" />
        <span className="text-xs text-stone-500">
          Notes are kept permanently and never overwritten.
        </span>
      </div>
    </form>
  );
}

export function InteractionLogger({ id }: { id: string }) {
  const bound = logInteraction.bind(null, id);
  const [state, formAction] = useActionState<ActionResult<null> | null, FormData>(
    bound,
    null,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      {state && !state.ok && (
        <div className="w-full"><ErrorText>{state.error}</ErrorText></div>
      )}
      <Field label="Log an interaction" className="w-40">
        <select name="kind" className={inputClass}>
          {FOLLOWUP_KINDS.map((k) => (
            <option key={k} value={k} className="capitalize">
              {k.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Outcome" className="flex-1 min-w-[12rem]">
        <input name="summary" className={inputClass} placeholder="Spoke briefly, wants a viewing Saturday" />
      </Field>
      <SubmitRow label="Log" />
    </form>
  );
}

export function FollowUpPanel({
  id,
  followups,
  employees,
  isAdmin,
}: {
  id: string;
  followups: {
    id: string;
    dueAt: Date;
    kind: string;
    status: string;
    notes: string | null;
    assignedToName: string | null;
  }[];
  employees: { id: string; fullName: string }[];
  isAdmin: boolean;
}) {
  const bound = addFollowUp.bind(null, id);
  const [state, formAction] = useActionState<ActionResult<null> | null, FormData>(
    bound,
    null,
  );
  const { pending, error, run } = useAction();
  const [open, setOpen] = useState(followups.length === 0);

  const pendingItems = followups.filter((f) => f.status === "pending");
  const done = followups.filter((f) => f.status !== "pending");

  return (
    <Card
      title="Follow-ups"
      action={
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-xs text-pine-700 hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Schedule
        </button>
      }
    >
      {error && <ErrorText>{error}</ErrorText>}
      {state && !state.ok && <ErrorText>{state.error}</ErrorText>}

      {open && (
        <form action={formAction} className="mb-5 grid gap-3 rounded-[10px] bg-stone-50 p-3 sm:grid-cols-2">
          <Field label="Date" required>
            <input type="date" name="date" required className={inputClass} />
          </Field>
          <Field label="Time">
            <input type="time" name="time" defaultValue="09:00" className={inputClass} />
          </Field>
          <Field label="Type">
            <select name="kind" className={inputClass}>
              {FOLLOWUP_KINDS.map((k) => (
                <option key={k} value={k} className="capitalize">
                  {k.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          {isAdmin && (
            <Field label="Assign to">
              <select name="assignedToId" className={inputClass}>
                <option value="">Lead owner</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Notes" className="sm:col-span-2">
            <input name="notes" className={inputClass} placeholder="Call after 6pm" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitRow label="Schedule follow-up" />
          </div>
        </form>
      )}

      {pendingItems.length === 0 && done.length === 0 ? (
        <p className="text-sm text-stone-500">Nothing scheduled.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pendingItems.map((f) => {
            const due = relativeDue(f.dueAt);
            return (
              <li key={f.id} className="flex items-start justify-between gap-3 rounded-[10px] border border-stone-200 p-3">
                <div>
                  <p className="text-sm font-medium capitalize text-stone-800">
                    {f.kind.replace(/_/g, " ")}
                  </p>
                  <p className={cx("text-xs", due.overdue ? "text-[var(--color-danger)]" : "text-stone-500")}>
                    {dateTime(f.dueAt)} · {due.label}
                  </p>
                  {f.notes && <p className="mt-1 text-xs text-stone-500">{f.notes}</p>}
                  {f.assignedToName && (
                    <p className="mt-0.5 text-xs text-stone-400">{f.assignedToName}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    title="Mark completed"
                    disabled={pending}
                    onClick={() => run(() => setFollowUpStatus(f.id, "completed"))}
                    className="rounded p-1.5 text-pine-700 hover:bg-pine-50"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Cancel"
                    disabled={pending}
                    onClick={() => run(() => setFollowUpStatus(f.id, "cancelled"))}
                    className="rounded p-1.5 text-stone-400 hover:bg-stone-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}

          {done.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 text-xs text-stone-400">
              <span className="capitalize line-through">
                {f.kind.replace(/_/g, " ")} · {dateTime(f.dueAt)}
              </span>
              <span className="capitalize">{f.status}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function LinkedProperties({
  id,
  linked,
  options,
}: {
  id: string;
  linked: {
    propertyId: string;
    name: string;
    reference: string | null;
    locality: string;
    priceLabel: string;
  }[];
  options: { id: string; name: string; reference: string | null; locality: string }[];
}) {
  const { pending, error, run } = useAction();
  const linkedIds = new Set(linked.map((l) => l.propertyId));

  return (
    <Card title={`Interested properties (${linked.length})`}>
      {error && <ErrorText>{error}</ErrorText>}

      {linked.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {linked.map((p) => (
            <li key={p.propertyId} className="flex items-center justify-between gap-3 rounded-[10px] border border-stone-200 px-3 py-2">
              <div>
                <Link href={`/admin/properties/${p.propertyId}`} className="text-sm font-medium text-stone-800 hover:text-pine-700">
                  {p.name}
                </Link>
                <p className="text-xs text-stone-500">
                  {p.reference ? `${p.reference} · ` : ""}{p.locality} · {p.priceLabel}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                title="Remove"
                onClick={() => run(() => unlinkPropertyAction(id, p.propertyId))}
                className="rounded p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <select
        value=""
        disabled={pending}
        onChange={(e) => {
          if (e.target.value) run(() => linkPropertyAction(id, e.target.value));
        }}
        className={inputClass}
      >
        <option value="">Add a property…</option>
        {options
          .filter((o) => !linkedIds.has(o.id))
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.reference ? `${o.reference} — ` : ""}{o.name}, {o.locality}
            </option>
          ))}
      </select>
    </Card>
  );
}
