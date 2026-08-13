"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { leadSources, leadTypes } from "@/lib/db/schema";
import {
  assertAdmin,
  fail,
  requireUser,
  succeed,
  type ActionResult,
} from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/ids";

async function requireAdminActor() {
  const user = await requireUser();
  assertAdmin(user);
  return user;
}

const entrySchema = z.object({
  label: z.string().trim().min(2, "Give it a name.").max(60),
  kind: z.enum(["type", "source"]),
});

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

  const table = kind === "type" ? leadTypes : leadSources;

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
  kind: "type" | "source",
  key: string,
  isActive: boolean,
): Promise<ActionResult<null>> {
  const actor = await requireAdminActor();
  const table = kind === "type" ? leadTypes : leadSources;

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
