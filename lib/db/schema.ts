import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export type PropertyStatus =
  | "Ready to move"
  | "Under construction"
  | "New launch";

export type PropertyDetail = { label: string; value: string };

// Listings. `status` is text rather than a pg enum on purpose — a listing will
// pick up states like "Sold" or "Reserved" once the CRM lands, and altering a
// text column is a migration, altering an enum is a migration plus a rewrite.
export const properties = pgTable(
  "properties",
  {
    // Human-readable slug, also the future /homes/[slug] URL segment.
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    locality: text("locality").notNull(),
    city: text("city").notNull(),
    type: text("type").notNull(),

    priceLabel: text("price_label").notNull(),
    // bigint: ₹ amounts in full rupees outgrow int4 above ~₹21 Cr.
    priceValue: bigint("price_value", { mode: "number" }).notNull(),

    beds: integer("beds").notNull(),
    baths: integer("baths").notNull(),
    area: text("area").notNull(),
    status: text("status").$type<PropertyStatus>().notNull(),
    summary: text("summary").notNull(),

    amenities: text("amenities").array().notNull(),
    details: jsonb("details").$type<PropertyDetail[]>().notNull(),
    // Bucket-relative paths ("/images/homes/x.jpg"), never absolute URLs —
    // so the same row works across local, staging and prod.
    gallery: text("gallery").array().notNull(),

    // Explicit display order; row order out of Postgres is otherwise undefined.
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("properties_status_idx").on(t.status)],
);
