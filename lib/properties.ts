import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, hasDatabase } from "./db";
import {
  properties as propertiesTable,
  propertyMedia,
} from "./db/schema";
import { propertySeed } from "./properties.seed";
import { cdnUrl, mediaUrl } from "./images";

import type { AreaUnit, PropertyKind } from "./db/schema";

export type { PropertyDetail, PropertyStatus, AreaUnit } from "./db/schema";

/**
 * The ONLY property shape the public website ever sees (§41).
 *
 * This is a hand-written type rather than `InferSelectModel<typeof properties>`
 * on purpose: inferring from the table would silently absorb every internal
 * column added later — finalPrice, sellerContact, internalNotes — into public
 * pages, OG images and JSON-LD. Adding a field here has to be a deliberate act.
 */
export type Property = {
  id: string;
  name: string;
  locality: string;
  city: string;
  type: string;
  priceLabel: string;
  priceValue: number;
  beds: number;
  baths: number;
  area: string;
  status: "Ready to move" | "Under construction" | "New launch";
  summary: string;
  amenities: string[];
  details: { label: string; value: string }[];
  gallery: string[];
  reference: string | null;
  description: string | null;
  /** Public: a reel or post for the listing. */
  instagramUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;

  /**
   * Physical attributes shown on the listing card (§18/§20). Public on
   * purpose: an area, a facing and a road are what a buyer asks first, and all
   * of them already appear in the brochure. The sensitive neighbours of these
   * columns — surveyNumber, boundaryNotes, addressLine — stay out, and
   * check-security.ts asserts that they do.
   */
  kind: PropertyKind;
  commercialKind: string | null;
  hasBuilding: boolean;
  landArea: number | null;
  landAreaUnit: AreaUnit | null;
  roadAccess: string | null;
  facing: string | null;
  builtUpArea: number | null;
  builtUpAreaUnit: AreaUnit | null;
  units: number | null;
  balconies: number | null;
  propertyAge: string | null;
  sortOrder: number;
  updatedAt: Date;
};

// The allowlist, expressed as a Drizzle projection. Postgres is never asked for
// the internal columns at all, so they cannot leak through a spread, a
// serialiser, an RSC payload or a console.log downstream.
const publicColumns = {
  id: propertiesTable.id,
  name: propertiesTable.name,
  locality: propertiesTable.locality,
  city: propertiesTable.city,
  type: propertiesTable.type,
  priceLabel: propertiesTable.priceLabel,
  priceValue: propertiesTable.priceValue,
  beds: propertiesTable.beds,
  baths: propertiesTable.baths,
  area: propertiesTable.area,
  status: propertiesTable.status,
  summary: propertiesTable.summary,
  amenities: propertiesTable.amenities,
  details: propertiesTable.details,
  gallery: propertiesTable.gallery,
  reference: propertiesTable.reference,
  description: propertiesTable.description,
  instagramUrl: propertiesTable.instagramUrl,
  seoTitle: propertiesTable.seoTitle,
  seoDescription: propertiesTable.seoDescription,
  kind: propertiesTable.kind,
  commercialKind: propertiesTable.commercialKind,
  hasBuilding: propertiesTable.hasBuilding,
  landArea: propertiesTable.landArea,
  landAreaUnit: propertiesTable.landAreaUnit,
  roadAccess: propertiesTable.roadAccess,
  facing: propertiesTable.facing,
  builtUpArea: propertiesTable.builtUpArea,
  builtUpAreaUnit: propertiesTable.builtUpAreaUnit,
  units: propertiesTable.units,
  balconies: propertiesTable.balconies,
  propertyAge: propertiesTable.propertyAge,
  sortOrder: propertiesTable.sortOrder,
  updatedAt: propertiesTable.updatedAt,
} as const;

/**
 * The allowlist as plain strings, so scripts/check-security.ts can assert that
 * no internal column has crept into it. Derived from the projection itself —
 * a second hand-maintained list would drift and quietly stop guarding anything.
 */
export const PUBLIC_PROPERTY_FIELDS: string[] = Object.keys(publicColumns);

/**
 * Rule 2: published AND explicitly public AND not archived. Both flags must
 * hold — publishing sets them together, but unpublishing only clears isPublic,
 * so a listing can be pulled from the site without losing its workflow state.
 */
const isVisible = and(
  eq(propertiesTable.workflowStatus, "published"),
  eq(propertiesTable.isPublic, true),
  isNull(propertiesTable.deletedAt),
);

/** Public, ordered image URLs from property_media, falling back to `gallery`. */
async function galleryFor(ids: string[]): Promise<Map<string, string[]>> {
  const byProperty = new Map<string, string[]>();
  if (ids.length === 0) return byProperty;

  // One query for the whole page of listings — no N+1.
  const rows = await db()
    .select({
      propertyId: propertyMedia.propertyId,
      storageKey: propertyMedia.storageKey,
    })
    .from(propertyMedia)
    .where(
      and(
        inArray(propertyMedia.propertyId, ids),
        eq(propertyMedia.kind, "image"),
        eq(propertyMedia.isPublic, true),
      ),
    )
    .orderBy(
      desc(propertyMedia.isPrimary),
      asc(propertyMedia.sortOrder),
      asc(propertyMedia.createdAt),
    );

  for (const row of rows) {
    const list = byProperty.get(row.propertyId) ?? [];
    list.push(mediaUrl(row.storageKey));
    byProperty.set(row.propertyId, list);
  }
  return byProperty;
}

type PublicRow = Omit<Property, "gallery"> & { gallery: string[] };

function withGallery(row: PublicRow, media: string[] | undefined): Property {
  return {
    ...row,
    // Seeded listings predate property_media and still carry bucket paths in
    // the legacy `gallery` column.
    gallery: media?.length ? media : row.gallery.map(cdnUrl),
  };
}

function seedFallback(): Property[] {
  // ponytail: fixture fallback so a fresh clone (and `next build` in CI) works
  // before Postgres is wired. Delete this branch once DATABASE_URL is set
  // everywhere — it can only ever serve the seed content, never stale prod data.
  console.warn(
    "[properties] DATABASE_URL unset — serving seed fixtures, not Postgres.",
  );
  return propertySeed.map((p, i) => ({
    id: p.id,
    name: p.name,
    locality: p.locality,
    city: p.city,
    type: p.type,
    priceLabel: p.priceLabel,
    priceValue: p.priceValue,
    beds: p.beds,
    baths: p.baths,
    area: p.area,
    status: p.status,
    summary: p.summary,
    amenities: [...p.amenities],
    details: [...p.details],
    gallery: [...p.gallery].map(cdnUrl),
    reference: p.reference ?? null,
    description: p.description ?? null,
    instagramUrl: null,
    seoTitle: null,
    seoDescription: null,
    kind: p.kind ?? "residential",
    commercialKind: p.commercialKind ?? null,
    hasBuilding: p.hasBuilding ?? true,
    landArea: p.landArea ?? null,
    landAreaUnit: p.landAreaUnit ?? null,
    roadAccess: p.roadAccess ?? null,
    facing: p.facing ?? null,
    builtUpArea: p.builtUpArea ?? null,
    builtUpAreaUnit: p.builtUpAreaUnit ?? null,
    units: p.units ?? null,
    balconies: p.balconies ?? null,
    propertyAge: p.propertyAge ?? null,
    sortOrder: p.sortOrder ?? i,
    updatedAt: new Date(),
  }));
}

export async function getProperties(): Promise<Property[]> {
  if (!hasDatabase()) return seedFallback();

  const rows = await db()
    .select(publicColumns)
    .from(propertiesTable)
    .where(isVisible)
    .orderBy(asc(propertiesTable.sortOrder), asc(propertiesTable.name));

  const media = await galleryFor(rows.map((r) => r.id));
  return rows.map((row) => withGallery(row, media.get(row.id)));
}

export async function getProperty(id: string): Promise<Property | undefined> {
  if (!hasDatabase()) return seedFallback().find((p) => p.id === id);

  const [row] = await db()
    .select(publicColumns)
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, id), isVisible))
    .limit(1);

  if (!row) return undefined;
  const media = await galleryFor([row.id]);
  return withGallery(row, media.get(row.id));
}

/** Slugs for sitemap and static params — published listings only. */
export async function getPropertySlugs(): Promise<
  { id: string; updatedAt: Date }[]
> {
  if (!hasDatabase()) {
    return seedFallback().map((p) => ({ id: p.id, updatedAt: p.updatedAt }));
  }
  return db()
    .select({ id: propertiesTable.id, updatedAt: propertiesTable.updatedAt })
    .from(propertiesTable)
    .where(isVisible);
}

/** Listings a lead can be attached to from the public enquiry form. */
export async function publicPropertyExists(id: string): Promise<boolean> {
  if (!hasDatabase()) return seedFallback().some((p) => p.id === id);
  const [row] = await db()
    .select({ n: sql<number>`1` })
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, id), isVisible))
    .limit(1);
  return Boolean(row);
}
