import { CRM_TIMEZONE } from "@/lib/integrations/whatsapp/config";

// §38. Every outbound wording, in one file. Short, because these are read on a
// phone, and plain, because a CRM confirmation is not marketing copy.

export const t = {
  help: (commands: string[]) =>
    ["*Living CRM*", "", "You can say:", ...commands.map((c) => `• ${c}`)].join("\n"),

  notUnderstood: () =>
    "I didn't follow that. Send *help* to see what I can do.",

  // §10. Exactly what the sprint asks for: it never implies anything was
  // changed, and it points at the panel rather than leaving them stuck.
  unavailable: () =>
    "I couldn't understand that request right now. Please use the Living CRM or try again shortly.",

  notPermitted: () =>
    "You don't have access to that. Nothing was changed.",

  noCrmAccess: () =>
    "Your number is recognised, but CRM access over WhatsApp isn't switched on for you. An administrator can enable it.",

  // §40: a failure says so. It never reads like a success.
  failed: (what: string) =>
    `I couldn't ${what} — the CRM update failed and *nothing was changed*.`,

  noneFound: (what: string) => `I couldn't find ${what}.`,

  ambiguous: (what: string, options: { label: string }[]) =>
    [
      `I found ${options.length} ${what}. Which one?`,
      "",
      ...options.map((option, i) => `${i + 1}. ${option.label}`),
      "",
      "Reply with the number or the reference.",
    ].join("\n"),

  confirm: (question: string) => `⚠️ ${question}\n\nReply *yes* to go ahead, or *no* to stop.`,

  cancelled: () => "Cancelled. Nothing was changed.",

  nothingPending: () => "There's nothing waiting for a yes or no.",

  /** §1. One missing field, asked for in the words the employee would use. */
  missingField: (field: string, intent: string) => {
    const asks: Record<string, string> = {
      leadName: "Which lead?",
      propertyReference: "Which property? Give me the reference, like LIV-0027.",
      date: "Which day?",
      note: "What should it say?",
      status: "Which status?",
      employeeName: "Who should I assign it to?",
      amount: "What's the new amount?",
      summary: "What should I record?",
    };
    return (
      asks[field] ??
      `I need the ${field} for ${intent.toLowerCase().replace(/_/g, " ")}.`
    );
  },

  expired: () =>
    "That confirmation expired, so nothing was changed. Send the request again if you still want it.",

  followupAdded: (lead: string, when: string) =>
    `✅ Follow-up added for ${lead} — ${when}.`,

  followupsEmpty: () => "No follow-ups pending. Nothing overdue either.",

  followups: (
    rows: { leadName: string; leadReference: string; dueAt: Date; kind: string }[],
  ) =>
    [
      `*Your follow-ups* (${rows.length})`,
      "",
      ...rows.map(
        (row, i) =>
          `${i + 1}. ${row.leadName} — ${row.kind.replace(/_/g, " ")} — ${dateTime(row.dueAt)}`,
      ),
    ].join("\n"),

  leadsEmpty: () => "You have no leads matching that.",

  leads: (
    rows: { name: string; reference: string; budgetMax: number | null; city: string | null }[],
    label: string,
  ) =>
    [
      `*${label}* (${rows.length})`,
      "",
      ...rows.map(
        (row, i) =>
          `${i + 1}. ${row.name} — ${row.budgetMax ? inr(row.budgetMax) : "budget not set"}${row.city ? ` — ${row.city}` : ""} — ${row.reference}`,
      ),
    ].join("\n"),

  lead: (row: {
    name: string;
    reference: string;
    status: string;
    priority: string;
    mobile: string;
    city: string | null;
    budgetMax: number | null;
    nextFollowUpAt: Date | null;
  }) =>
    [
      `*${row.name}* — ${row.reference}`,
      `Status: ${row.status.replace(/_/g, " ")} · ${row.priority}`,
      `Mobile: ${row.mobile}`,
      row.city ? `City: ${row.city}` : null,
      row.budgetMax ? `Budget: up to ${inr(row.budgetMax)}` : null,
      row.nextFollowUpAt
        ? `Next follow-up: ${dateTime(row.nextFollowUpAt)}`
        : "No follow-up scheduled.",
    ]
      .filter(Boolean)
      .join("\n"),

  /**
   * §25/§4: asking price and the public state. sellerContact and internalNotes
   * are never selected by the caller and there is no branch here that could
   * print them.
   *
   * `finalPrice` is passed in only when the caller has already checked
   * property.final_price (§8) — undefined means "not permitted", and the line
   * simply does not exist rather than rendering a placeholder that says one
   * is being kept from you.
   */
  property: (
    row: {
      reference: string | null;
      name: string;
      type: string;
      locality: string;
      city: string;
      priceLabel: string;
      workflowStatus: string;
      isPublic: boolean;
    },
    finalPrice?: number | null,
  ) =>
    [
      `*${row.name}* — ${row.reference ?? "no reference"}`,
      `${row.type}, ${row.locality}, ${row.city}`,
      `Asking: ${row.priceLabel}`,
      finalPrice ? `Final (internal): ${inr(finalPrice)}` : null,
      `Status: ${row.workflowStatus.replace(/_/g, " ")}${row.isPublic ? " · live on site" : " · not on site"}`,
    ]
      .filter(Boolean)
      .join("\n"),

  noteAdded: (lead: string) => `✅ Note added to ${lead}.`,

  statusChanged: (lead: string, from: string, to: string) =>
    `✅ ${lead}: ${from.replace(/_/g, " ")} → ${to.replace(/_/g, " ")}.`,

  propertyLinked: (lead: string, property: string) =>
    `✅ Linked ${property} to ${lead}.`,

  priceChanged: (property: string, from: string, to: string) =>
    `✅ ${property} asking price ${from} → ${to}. The listing is not republished by this change.`,

  published: (property: string) => `✅ ${property} is live on the website.`,

  unpublished: (property: string) => `✅ ${property} has been taken off the website.`,

  publishBlocked: (property: string, reasons: string[]) =>
    [`I can't publish ${property} yet:`, ...reasons.map((r) => `• ${r}`)].join("\n"),

  draftCreated: (reference: string, name: string) =>
    `✅ Draft created — ${reference}, ${name}.\n\nIt is *not* on the website. Add photos and publish it from the panel, or send *publish ${reference}* when it's ready.`,

  profile: (name: string, role: string) =>
    `${name} — ${role === "admin" ? "Administrator" : "Employee"}.`,

  /**
   * §6. Short, and specific when it can be. Nothing internal: a reference and
   * a promise to call, which is all a first reply should ever be.
   */
  customerAcknowledged: (reference: string | null) =>
    reference
      ? `Thanks for your interest in ${reference}. Our team will get in touch with you shortly.`
      : "Thanks for getting in touch with Living. Our team will get in touch with you shortly.",
};

/** Rupees, compact. Same convention as the panel's `inr`. */
export function inr(value: number | null | undefined): string {
  if (!value) return "—";
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2).replace(/\.00$/, "")} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1).replace(/\.0$/, "")} L`;
  return `₹${value.toLocaleString("en-IN")}`;
}

/** Always rendered in Living's timezone, never the server's. */
export function dateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: CRM_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
