import nodemailer, { type Transporter } from "nodemailer";
import { db, hasDatabase } from "./db";
import { notifications } from "./db/schema";
import { newId } from "./ids";
import { site } from "./site";

// Event-driven email. There is no scheduler: notifications fire from things
// that happen in the app (a website enquiry arriving, a lead being assigned).
// Digests for due and overdue follow-ups would need a timer, which this
// deliberately doesn't have — the follow-up views carry that information
// instead.
//
// Three rules hold everywhere in here:
//   1. Sending never blocks or fails the operation that triggered it. A lead
//      is captured whether or not the email leaves.
//   2. Every attempt is recorded in `notifications`, including skips, so
//      "nobody was told" is answerable after the fact.
//   3. Unconfigured SMTP is a skip, not an error. The app runs without it.

const globalForMail = globalThis as unknown as { __livingMailer?: Transporter };

export function hasSmtp() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function transporter(): Transporter {
  if (globalForMail.__livingMailer) return globalForMail.__livingMailer;

  const port = Number(process.env.SMTP_PORT ?? 587);
  const instance = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 upgrades via STARTTLS. Getting this backwards
    // is the usual cause of a hanging connection.
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  globalForMail.__livingMailer = instance;
  return instance;
}

/** Where "the team" means — comma-separated, falls back to the public inbox. */
export function teamRecipients(): string[] {
  const raw = process.env.NOTIFY_TEAM_EMAILS ?? site.email;
  return raw
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

type SendInput = {
  event: string;
  to: string | string[];
  subject: string;
  /** Plain text. The HTML body is generated from it. */
  body: string;
  /** Optional call to action rendered as a link. */
  action?: { label: string; path: string };
  entity?: string;
  entityId?: string;
};

async function record(
  input: Omit<SendInput, "body" | "action" | "to">,
  recipient: string,
  status: "sent" | "failed" | "skipped",
  error?: string,
) {
  if (!hasDatabase()) return;
  try {
    await db().insert(notifications).values({
      id: newId(),
      event: input.event,
      channel: "email",
      recipient,
      subject: input.subject,
      status,
      // Truncated: a provider stack trace can be enormous and the first line
      // is the part anyone reads.
      error: error?.slice(0, 500) ?? null,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
    });
  } catch (dbError) {
    console.error("[notify] could not record notification", dbError);
  }
}

/** Minimal branded HTML. No external CSS or images — mail clients strip both. */
function render(body: string, action?: SendInput["action"]) {
  const button = action
    ? `<p style="margin:28px 0 0"><a href="${site.url}${action.path}" style="background:#276055;color:#faf8f4;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block;font-weight:500">${action.label}</a></p>`
    : "";

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#faf8f5;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e1d5;border-radius:16px;padding:32px">
    <p style="margin:0 0 24px;font-size:20px;color:#0d2b2c;font-weight:300;letter-spacing:-0.01em">Living</p>
    <div style="color:#2b3d39;font-size:15px;line-height:1.6;white-space:pre-line">${body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</div>
    ${button}
    <p style="margin:32px 0 0;padding-top:20px;border-top:1px solid #e7e1d5;color:#5c6d67;font-size:12px">
      Sent by the Living admin system. You're receiving this because you're on the team.
    </p>
  </div>
</div>`;
}

/**
 * Sends and logs. Resolves even when delivery fails — callers use it for
 * side effects only and must not branch on the outcome.
 */
export async function notify(input: SendInput): Promise<void> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((address) => address.trim())
    .filter(Boolean);

  if (recipients.length === 0) return;

  if (!hasSmtp()) {
    // Logged as skipped rather than dropped, so an unconfigured server is
    // visible in the notification log instead of looking like silence.
    for (const recipient of recipients) {
      await record(input, recipient, "skipped", "SMTP is not configured");
    }
    console.warn(`[notify] SMTP unset — "${input.subject}" not sent`);
    return;
  }

  const html = render(input.body, input.action);
  const text = input.action
    ? `${input.body}\n\n${input.action.label}: ${site.url}${input.action.path}`
    : input.body;

  for (const recipient of recipients) {
    try {
      await transporter().sendMail({
        from: process.env.SMTP_FROM,
        to: recipient,
        subject: input.subject,
        text,
        html,
      });
      await record(input, recipient, "sent");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[notify] failed to send to ${recipient}:`, message);
      await record(input, recipient, "failed", message);
    }
  }
}

/**
 * Fire-and-forget wrapper.
 *
 * Server actions await their database work but must not wait on an SMTP
 * handshake — a slow mail server would otherwise add seconds to a form
 * submission. The promise is deliberately not returned; `notify` already
 * swallows and logs its own failures, so nothing can reject unhandled.
 */
function notifyInBackground(input: SendInput): void {
  void notify(input);
}

// --- the events themselves -------------------------------------------------

export function notifyWebsiteEnquiry(lead: {
  id: string;
  reference: string;
  name: string;
  mobile: string;
  email: string | null;
  message: string | null;
  propertyName?: string | null;
}) {
  const lines = [
    `A new enquiry has come in from the website.`,
    ``,
    `Name: ${lead.name}`,
    `Mobile: ${lead.mobile}`,
    lead.email ? `Email: ${lead.email}` : null,
    lead.propertyName ? `Property: ${lead.propertyName}` : null,
    lead.message ? `\nMessage:\n${lead.message}` : null,
    ``,
    `Reference ${lead.reference}. Nobody is assigned to it yet.`,
  ].filter((line) => line !== null);

  notifyInBackground({
    event: "lead.website_enquiry",
    to: teamRecipients(),
    subject: lead.propertyName
      ? `New enquiry — ${lead.propertyName} (${lead.name})`
      : `New website enquiry — ${lead.name}`,
    body: lines.join("\n"),
    action: { label: "Open the lead", path: `/admin/leads/${lead.id}` },
    entity: "lead",
    entityId: lead.id,
  });
}

export function notifyLeadAssigned(input: {
  leadId: string;
  reference: string;
  leadName: string;
  mobile: string;
  assigneeEmail: string;
  assigneeName: string;
  assignedByName: string;
}) {
  notifyInBackground({
    event: "lead.assigned",
    to: input.assigneeEmail,
    subject: `Lead assigned to you — ${input.leadName}`,
    body: [
      `${input.assignedByName} has assigned a lead to you.`,
      ``,
      `Name: ${input.leadName}`,
      `Mobile: ${input.mobile}`,
      `Reference: ${input.reference}`,
    ].join("\n"),
    action: { label: "Open the lead", path: `/admin/leads/${input.leadId}` },
    entity: "lead",
    entityId: input.leadId,
  });
}

/** Used by the Settings page to prove the configuration works. */
export async function sendTestEmail(to: string) {
  await notify({
    event: "system.test",
    to,
    subject: "Living admin — test email",
    body: [
      `This is a test from the Living admin system.`,
      ``,
      `If you're reading it, SMTP is configured correctly and notifications will reach you.`,
    ].join("\n"),
    action: { label: "Open the admin", path: "/admin" },
    entity: "system",
  });
}
