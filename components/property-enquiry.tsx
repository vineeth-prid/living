"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { submitEnquiry, type EnquiryState } from "@/app/actions/enquiry";
import { attachAttribution } from "@/lib/attribution";

// Public enquiry form on a property page. Visually part of the Living site —
// same tokens, radii and shadows as the existing contact form — not the admin
// design language.

const field =
  "mt-2 w-full rounded-[12px] border border-stone-300 bg-page px-4 py-3 text-ink outline-none transition focus:border-pine-500 focus:ring-[3px] focus:ring-pine-500/25";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex min-h-[48px] w-full items-center justify-center rounded-[12px] bg-pine-600 px-6 py-3 font-medium text-stone-50 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-pine-700 hover:shadow-lift active:scale-[0.98] disabled:translate-y-0 disabled:bg-pine-600/60"
    >
      {pending ? "Sending…" : "Enquire about this property"}
    </button>
  );
}

export function PropertyEnquiryForm({
  propertyId,
  propertyName,
  propertyReference,
}: {
  propertyId: string;
  propertyName: string;
  propertyReference: string | null;
}) {
  const [state, submit] = useActionState<EnquiryState, FormData>(
    submitEnquiry,
    {},
  );
  // Attribution is stamped onto the payload as the form submits, so no effect
  // and no hidden inputs are needed.
  const formAction = (formData: FormData) => submit(attachAttribution(formData));

  if (state.ok) {
    return (
      <div className="rounded-hero border border-hairline bg-surface p-8 shadow-soft">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pine-50">
          <Check className="h-6 w-6 text-pine-600" strokeWidth={2} />
        </span>
        <h3 className="mt-4 font-display text-2xl font-light text-ink">
          Thank you — we&apos;ll be in touch.
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-body">
          Your enquiry about {propertyName} is with our team. Someone will call
          you within one business day.
        </p>
        {state.reference && (
          <p className="mono mt-4 text-xs text-muted">
            Reference {state.reference}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-hero border border-hairline bg-surface p-7 shadow-soft"
    >
      <h2 className="font-display text-2xl font-light text-ink">
        Enquire about this property
      </h2>
      <p className="mt-1.5 text-sm text-muted">
        {propertyReference ? `Reference ${propertyReference}` : propertyName}
      </p>

      {state.error && (
        <p role="alert" className="mt-4 rounded-[10px] bg-[#fbeceb] px-3 py-2 text-sm text-[var(--color-danger)]">
          {state.error}
        </p>
      )}

      <input type="hidden" name="propertyId" value={propertyId} />
      {/* Honeypot — hidden from people, irresistible to bots. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute h-0 w-0 overflow-hidden opacity-0"
      />

      <div className="mt-5 flex flex-col gap-4">
        <label className="block">
          <span className="text-sm font-medium text-ink">Your name</span>
          <input name="name" required autoComplete="name" className={field} placeholder="Anjali Menon" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Phone</span>
          <input name="mobile" type="tel" required autoComplete="tel" className={field} placeholder="+91 …" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Email</span>
          <input name="email" type="email" autoComplete="email" className={field} placeholder="you@email.com" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Message</span>
          <textarea
            name="message"
            rows={3}
            className={`${field} resize-none`}
            placeholder="I'd like to arrange a viewing."
          />
        </label>
        <Submit />
      </div>
    </form>
  );
}
