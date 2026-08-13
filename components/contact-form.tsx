"use client";

import { useActionState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { site } from "@/lib/site";
import { submitEnquiry, type EnquiryState } from "@/app/actions/enquiry";
import { attachAttribution } from "@/lib/attribution";

// Submissions now become CRM leads (§31) instead of opening a mail client.
// The markup below is unchanged — same fields, same classes, same animation.
const interests = [
  "Buying a home",
  "Selling a property",
  "NRI services",
  "The platform",
  "Something else",
];

export function ContactForm() {
  const [state, submit] = useActionState<EnquiryState, FormData>(
    submitEnquiry,
    {},
  );
  const sent = Boolean(state.ok);
  // Attribution is stamped onto the payload as the form submits.
  const formAction = (formData: FormData) => submit(attachAttribution(formData));

  const field =
    "mt-2 w-full rounded-[12px] border border-stone-300 bg-page px-4 py-3 text-ink outline-none transition focus:border-pine-500 focus:ring-[3px] focus:ring-pine-500/25";
  const label = "text-sm font-medium text-ink";

  return (
    <div className="rounded-hero border border-hairline bg-surface p-8 shadow-soft md:p-10">
      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-start gap-4 py-8"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pine-50">
              <Check className="h-6 w-6 text-pine-600" strokeWidth={2} />
            </span>
            <h3 className="font-display text-3xl font-light text-ink">
              Thank you — that's on its way.
            </h3>
            <p className="max-w-sm leading-relaxed text-body">
              We have your message and someone will come back to you within one
              business day. Prefer to talk now? Call us on{" "}
              <a href={`tel:${site.phoneRaw}`} className="text-pine-700 underline underline-offset-4">
                {site.phone}
              </a>
              .
            </p>
            {state.reference && (
              <p className="mono text-xs text-muted">
                Reference {state.reference}
              </p>
            )}
          </motion.div>
        ) : (
          <motion.form
            key="form"
            action={formAction}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col gap-5"
          >
            {state.error && (
              <p role="alert" className="rounded-[10px] bg-[#fbeceb] px-3 py-2 text-sm text-[var(--color-danger)]">
                {state.error}
              </p>
            )}
            {/* Honeypot — hidden from people, irresistible to bots. */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute h-0 w-0 overflow-hidden opacity-0"
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Your name</span>
                <input name="name" required autoComplete="name" className={field} placeholder="Anjali Menon" />
              </label>
              <label className="block">
                <span className={label}>Phone</span>
                {/* Named `mobile` and required: leads.mobile is NOT NULL, and a
                    CRM lead nobody can call isn't a lead. */}
                <input name="mobile" type="tel" required autoComplete="tel" className={field} placeholder="+91 …" />
              </label>
            </div>
            <label className="block">
              <span className={label}>Email</span>
              <input name="email" type="email" required autoComplete="email" className={field} placeholder="you@email.com" />
            </label>
            <label className="block">
              <span className={label}>What can we help with?</span>
              <select name="interest" defaultValue="" className={field}>
                <option value="" disabled>
                  Choose one
                </option>
                {interests.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Message</span>
              <textarea
                name="message"
                rows={4}
                className={`${field} resize-none`}
                placeholder="Tell us a little about what you're looking for."
              />
            </label>
            <button
              type="submit"
              className="mt-1 inline-flex min-h-[48px] items-center justify-center rounded-[12px] bg-pine-600 px-6 py-3 font-medium text-stone-50 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-pine-700 hover:shadow-lift active:scale-[0.98]"
            >
              Send message
            </button>
            <p className="text-xs leading-relaxed text-muted">
              We reply within one business day. For anything urgent, WhatsApp or
              call us — we're happy to talk.
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
