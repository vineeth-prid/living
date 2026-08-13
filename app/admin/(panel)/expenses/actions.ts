"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { PAYMENT_METHODS, expenses } from "@/lib/db/schema";
import {
  assertAdmin,
  fail,
  requireUser,
  succeed,
  type ActionResult,
} from "@/lib/auth/dal";
import { audit, changedFields } from "@/lib/audit";
import { newId, nextReference } from "@/lib/ids";
import { latestExpenseReference, toMinor } from "@/lib/expenses";
import { deleteObject, uploadObject, validateUpload } from "@/lib/storage";

// Admin-only, every action. The expense ledger has no employee-facing surface,
// so the guard is a flat assertAdmin rather than a permission check.
async function requireAdminActor() {
  const user = await requireUser();
  assertAdmin(user);
  return user;
}

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

const expenseSchema = z.object({
  description: z.string().trim().min(3, "Say what this was for.").max(500),
  // Parsed from a string so "12,500.50" and "" behave predictably.
  amount: z
    .string()
    .trim()
    .min(1, "Enter an amount.")
    .transform((v) => Number(v.replace(/,/g, "")))
    .refine((v) => Number.isFinite(v), "Enter a valid amount.")
    .refine((v) => v > 0, "An expense has to be more than zero.")
    .refine((v) => v < 1_000_000_000, "That looks too large — check the figure."),
  tax: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(/,/g, "")) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 0),
      "Enter a valid tax amount.",
    ),
  spentAt: z.string().min(1, "Pick a date."),
  categoryKey: optionalText,
  vendor: optionalText,
  paymentMethod: z
    .enum(PAYMENT_METHODS)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  invoiceNumber: optionalText,
  notes: optionalText,
  propertyId: optionalText,
  leadId: optionalText,
});

function parse(formData: FormData) {
  return expenseSchema.safeParse(Object.fromEntries(formData));
}

async function saveReceipt(formData: FormData): Promise<string | null> {
  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) return null;

  const error = validateUpload(file, "document");
  if (error) throw new Error(error);

  // Under /images/ like all other uploads, so the optimizer's allowlist in
  // next.config.ts covers image receipts as well as PDFs.
  return uploadObject(file, "images/receipts");
}

export async function createExpense(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdminActor();

  const parsed = parse(formData);
  if (!parsed.success) {
    return fail("Check the form.", z.flattenError(parsed.error).fieldErrors);
  }
  const input = parsed.data;

  const spentAt = new Date(input.spentAt);
  if (Number.isNaN(spentAt.getTime())) return fail("That date isn't valid.");

  let receiptKey: string | null = null;
  try {
    receiptKey = await saveReceipt(formData);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Receipt upload failed.",
    );
  }

  const id = newId();
  const reference = nextReference("EXP", await latestExpenseReference());

  await db()
    .insert(expenses)
    .values({
      id,
      reference,
      amountMinor: toMinor(input.amount),
      taxMinor: input.tax === null ? null : toMinor(input.tax),
      currency: "INR",
      spentAt,
      categoryKey: input.categoryKey,
      vendor: input.vendor,
      description: input.description,
      paymentMethod: input.paymentMethod,
      invoiceNumber: input.invoiceNumber,
      notes: input.notes,
      propertyId: input.propertyId,
      leadId: input.leadId,
      receiptKey,
      createdById: actor.id,
    });

  await audit({
    actorId: actor.id,
    action: "expense.created",
    entity: "expense",
    entityId: id,
    after: {
      reference,
      amountMinor: toMinor(input.amount),
      description: input.description,
    },
  });

  revalidatePath("/admin/expenses");
  if (input.propertyId) revalidatePath(`/admin/properties/${input.propertyId}`);
  return succeed({ id });
}

export async function createExpenseAndReturn(
  prev: ActionResult<{ id: string }> | null,
  formData: FormData,
) {
  const result = await createExpense(prev, formData);
  if (result.ok) redirect("/admin/expenses?created=1");
  return result;
}

export async function updateExpense(
  id: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdminActor();

  const parsed = parse(formData);
  if (!parsed.success) {
    return fail("Check the form.", z.flattenError(parsed.error).fieldErrors);
  }
  const input = parsed.data;

  const [before] = await db()
    .select()
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);
  if (!before) return fail("That expense no longer exists.");

  const spentAt = new Date(input.spentAt);
  if (Number.isNaN(spentAt.getTime())) return fail("That date isn't valid.");

  let receiptKey = before.receiptKey;
  try {
    const uploaded = await saveReceipt(formData);
    if (uploaded) {
      // Replace, don't accumulate: the old object would otherwise linger in
      // the bucket with nothing pointing at it.
      if (before.receiptKey) await deleteObject(before.receiptKey);
      receiptKey = uploaded;
    }
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Receipt upload failed.",
    );
  }

  await db()
    .update(expenses)
    .set({
      amountMinor: toMinor(input.amount),
      taxMinor: input.tax === null ? null : toMinor(input.tax),
      spentAt,
      categoryKey: input.categoryKey,
      vendor: input.vendor,
      description: input.description,
      paymentMethod: input.paymentMethod,
      invoiceNumber: input.invoiceNumber,
      notes: input.notes,
      propertyId: input.propertyId,
      leadId: input.leadId,
      receiptKey,
      updatedAt: sql`now()`,
    })
    .where(eq(expenses.id, id));

  const diff = changedFields(before as Record<string, unknown>, {
    amountMinor: toMinor(input.amount),
    description: input.description,
    categoryKey: input.categoryKey,
  });
  await audit({
    actorId: actor.id,
    action: "expense.updated",
    entity: "expense",
    entityId: id,
    before: diff.before,
    after: diff.after,
  });

  revalidatePath("/admin/expenses");
  revalidatePath(`/admin/expenses/${id}`);
  if (before.propertyId) {
    revalidatePath(`/admin/properties/${before.propertyId}`);
  }
  if (input.propertyId) revalidatePath(`/admin/properties/${input.propertyId}`);
  return succeed({ id });
}

/** Rule 12 — archived, not destroyed. The receipt object is kept too. */
export async function archiveExpense(id: string): Promise<ActionResult<null>> {
  const actor = await requireAdminActor();

  const [before] = await db()
    .select({ propertyId: expenses.propertyId, reference: expenses.reference })
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);
  if (!before) return fail("That expense no longer exists.");

  await db()
    .update(expenses)
    .set({ deletedAt: new Date(), updatedAt: sql`now()` })
    .where(eq(expenses.id, id));

  await audit({
    actorId: actor.id,
    action: "expense.archived",
    entity: "expense",
    entityId: id,
    before: { reference: before.reference },
  });

  revalidatePath("/admin/expenses");
  if (before.propertyId) {
    revalidatePath(`/admin/properties/${before.propertyId}`);
  }
  return succeed(null);
}
