"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, readSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  // One generic message for bad email, bad password, unknown account and
  // deactivated account alike — anything more specific enumerates users.
  const GENERIC = "Email or password is incorrect.";
  if (!parsed.success) return { error: GENERIC };

  const { email, password, next } = parsed.data;

  const [user] = await db()
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    // Burn comparable time on unknown emails so response timing doesn't reveal
    // which addresses exist.
    await hashPassword(password);
    return { error: GENERIC };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { error: `Too many attempts. Try again in ${mins} minute(s).` };
  }

  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    const attempts = user.failedLoginCount + 1;
    await db()
      .update(users)
      .set({
        failedLoginCount: attempts,
        lockedUntil:
          attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null,
      })
      .where(eq(users.id, user.id));
    await audit({
      actorId: user.id,
      action: "auth.login_failed",
      entity: "user",
      entityId: user.id,
    });
    return { error: GENERIC };
  }

  if (!user.isActive) return { error: GENERIC };

  await db()
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  await createSession(user.id);
  await audit({
    actorId: user.id,
    action: "auth.login",
    entity: "user",
    entityId: user.id,
  });

  // Only ever redirect to an in-app path — an absolute URL here would make the
  // login form an open redirect.
  const target =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
  redirect(target);
}

export async function logout() {
  const user = await readSession();
  await destroySession();
  if (user) {
    await audit({
      actorId: user.id,
      action: "auth.logout",
      entity: "user",
      entityId: user.id,
    });
  }
  redirect("/admin/login");
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    password: z.string().min(10, "Use at least 10 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match.",
    path: ["confirm"],
  });

export async function changePassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const user = await readSession();
  if (!user) redirect("/admin/login");

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const [row] = await db()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!row || !(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
    return { error: "Current password is incorrect." };
  }

  await db()
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: false,
      updatedAt: sql`now()`,
    })
    .where(eq(users.id, user.id));

  await audit({
    actorId: user.id,
    action: "auth.password_changed",
    entity: "user",
    entityId: user.id,
  });

  redirect("/admin");
}
