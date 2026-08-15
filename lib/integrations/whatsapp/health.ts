import { eq } from "drizzle-orm";
import { db, hasDatabase } from "@/lib/db";
import { whatsappSessions, type WhatsAppSessionStatus } from "@/lib/db/schema";
import { isWhatsAppEnabled, openWAConfig, whatsappConfigProblems } from "./config";
import { OpenWAError } from "./openwa/client";
import { whatsappProvider } from "./service";

// §7. One place that answers "is WhatsApp working, and if not, which part?"
//
// The four failures the sprint asks about are genuinely different and are told
// apart rather than collapsed into "down": a wrong key, an unreachable host, a
// session that does not exist, and a session that exists but is not connected
// need four different fixes.

/**
 * `error` is not a session state — it means Living could not find out what the
 * state is. Keeping it out of the stored enum is deliberate: a row in the
 * database should record what the session was last known to be, not the fact
 * that one request failed.
 */
export type WhatsAppHealthStatus = WhatsAppSessionStatus | "error";

export type WhatsAppHealth = {
  status: WhatsAppHealthStatus;
  /** Every OPENWA_* value needed is present. */
  configured: boolean;
  /** The host answered at all. */
  reachable: boolean;
  /** It answered without rejecting the API key. */
  apiKeyValid: boolean;
  /** The configured session id exists on that instance. */
  sessionFound: boolean;
  phoneNumber: string | null;
  displayName: string | null;
  /** Present only when something is wrong; safe to show an admin. */
  error: string | null;
  /** Configuration problems, listed rather than summarised. */
  problems: string[];
  checkedAt: Date;
};

function unconfigured(problems: string[]): WhatsAppHealth {
  return {
    status: "unknown",
    configured: false,
    reachable: false,
    apiKeyValid: false,
    sessionFound: false,
    phoneNumber: null,
    displayName: null,
    error: null,
    problems,
    checkedAt: new Date(),
  };
}

export const WhatsAppIntegrationHealthService = {
  /**
   * Never throws. A health check that crashes when its dependency is down is
   * the one thing it must not do.
   */
  async check(): Promise<WhatsAppHealth> {
    const problems = whatsappConfigProblems();
    if (!isWhatsAppEnabled()) return unconfigured(problems);

    try {
      const info = await whatsappProvider().getSessionStatus();

      // Reaching here means the host answered and accepted the key, and the
      // session id resolved to something. Recording that is bookkeeping: if the
      // write fails, the answer is still "connected" — reporting a healthy
      // gateway as broken because a timestamp could not be saved would be
      // exactly backwards.
      try {
        await recordSuccess(info.status, info.phoneNumber, info.displayName);
      } catch (error) {
        console.error("[whatsapp] could not record session state", error);
      }

      return {
        status: info.status,
        configured: true,
        reachable: true,
        apiKeyValid: true,
        sessionFound: true,
        phoneNumber: info.phoneNumber,
        displayName: info.displayName,
        error: null,
        problems,
        checkedAt: new Date(),
      };
    } catch (error) {
      const status = error instanceof OpenWAError ? error.status : null;
      const message =
        error instanceof Error ? error.message : String(error);

      // 401/403 is a key that was refused; 404 is a session that isn't there;
      // no status at all means the host never answered.
      const rejectedKey = status === 401 || status === 403;
      const missingSession = status === 404;

      return {
        status: "error",
        configured: true,
        reachable: status !== null,
        apiKeyValid: status !== null && !rejectedKey,
        sessionFound: status !== null && !rejectedKey && !missingSession,
        phoneNumber: null,
        displayName: null,
        error: message,
        problems,
        checkedAt: new Date(),
      };
    }
  },
};

/**
 * Records the last time OpenWA answered successfully (§8), and keeps the stored
 * session row in step with what was just observed.
 */
async function recordSuccess(
  status: WhatsAppSessionStatus,
  phoneNumber: string | null,
  displayName: string | null,
) {
  // No database is a supported way to run this app, not a fault — the same
  // stance lib/db takes everywhere else.
  if (!hasDatabase()) return;

  const config = openWAConfig();
  const now = new Date();

  await db()
    .update(whatsappSessions)
    .set({
      status,
      phoneNumber,
      displayName,
      lastApiOkAt: now,
      updatedAt: now,
      // Only ever move these forward, and only on a real transition.
      ...(status === "connected" ? { lastConnectedAt: now } : {}),
      ...(status === "disconnected" ? { lastDisconnectedAt: now } : {}),
    })
    .where(eq(whatsappSessions.providerSessionId, config.sessionId));
}

/** Human-readable one-liner for the admin page and the test-connection action. */
export function describeHealth(health: WhatsAppHealth): string[] {
  if (!health.configured) {
    return ["The integration is not configured.", ...health.problems];
  }
  if (health.status === "error") {
    return [
      health.reachable
        ? "OpenWA answered, but the request failed."
        : "OpenWA could not be reached.",
      health.apiKeyValid ? "API key accepted." : "API key was rejected.",
      health.sessionFound
        ? "Session found."
        : "The configured session was not found on that instance.",
      health.error ?? "",
    ].filter(Boolean);
  }
  return [
    "OpenWA reachable and the API key was accepted.",
    `Session status: ${health.status}.`,
    health.phoneNumber ? `Number: +${health.phoneNumber}.` : "Number not reported.",
  ];
}
