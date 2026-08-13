import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  properties,
  propertyMedia,
  users,
  type WorkflowStatus,
} from "./db/schema";
import { cdnUrl } from "./images";
import { PERMISSIONS } from "./auth/constants";
import type { SessionUser } from "./auth/session";
import { can } from "./auth/dal";

// Internal property reads (§41). Everything here may contain finalPrice and
// other internal columns and must never be imported by a public page — the
// public site goes through lib/properties.ts, which selects an allowlist.

export const PAGE_SIZE = 25;

export type PropertyFilters = {
  q?: string;
  status?: WorkflowStatus | "all";
  kind?: string;
  listingType?: string;
  city?: string;
  sort?: "recent" | "price_desc" | "price_asc" | "updated";
  page?: number;
};

export async function listProperties(filters: PropertyFilters) {
  const page = Math.max(1, filters.page ?? 1);

  const where = and(
    isNull(properties.deletedAt),
    filters.status && filters.status !== "all"
      ? eq(properties.workflowStatus, filters.status)
      : undefined,
    filters.kind ? eq(properties.kind, filters.kind as "residential") : undefined,
    filters.listingType
      ? eq(properties.listingType, filters.listingType as "sale")
      : undefined,
    filters.city ? ilike(properties.city, `%${filters.city}%`) : undefined,
    filters.q
      ? or(
          ilike(properties.name, `%${filters.q}%`),
          ilike(properties.reference, `%${filters.q}%`),
          ilike(properties.locality, `%${filters.q}%`),
          ilike(properties.city, `%${filters.q}%`),
        )
      : undefined,
  );

  const order =
    filters.sort === "price_desc"
      ? desc(properties.priceValue)
      : filters.sort === "price_asc"
        ? asc(properties.priceValue)
        : filters.sort === "updated"
          ? desc(properties.updatedAt)
          : desc(properties.createdAt);

  // Server-side pagination (§45) — the browser never receives the full table.
  const rows = await db()
    .select({
      id: properties.id,
      reference: properties.reference,
      name: properties.name,
      locality: properties.locality,
      city: properties.city,
      kind: properties.kind,
      listingType: properties.listingType,
      priceLabel: properties.priceLabel,
      askingPrice: properties.askingPrice,
      workflowStatus: properties.workflowStatus,
      isPublic: properties.isPublic,
      updatedAt: properties.updatedAt,
      createdByName: users.fullName,
    })
    .from(properties)
    .leftJoin(users, eq(users.id, properties.createdById))
    .where(where)
    .orderBy(order)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const [{ total }] = await db()
    .select({ total: count() })
    .from(properties)
    .where(where);

  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/**
 * Full internal row plus media, with finalPrice stripped unless the caller
 * holds the permission. Stripping happens here, at the read, so no page can
 * forget to do it.
 */
export async function getAdminProperty(id: string, viewer: SessionUser) {
  const [row] = await db()
    .select()
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);

  if (!row) return null;

  const media = await db()
    .select()
    .from(propertyMedia)
    .where(eq(propertyMedia.propertyId, id))
    .orderBy(
      desc(propertyMedia.isPrimary),
      asc(propertyMedia.sortOrder),
      asc(propertyMedia.createdAt),
    );

  const { finalPrice, ...rest } = row;
  const maySeeFinalPrice = can(viewer, PERMISSIONS.propertyFinalPrice);

  return {
    ...rest,
    finalPrice: maySeeFinalPrice ? finalPrice : null,
    maySeeFinalPrice,
    media: media.map((m) => ({ ...m, url: cdnUrl(m.storageKey) })),
  };
}

export type AdminProperty = NonNullable<
  Awaited<ReturnType<typeof getAdminProperty>>
>;

/** Distinct cities, for the list filter. */
export async function propertyCities(): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ city: properties.city })
    .from(properties)
    .where(isNull(properties.deletedAt))
    .orderBy(asc(properties.city));
  return rows.map((r) => r.city).filter(Boolean);
}

export async function propertyStatusCounts() {
  const rows = await db()
    .select({
      workflowStatus: properties.workflowStatus,
      total: count(),
    })
    .from(properties)
    .where(isNull(properties.deletedAt))
    .groupBy(properties.workflowStatus);

  return Object.fromEntries(rows.map((r) => [r.workflowStatus, r.total])) as
    Partial<Record<WorkflowStatus, number>>;
}

/** Compact list for pickers (lead → interested properties). */
export async function propertyOptions(query?: string) {
  return db()
    .select({
      id: properties.id,
      name: properties.name,
      reference: properties.reference,
      locality: properties.locality,
      priceLabel: properties.priceLabel,
    })
    .from(properties)
    .where(
      and(
        isNull(properties.deletedAt),
        query
          ? or(
              ilike(properties.name, `%${query}%`),
              ilike(properties.reference, `%${query}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(properties.createdAt))
    .limit(20);
}

/** Latest reference, for generating the next LIV-xxxx. */
export async function latestPropertyReference(): Promise<string | null> {
  const [row] = await db()
    .select({ reference: properties.reference })
    .from(properties)
    .where(sql`${properties.reference} is not null`)
    .orderBy(desc(properties.reference))
    .limit(1);
  return row?.reference ?? null;
}

/** Leads interested in a given property (§19, reverse direction). */
export async function propertyIds(ids: string[]) {
  if (!ids.length) return [];
  return db()
    .select({ id: properties.id, name: properties.name, reference: properties.reference })
    .from(properties)
    .where(inArray(properties.id, ids));
}
