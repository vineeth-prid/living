import type { InferSelectModel } from "drizzle-orm";
import { asc } from "drizzle-orm";
import { db, hasDatabase } from "./db";
import { properties as propertiesTable } from "./db/schema";
import { propertySeed } from "./properties.seed";
import { cdnUrl } from "./images";

export type { PropertyDetail, PropertyStatus } from "./db/schema";
export type Property = InferSelectModel<typeof propertiesTable>;

// Rows store bucket-relative paths; components need fetchable URLs.
function toProperty(row: Property): Property {
  return { ...row, gallery: row.gallery.map(cdnUrl) };
}

export async function getProperties(): Promise<Property[]> {
  // ponytail: fixture fallback so a fresh clone (and `next build` in CI) works
  // before Postgres is wired. Delete this branch once DATABASE_URL is set
  // everywhere — it can only ever serve the seed content, never stale prod data.
  if (!hasDatabase()) {
    console.warn(
      "[properties] DATABASE_URL unset — serving seed fixtures, not Postgres.",
    );
    const now = new Date();
    return propertySeed.map((p, i) =>
      toProperty({
        ...p,
        sortOrder: p.sortOrder ?? i,
        createdAt: now,
        updatedAt: now,
      } as Property),
    );
  }

  const rows = await db()
    .select()
    .from(propertiesTable)
    .orderBy(asc(propertiesTable.sortOrder), asc(propertiesTable.name));

  return rows.map(toProperty);
}

export async function getProperty(id: string): Promise<Property | undefined> {
  const all = await getProperties();
  return all.find((p) => p.id === id);
}
