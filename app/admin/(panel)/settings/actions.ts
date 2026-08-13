"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  expenseCategories,
  leadSources,
  leadTypes,
  notifications,
} from "@/lib/db/schema";
import {
  assertAdmin,
  fail,
  requireUser,
  succeed,
  type ActionResult,
} from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/ids";
import { hasSmtp, sendTestEmail } from "@/lib/notify";

async function requireAdminActor() {
  const user = await requireUser();
  assertAdmin(user);
  return user;
}

const entrySchema = z.object({
  label: z.string().trim().min(2, "Give it a name.").max(60),
  kind: z.enum(["type", "source", "expense_category"]),
});

// All three taxonomies have the same shape (key, label, sortOrder, isActive),
// so one pair of actions drives lead types, lead sources and expense
// categories rather than three near-identical copies.
const TAXONOMY_TABLES = {
  type: leadTypes,
  source: leadSources,
  expense_category: expenseCategories,
} as const;

export type TaxonomyKind = keyof typeof TAXONOMY_TABLES;

/** §17 / §20 — admins add lead types and sources without a deploy. */
export async function addTaxonomy(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const actor = await requireAdminActor();
  const parsed = entrySchema.safeParse({
    label: formData.get("label"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) return fail("Give it a name.");

  const { label, kind } = parsed.data;
  const key = slugify(label);
  if (!key) return fail("That name can't be used.");

  const table = TAXONOMY_TABLES[kind];

  // Re-adding a deactivated entry reactivates it rather than failing on the
  // primary key — the admin's intent is the same either way.
  await db()
    .insert(table)
    .values({ key, label, isActive: true, sortOrder: 100 })
    .onConflictDoUpdate({
      target: table.key,
      set: { label, isActive: true },
    });

  await audit({
    actorId: actor.id,
    action: `settings.${kind}_added`,
    entity: "lead_taxonomy",
    entityId: key,
    after: { label },
  });

  revalidatePath("/admin/settings");
  return succeed(null);
}

export async function toggleTaxonomy(
  kind: TaxonomyKind,
  key: string,
  isActive: boolean,
): Promise<ActionResult<null>> {
  const actor = await requireAdminActor();
  const table = TAXONOMY_TABLES[kind];

  // Deactivated, never deleted: existing leads still point at this key, and
  // dropping the row would strip their history (Rule 12).
  await db().update(table).set({ isActive }).where(eq(table.key, key));

  await audit({
    actorId: actor.id,
    action: `settings.${kind}_${isActive ? "enabled" : "disabled"}`,
    entity: "lead_taxonomy",
    entityId: key,
  });

  revalidatePath("/admin/settings");
  return succeed(null);
}

/**
 * Proves the SMTP configuration works, from the admin UI, without waiting for
 * a real lead to arrive. Reports what actually happened rather than assuming
 * success: notify() swallows delivery errors, so the outcome is read back from
 * the notification log.
 */
export async function sendTestNotification(
  _prev: ActionResult<{ message: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ message: string }>> {
  const actor = await requireAdminActor();

  const parsed = z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .safeParse(formData.get("email"));
  if (!parsed.success) return fail("Enter a valid email address.");

  if (!hasSmtp()) {
    return fail(
      "SMTP isn't configured. Set SMTP_HOST and SMTP_FROM in .env.local, then restart.",
    );
  }

  await sendTestEmail(parsed.data);

  const [result] = await db()
    .select({ status: notifications.status, error: notifications.error })
    .from(notifications)
    .where(eq(notifications.event, "system.test"))
    .orderBy(desc(notifications.createdAt))
    .limit(1);

  await audit({
    actorId: actor.id,
    action: "settings.test_email",
    entity: "system",
    after: { to: parsed.data, status: result?.status ?? "unknown" },
  });

  revalidatePath("/admin/settings");

  if (result?.status === "sent") {
    return succeed({ message: `Sent to ${parsed.data}. Check the inbox.` });
  }
  return fail(result?.error ?? "The email could not be sent.");
}
