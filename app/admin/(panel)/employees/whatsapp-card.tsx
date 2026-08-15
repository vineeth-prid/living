"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button, Card, ErrorText, Field, cx, inputClass } from "@/components/admin/ui";
import { setEmployeeWhatsApp } from "../settings/integrations/whatsapp/actions";

// §8. WhatsApp configuration where an admin actually manages a person, rather
// than only on the integration page. The same server action backs both — one
// place decides what a save means, so the two screens cannot drift apart.

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save WhatsApp settings"}
    </Button>
  );
}

export function EmployeeWhatsAppCard({
  employeeId,
  whatsappEnabled,
  whatsappCrmEnabled,
  whatsappNumber,
  mobile,
  lastSeenLabel,
}: {
  employeeId: string;
  whatsappEnabled: boolean;
  whatsappCrmEnabled: boolean;
  whatsappNumber: string | null;
  mobile: string | null;
  lastSeenLabel: string;
}) {
  const [state, formAction] = useActionState(setEmployeeWhatsApp, null);

  return (
    <Card title="WhatsApp">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="employeeId" value={employeeId} />

        {state && !state.ok && <ErrorText>{state.error}</ErrorText>}
        {state?.ok && <p className="text-sm text-pine-700">{state.data.message}</p>}

        <Field
          label="WhatsApp number"
          hint={
            mobile
              ? `Leave blank to use their mobile, ${mobile}.`
              : "They have no mobile on file, so this is required."
          }
        >
          <input
            name="whatsappNumber"
            defaultValue={whatsappNumber ?? ""}
            placeholder="+91 …"
            className={cx(inputClass, "text-sm")}
          />
        </Field>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={whatsappEnabled}
            className="mt-0.5 h-4 w-4 accent-[var(--color-pine-600)]"
          />
          <span>
            <span className="block text-sm text-stone-800">Enable WhatsApp</span>
            <span className="block text-xs text-stone-500">
              Living may message them — lead assignments, follow-up notices.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            name="crmEnabled"
            defaultChecked={whatsappCrmEnabled}
            className="mt-0.5 h-4 w-4 accent-[var(--color-pine-600)]"
          />
          <span>
            <span className="block text-sm text-stone-800">Enable CRM commands</span>
            <span className="block text-xs text-stone-500">
              They can read and change CRM records from their phone. Requires
              WhatsApp above; their role and permissions still apply.
            </span>
          </span>
        </label>

        <dl className="flex justify-between border-t border-stone-200 pt-3 text-xs">
          <dt className="text-stone-500">Last WhatsApp activity</dt>
          <dd className="text-stone-800">{lastSeenLabel}</dd>
        </dl>

        <div className="flex items-center gap-3">
          <Submit />
          <Link
            href="/admin/settings/integrations/whatsapp"
            className="text-xs text-stone-500 hover:text-stone-800"
          >
            Integration settings
          </Link>
        </div>
      </form>
    </Card>
  );
}
