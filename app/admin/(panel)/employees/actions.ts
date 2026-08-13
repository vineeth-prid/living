"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ROLES } from "@/lib/db/schema";
import { generatePassword, hashPassword } from "@/lib/auth/password";
import { destroyUserSessions } from "@/lib/auth/session";
import {
  ForbiddenError,
  fail,
  requireUser,
  succeed,
  type ActionResult,
} from "@/lib/auth/dal";
import { audit, changedFields } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { PERMISSIONS } from "@/lib/auth/dal";

// Every action re-derives the actor from the session cookie. Nothing here reads
// an actor id, role or permission out of the submitted form (§40).
async function requireAdminActor() {
  const user = await requireUser();
  if (user.role !== "admin") throw new ForbiddenError();
  return user;
}

const GRANTABLE = [
  PERMISSIONS.propertyPublish,
  PERMISSIONS.propertyFinalPrice,
] as const;

const employeeSchema = z.object({
  fullName: z.string().trim().min(2, "Name is required."),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  mobile: z
    .string()
    .trim()
    .regex(/^[+0-9 ()-]{7,20}$/, "Enter a valid phone number.")
    .optional()
    .or(z.literal("")),
  role: z.enum(ROLES),
  department: z.string().trim().optional(),
  employeeCode: z.string().trim().optional(),
  joinedAt: z.string().optional(),
  permissions: z.array(z.enum(GRANTABLE)).default([]),
});

function parseForm(formData: FormData) {
  return employeeSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    mobile: formData.get("mobile") ?? "",
    role: formData.get("role"),
    department: formData.get("department") ?? "",
    employeeCode: formData.get("employeeCode") ?? "",
    joinedAt: formData.get("joinedAt") ?? "",
    permissions: formData.getAll("permissions") as string[],
  });
}

export async function createEmployee(
  _prev: ActionResult<{ password: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ password: string }>> {
  const actor = await requireAdminActor();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return fail("Check the form.", z.flattenError(parsed.error).fieldErrors);
  }
  const input = parsed.data;

  const [existing] = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing) return fail("An account with that email already exists.");

  // Admins hold every permission implicitly; storing grants on them would be
  // misleading when the role is later downgraded.
  const permissions = input.role === "admin" ? [] : input.permissions;
  const password = generatePassword();
  const id = newId();

  await db()
    .insert(users)
    .values({
      id,
      fullName: input.fullName,
      email: input.email,
      mobile: input.mobile || null,
      role: input.role,
      department: input.department || null,
      employeeCode: input.employeeCode || null,
      permissions,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      joinedAt: input.joinedAt ? new Date(input.joinedAt) : null,
    });

  await audit({
    actorId: actor.id,
    action: "employee.created",
    entity: "user",
    entityId: id,
    after: { email: input.email, role: input.role, permissions },
  });

  revalidatePath("/admin/employees");
  // Returned once, to be read aloud/copied. Never stored in plain text.
  return succeed({ password });
}

export async function updateEmployee(
  id: string,
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const actor = await requireAdminActor();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return fail("Check the form.", z.flattenError(parsed.error).fieldErrors);
  }
  const input = parsed.data;

  const [before] = await db().select().from(users).where(eq(users.id, id)).limit(1);
  if (!before) return fail("That employee no longer exists.");

  const [clash] = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (clash && clash.id !== id) {
    return fail("Another account already uses that email.");
  }

  // An admin demoting themselves would lock the panel's last door behind them.
  if (id === actor.id && input.role !== "admin") {
    return fail("You can't remove your own administrator access.");
  }

  const permissions = input.role === "admin" ? [] : input.permissions;

  await db()
    .update(users)
    .set({
      fullName: input.fullName,
      email: input.email,
      mobile: input.mobile || null,
      role: input.role,
      department: input.department || null,
      employeeCode: input.employeeCode || null,
      permissions,
      joinedAt: input.joinedAt ? new Date(input.joinedAt) : null,
      updatedAt: sql`now()`,
    })
    .where(eq(users.id, id));

  // A role or permission change must not wait for a 12-hour session to lapse.
  if (before.role !== input.role) await destroyUserSessions(id);

  const diff = changedFields(before as Record<string, unknown>, {
    fullName: input.fullName,
    email: input.email,
    role: input.role,
  });
  await audit({
    actorId: actor.id,
    action: "employee.updated",
    entity: "user",
    entityId: id,
    before: diff.before,
    after: diff.after,
  });

  revalidatePath("/admin/employees");
  return succeed(null);
}

export async function setEmployeeActive(id: string, isActive: boolean) {
  const actor = await requireAdminActor();
  if (id === actor.id && !isActive) {
    throw new ForbiddenError("You can't deactivate your own account.");
  }

  await db()
    .update(users)
    .set({ isActive, updatedAt: sql`now()` })
    .where(eq(users.id, id));

  // Deactivation has to take effect now, not at session expiry.
  if (!isActive) await destroyUserSessions(id);

  await audit({
    actorId: actor.id,
    action: isActive ? "employee.activated" : "employee.deactivated",
    entity: "user",
    entityId: id,
  });
  revalidatePath("/admin/employees");
}

export async function resetEmployeePassword(id: string): Promise<string> {
  const actor = await requireAdminActor();
  const password = generatePassword();

  await db()
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: sql`now()`,
    })
    .where(eq(users.id, id));

  await destroyUserSessions(id);
  await audit({
    actorId: actor.id,
    action: "employee.password_reset",
    entity: "user",
    entityId: id,
  });
  revalidatePath("/admin/employees");
  return password;
}
