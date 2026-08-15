"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, whatsappSessions } from "@/lib/db/schema";
import { fail, requireUser, succeed, assertAdmin, type ActionResult } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import {
  SUBSCRIBED_EVENTS,
  isWhatsAppEnabled,
  openWAConfig,
} from "@/lib/integrations/whatsapp/config";
import { normalisePhone } from "@/lib/integrations/whatsapp/phone";
import {
  currentSessionRow,
  retryFailedOutbound,
  sendText,
  whatsappProvider,
} from "@/lib/integrations/whatsapp/service";
import {
  WhatsAppIntegrationHealthService,
  describeHealth,
} from "@/lib/integrations/whatsapp/health";
import { SCOPEABLE_INTENTS } from "@/lib/crm/whatsapp/registry";

// Admin-only maintenance for the integration. Every action re-derives the actor
// from the session cookie; nothing here reads a role out of the form (§40).

async function adminActor() {
  const user = await requireUser();
  assertAdmin(user);
  return user;
}

/** §45. Reachability, key validity and session state, in one round trip. */
export async function testConnection(): Promise<ActionResult<{ lines: string[] }>> {
  await adminActor();
  if (!isWhatsAppEnabled()) return fail("The integration is not configured.");

  // The session row exists so the page has something to show even before the
  // first webhook arrives; the health service updates it in place.
  await currentSessionRow();

  const health = await WhatsAppIntegrationHealthService.check();
  const lines = describeHealth(health);

  // The webhook registration is a separate question from session health, so it
  // is appended rather than folded into the status.
  if (health.status !== "error") {
    try {
      const expected = openWAConfig().webhookUrl;
      const registered = (await whatsappProvider().listWebhooks()).find(
        (hook) => hook.url === expected,
      );
      lines.push(
        registered
          ? `Webhook registered for ${registered.events.join(", ") || "default events"}.`
          : `No webhook registered for ${expected || "the configured URL"}.`,
      );
    } catch {
      lines.push("Could not read the webhook registrations.");
    }
  }

  revalidatePath("/admin/settings/integrations/whatsapp");
  // A failed check is reported as a failure, never dressed up as a success.
  return health.status === "error" ? fail(lines.join(" ")) : succeed({ lines });
}

/** §42. Creates the webhook if it isn't already there; never a second one. */
export async function configureWebhook(): Promise<ActionResult<{ message: string }>> {
  const actor = await adminActor();
  if (!isWhatsAppEnabled()) return fail("The integration is not configured.");

  const config = openWAConfig();
  if (!config.webhookUrl) return fail("OPENWA_WEBHOOK_URL is not set.");
  if (!config.webhookSecret) {
    return fail("OPENWA_WEBHOOK_SECRET is not set — an unsigned webhook is refused on arrival.");
  }

  try {
    const registration = await whatsappProvider().configureWebhook(
      config.webhookUrl,
      [...SUBSCRIBED_EVENTS],
      config.webhookSecret,
    );

    const row = await currentSessionRow();
    await db()
      .update(whatsappSessions)
      .set({ webhookConfiguredAt: new Date() })
      .where(eq(whatsappSessions.id, row.id));

    await audit({
      actorId: actor.id,
      action: "whatsapp.webhook_configured",
      entity: "whatsapp_session",
      entityId: row.id,
      after: { url: registration.url, events: registration.events },
    });

    revalidatePath("/admin/settings/integrations/whatsapp");
    return succeed({ message: `Webhook pointing at ${registration.url}.` });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

/**
 * §46. A test message to one authorised employee — not to an arbitrary number.
 * Restricting the recipient to staff is what keeps this from being a one-field
 * bulk sender.
 */
export async function sendTestMessage(
  _prev: ActionResult<{ message: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ message: string }>> {
  const actor = await adminActor();

  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const typedNumber = String(formData.get("testNumber") ?? "").trim();

  if (!employeeId && !typedNumber) {
    return fail("Choose an employee, or type an authorised number.");
  }

  // Either route ends at the same allowlist. A typed number is matched against
  // the staff who have WhatsApp access — never sent to blind, which is what
  // keeps this from being a one-field bulk sender.
  const staff = await db()
    .select({
      id: users.id,
      fullName: users.fullName,
      mobile: users.mobile,
      whatsappNumber: users.whatsappNumber,
      whatsappEnabled: users.whatsappEnabled,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.isActive, true));

  let employee;
  if (employeeId) {
    employee = staff.find((row) => row.id === employeeId);
    if (!employee) return fail("Choose an employee.");
  } else {
    const wanted = normalisePhone(typedNumber);
    if (!wanted) return fail("That doesn't look like a phone number.");
    employee = staff.find((row) => {
      const theirs = normalisePhone(row.whatsappNumber ?? row.mobile);
      return theirs?.nationalDigits === wanted.nationalDigits;
    });
    if (!employee) {
      // Deliberately does not say whether the number is unknown or merely
      // unauthorised — this field must not become a way to probe the staff list.
      return fail(
        "That number isn't an authorised employee with WhatsApp access enabled.",
      );
    }
  }

  if (!employee.isActive || !employee.whatsappEnabled) {
    return fail(`${employee.fullName} does not have WhatsApp access enabled.`);
  }

  const phone = normalisePhone(employee.whatsappNumber ?? employee.mobile);
  if (!phone) return fail(`${employee.fullName} has no usable WhatsApp number on file.`);

  const result = await sendText({
    to: phone.phoneNumber,
    text: "Living CRM WhatsApp integration test successful.",
  });

  await audit({
    actorId: actor.id,
    action: "whatsapp.test_message",
    entity: "user",
    entityId: employee.id,
    after: { ok: result.ok },
  });

  revalidatePath("/admin/settings/integrations/whatsapp");
  // §40: a send that failed says so.
  return result.ok
    ? succeed({ message: `Sent to ${employee.fullName}.` })
    : fail(`Could not send: ${result.error}`);
}

/** §48/§49. Drains outbound messages that failed while the gateway was down. */
export async function retryOutbound(): Promise<ActionResult<{ message: string }>> {
  await adminActor();
  const { retried, sent } = await retryFailedOutbound(25);
  revalidatePath("/admin/settings/integrations/whatsapp");
  return succeed({
    message:
      retried === 0
        ? "Nothing waiting to be resent."
        : `Retried ${retried}, ${sent} sent.`,
  });
}

/** §13. Turning CRM-over-WhatsApp on or off for one employee. */
export async function setEmployeeWhatsApp(
  _prev: ActionResult<{ message: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ message: string }>> {
  const actor = await adminActor();

  const employeeId = String(formData.get("employeeId") ?? "");
  // §1/§2: reachability and authority are separate switches. CRM access
  // without WhatsApp being enabled at all is meaningless, so it is clamped.
  const enabled = formData.get("enabled") === "on";
  const crmEnabled = enabled && formData.get("crmEnabled") === "on";
  const rawNumber = String(formData.get("whatsappNumber") ?? "").trim();

  // §13. Only intents the registry actually knows can be stored, so a hand-
  // edited form cannot park an unknown string in the column. An empty list
  // means "role and permissions decide", which is the usual case.
  const known = new Set(SCOPEABLE_INTENTS.map((entry) => entry.intent as string));
  const scope = formData
    .getAll("scope")
    .map(String)
    .filter((intent) => known.has(intent));

  const [employee] = await db()
    .select({ id: users.id, fullName: users.fullName, mobile: users.mobile })
    .from(users)
    .where(eq(users.id, employeeId))
    .limit(1);
  if (!employee) return fail("That employee no longer exists.");

  const phone = rawNumber ? normalisePhone(rawNumber) : null;
  if (rawNumber && !phone) return fail("That doesn't look like a phone number.");

  // Enabling with no number anywhere would be a switch that does nothing.
  if (enabled && !phone && !normalisePhone(employee.mobile)) {
    return fail(`${employee.fullName} needs a WhatsApp number before access can be enabled.`);
  }

  await db()
    .update(users)
    .set({
      whatsappEnabled: enabled,
      whatsappCrmEnabled: crmEnabled,
      whatsappNumber: phone?.phoneNumber ?? null,
      whatsappScope: scope,
    })
    .where(eq(users.id, employeeId));

  await audit({
    actorId: actor.id,
    action: enabled ? "whatsapp.access_granted" : "whatsapp.access_revoked",
    entity: "user",
    entityId: employeeId,
    after: { enabled, crmEnabled, scope },
  });

  revalidatePath("/admin/settings/integrations/whatsapp");
  return succeed({
    message: `${employee.fullName}: WhatsApp ${enabled ? "on" : "off"}, CRM commands ${crmEnabled ? "on" : "off"}.`,
  });
}
