import { headers } from "next/headers";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { newId } from "@/lib/ids";

type AuditInput = {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

/**
 * Append an audit row (§37).
 *
 * Deliberately swallows its own errors: an audit write failing must not roll
 * back the business operation that succeeded. It logs loudly instead, which is
 * the trade-off you want for a log that exists to explain history rather than
 * to gate it.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const h = await headers();
    await db()
      .insert(auditLogs)
      .values({
        id: newId(),
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: h.get("user-agent"),
      });
  } catch (error) {
    console.error("[audit] failed to record", input.action, error);
  }
}

/** Only the fields that actually changed, for a readable audit diff. */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (String(before[key] ?? "") !== String(after[key] ?? "")) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}
