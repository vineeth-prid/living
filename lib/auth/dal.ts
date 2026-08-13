import { cache } from "react";
import { redirect } from "next/navigation";
import { readSession, type SessionUser } from "./session";

// The Data Access Layer. Every admin page, server action and route handler goes
// through one of these. Nothing authorises off props, route params or hidden
// form fields — §40. Hiding a menu item is presentation; this is enforcement.

export { PERMISSIONS } from "./constants";

/** Memoised per render pass, so one page render is one session query. */
export const getCurrentUser = cache(readSession);

/** Any authenticated, active account. Redirects to the login page otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  // Temporary passwords are handed over verbally or by message, so they get
  // exactly one use. Every page funnels through here, so there's no route that
  // skips the change. (/admin/change-password itself uses getCurrentUser.)
  if (user.mustChangePassword) redirect("/admin/change-password");
  return user;
}

/**
 * Admin-only. An employee who types /admin/dashboard is stopped here, on the
 * server, before the page renders — not by a hidden menu item.
 *
 * ponytail: sends them to an explicit denied page rather than answering 403.
 * Next's `forbidden()` interrupt is still behind the experimental
 * `authInterrupts` flag in 16.3, and an internal panel doesn't need the status
 * code badly enough to run canary config. Swap the redirect for `forbidden()`
 * once it stabilises. Route handlers and actions below still answer a real 403.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/admin/denied");
  return user;
}

export function can(user: SessionUser, permission: string): boolean {
  return user.role === "admin" || user.permissions.includes(permission);
}

/** Admins see every lead; employees only their own and ones they created. */
export const isAdmin = (user: SessionUser) => user.role === "admin";

export class ForbiddenError extends Error {
  constructor(message = "You don't have access to this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function assertAdmin(user: SessionUser) {
  if (user.role !== "admin") throw new ForbiddenError();
}

/**
 * Server-action guard. Actions can't `redirect()` into a 403 shell cleanly, so
 * they return a typed failure the form renders inline.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export const fail = (
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> => ({ ok: false, error, fieldErrors });

export const succeed = <T>(data: T): ActionResult<T> => ({ ok: true, data });
