// §1. None of these names carry NEXT_PUBLIC_, which is the actual guarantee:
// Next only inlines prefixed variables into client bundles, so reading
// OPENWA_API_KEY from a client component yields undefined rather than the key.
//
// No `import "server-only"` here on purpose — it is not an installed dependency
// (it would resolve through a Next-internal alias that the check scripts, which
// run under tsx, do not have).

export type OpenWAConfig = {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
  webhookUrl: string;
  webhookSecret: string;
  timeoutMs: number;
  maxRetries: number;
};

/**
 * Configuration is optional everywhere. An unconfigured integration is a
 * disabled integration, never a crash — the CRM has to run on a laptop with no
 * WhatsApp at all, exactly as it already does with no SMTP and no MinIO.
 */
export function isWhatsAppEnabled(): boolean {
  return (
    process.env.OPENWA_ENABLED === "true" &&
    Boolean(process.env.OPENWA_BASE_URL) &&
    Boolean(process.env.OPENWA_API_KEY) &&
    Boolean(process.env.OPENWA_SESSION_ID)
  );
}

/** Reasons the integration is off, for the admin page to show plainly. */
export function whatsappConfigProblems(): string[] {
  const problems: string[] = [];
  if (process.env.OPENWA_ENABLED !== "true") {
    problems.push("OPENWA_ENABLED is not set to true.");
  }
  for (const key of [
    "OPENWA_BASE_URL",
    "OPENWA_API_KEY",
    "OPENWA_SESSION_ID",
    "OPENWA_WEBHOOK_SECRET",
  ]) {
    if (!process.env[key]) problems.push(`${key} is not set.`);
  }
  const secret = process.env.OPENWA_WEBHOOK_SECRET;
  // A short secret is worse than none: it looks configured.
  if (secret && secret.length < 32) {
    problems.push("OPENWA_WEBHOOK_SECRET is shorter than 32 characters.");
  }
  return problems;
}

export function openWAConfig(): OpenWAConfig {
  const baseUrl = process.env.OPENWA_BASE_URL;
  const apiKey = process.env.OPENWA_API_KEY;
  const sessionId = process.env.OPENWA_SESSION_ID;

  if (!baseUrl || !apiKey || !sessionId) {
    throw new Error(
      "OpenWA is not configured. Set OPENWA_BASE_URL, OPENWA_API_KEY and OPENWA_SESSION_ID.",
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    sessionId,
    webhookUrl: process.env.OPENWA_WEBHOOK_URL ?? "",
    webhookSecret: process.env.OPENWA_WEBHOOK_SECRET ?? "",
    timeoutMs: Number(process.env.OPENWA_TIMEOUT_MS ?? 10_000),
    maxRetries: Number(process.env.OPENWA_MAX_RETRIES ?? 3),
  };
}

/** Events Living asks OpenWA to deliver. Anything else is ignored on arrival. */
export const SUBSCRIBED_EVENTS = [
  "message.received",
  "message.ack",
  "session.status",
] as const;

/**
 * Outbound rate limit (§47/§68). Unofficial gateways get numbers banned for
 * looking like bulk senders, so this is a hard ceiling on the whole process,
 * not a per-recipient one.
 */
export const OUTBOUND_RATE = {
  perMinute: Number(process.env.WHATSAPP_MAX_PER_MINUTE ?? 20),
  minGapMs: Number(process.env.WHATSAPP_MIN_GAP_MS ?? 1_200),
} as const;

/**
 * Confidence bands (§35). Configuration, not gospel — they will need tuning
 * against a real model on real messages.
 */
export const CONFIDENCE = {
  execute: Number(process.env.WHATSAPP_CONFIDENCE_EXECUTE ?? 0.9),
  confirm: Number(process.env.WHATSAPP_CONFIDENCE_CONFIRM ?? 0.7),
} as const;

/** How long a pending confirmation or clarification stays answerable (§57). */
export const PENDING_COMMAND_TTL_MS = Number(
  process.env.WHATSAPP_PENDING_TTL_MS ?? 15 * 60 * 1000,
);

/** Living's operating timezone — every relative date resolves against it (§26). */
export const CRM_TIMEZONE = process.env.CRM_TIMEZONE ?? "Asia/Kolkata";
