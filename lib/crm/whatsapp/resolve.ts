import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, properties } from "@/lib/db/schema";
import { visibleTo } from "@/lib/leads.admin";
import type { SessionUser } from "@/lib/auth/session";

// §55/§56. Turning a name into a row, or refusing to.
//
// The only outcomes are "exactly one" and "not exactly one". There is no
// best-match branch: modifying the wrong lead is the failure this whole file
// exists to prevent, and a near-match is indistinguishable from a wrong match
// once the write has happened.

export type Resolution<T> =
  | { kind: "one"; value: T }
  | { kind: "none" }
  | { kind: "many"; options: { id: string; label: string }[] };

const LIMIT = 5;

/**
 * Leads the employee is actually allowed to touch. `visibleTo` is the same
 * scope filter the leads list uses, so WhatsApp cannot reach a lead the web
 * panel would hide — an employee asking for "Raj" gets their Raj or nothing.
 */
export async function resolveLead(
  user: SessionUser,
  query: { name?: string; reference?: string; mobile?: string },
): Promise<Resolution<{ id: string; name: string; reference: string; status: string }>> {
  const term = query.reference ?? query.name ?? query.mobile;
  if (!term) return { kind: "none" };

  const digits = query.mobile?.replace(/\D/g, "").slice(-10);

  const rows = await db()
    .select({
      id: leads.id,
      name: leads.name,
      reference: leads.reference,
      status: leads.status,
      city: leads.city,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        visibleTo(user),
        or(
          query.reference ? ilike(leads.reference, query.reference) : undefined,
          query.name ? ilike(leads.name, `%${query.name}%`) : undefined,
          digits && digits.length === 10
            ? sql`right(regexp_replace(${leads.mobile}, '\\D', '', 'g'), 10) = ${digits}`
            : undefined,
        ),
      ),
    )
    .limit(LIMIT + 1);

  if (rows.length === 0) return { kind: "none" };
  if (rows.length === 1) return { kind: "one", value: rows[0] };

  return {
    kind: "many",
    options: rows.slice(0, LIMIT).map((row) => ({
      id: row.id,
      label: `${row.reference} — ${row.name}${row.city ? `, ${row.city}` : ""}`,
    })),
  };
}

/**
 * Properties by reference or free text. A bare number is accepted because a
 * reply of "27" to a list of options is how people actually answer.
 */
export async function resolveProperty(query: {
  reference?: string;
  text?: string;
}): Promise<
  Resolution<{
    id: string;
    reference: string | null;
    name: string;
    locality: string;
    city: string;
    type: string;
    askingPrice: number | null;
    priceLabel: string;
    workflowStatus: string;
    isPublic: boolean;
    listingType: string;
    summary: string;
  }>
> {
  const raw = (query.reference ?? query.text ?? "").trim();
  if (!raw) return { kind: "none" };

  // "LIV-0027", "liv 27" and "27" all mean the same listing.
  const digits = raw.match(/(\d{1,6})\s*$/)?.[1];
  const reference = digits ? `LIV-${digits.padStart(4, "0")}` : null;

  const rows = await db()
    .select({
      id: properties.id,
      reference: properties.reference,
      name: properties.name,
      locality: properties.locality,
      city: properties.city,
      type: properties.type,
      askingPrice: properties.askingPrice,
      priceLabel: properties.priceLabel,
      workflowStatus: properties.workflowStatus,
      isPublic: properties.isPublic,
      listingType: properties.listingType,
      summary: properties.summary,
    })
    .from(properties)
    .where(
      and(
        isNull(properties.deletedAt),
        or(
          reference ? eq(properties.reference, reference) : undefined,
          ilike(properties.name, `%${raw}%`),
          ilike(properties.locality, `%${raw}%`),
          ilike(properties.city, `%${raw}%`),
        ),
      ),
    )
    .limit(LIMIT + 1);

  if (rows.length === 0) return { kind: "none" };

  // An exact reference match is unambiguous even when the free text also hits
  // other listings — "LIV-0027" means that one, not three in the same area.
  const exact = rows.find((row) => reference && row.reference === reference);
  if (exact) return { kind: "one", value: exact };

  if (rows.length === 1) return { kind: "one", value: rows[0] };

  return {
    kind: "many",
    options: rows.slice(0, LIMIT).map((row) => ({
      id: row.id,
      label: `${row.reference ?? row.id} — ${row.type} in ${row.locality}`,
    })),
  };
}
