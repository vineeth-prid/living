import { and, eq, isNull, sql, type AnyColumn } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, users } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/session";

// §12/§14. The single place a WhatsApp number becomes — or fails to become — an
// identity the CRM will act for.
//
// The rule this file exists to enforce: appearing in `users.mobile` is not
// authorisation. An admin has to turn WhatsApp CRM access on for that employee
// explicitly, or adding an employee record would silently hand them a command
// channel that bypasses the login page.

export type WhatsAppSender =
  | {
      kind: "employee";
      user: SessionUser;
      scope: string[];
      /**
       * §2. Being recognised as staff is not the same as being allowed to
       * drive the CRM. Someone can be reachable for notifications with this
       * false — they simply cannot command anything.
       */
      canRunCommands: boolean;
    }
  | { kind: "customer"; leadId: string; name: string }
  | { kind: "unknown" };

/**
 * Matched on the last ten digits, which is how the CRM has always compared
 * numbers (lib/leads.ts normaliseMobile) — a lead saved as "+91 98765 43210"
 * and a WhatsApp id of 919876543210 have to be the same person.
 */
const lastTen = (column: AnyColumn) =>
  sql`right(regexp_replace(coalesce(${column}, ''), '\\D', '', 'g'), 10)`;

/**
 * Resolves an inbound number to what it is allowed to be.
 *
 * Employee wins over customer: if a member of staff is also in the leads table,
 * their message is a command, not an enquiry.
 */
export async function resolveSender(nationalDigits: string): Promise<WhatsAppSender> {
  if (nationalDigits.length < 10) return { kind: "unknown" };

  const [employee] = await db()
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      permissions: users.permissions,
      mustChangePassword: users.mustChangePassword,
      isActive: users.isActive,
      whatsappEnabled: users.whatsappEnabled,
      whatsappCrmEnabled: users.whatsappCrmEnabled,
      whatsappScope: users.whatsappScope,
    })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        eq(users.whatsappEnabled, true),
        // Either the dedicated WhatsApp number or, when that is blank, the
        // employee's mobile.
        sql`${lastTen(users.whatsappNumber)} = ${nationalDigits} or (${users.whatsappNumber} is null and ${lastTen(users.mobile)} = ${nationalDigits})`,
      ),
    )
    .limit(1);

  if (employee) {
    // A temporary password is still a password that has not been changed. An
    // account in that state cannot drive the CRM from a channel with no login
    // screen to redirect it to.
    if (employee.mustChangePassword) return { kind: "unknown" };

    await db()
      .update(users)
      .set({ whatsappLastSeenAt: new Date() })
      .where(eq(users.id, employee.id));

    return {
      kind: "employee",
      // §13. Empty means "role and permissions decide"; a list narrows.
      scope: employee.whatsappScope ?? [],
      canRunCommands: employee.whatsappCrmEnabled,
      user: {
        id: employee.id,
        fullName: employee.fullName,
        email: employee.email,
        role: employee.role,
        permissions: employee.permissions,
        mustChangePassword: employee.mustChangePassword,
      },
    };
  }

  const [lead] = await db()
    .select({ id: leads.id, name: leads.name })
    .from(leads)
    .where(
      and(isNull(leads.deletedAt), sql`${lastTen(leads.mobile)} = ${nationalDigits}`),
    )
    .limit(1);

  if (lead) return { kind: "customer", leadId: lead.id, name: lead.name };

  return { kind: "unknown" };
}
