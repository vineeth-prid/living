import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { SESSION_COOKIE } from "./constants";

export { SESSION_COOKIE };

const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12h — a working day, then re-auth.

// The cookie carries a raw 32-byte token; only this digest is stored. A dump of
// the sessions table therefore can't be replayed as a login. SHA-256 without a
// salt is right here (unlike passwords): the input is already 256 bits of
// entropy, so there is nothing to brute-force.
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "employee";
  permissions: string[];
  mustChangePassword: boolean;
};

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MAX_AGE_MS);
  const h = await headers();

  await db().insert(sessions).values({
    id: newId(),
    tokenHash: digest(token),
    userId,
    expiresAt,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Lax, not Strict: Strict drops the cookie on the redirect back from an
    // external link into /admin, which reads as a random logout.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  // Opportunistic GC — no cron needed for a table this small.
  await db().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/**
 * Resolves the caller from the session cookie, or null.
 *
 * Hits the database every call rather than trusting a signed cookie payload, so
 * deactivating an employee or deleting a session logs them out immediately.
 * Callers memoise via React `cache` in the DAL.
 */
export async function readSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db()
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      permissions: users.permissions,
      mustChangePassword: users.mustChangePassword,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, digest(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;

  const { isActive: _isActive, ...user } = row;
  return user;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db().delete(sessions).where(eq(sessions.tokenHash, digest(token)));
  }
  store.delete(SESSION_COOKIE);
}

/** Drops every session for a user — used on deactivate, role change and reset. */
export async function destroyUserSessions(userId: string) {
  await db().delete(sessions).where(eq(sessions.userId, userId));
}
