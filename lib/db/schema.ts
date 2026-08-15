import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Shared vocabularies
//
// These are TS unions over text columns, not pg enums. Same reasoning as the
// original `status` column: this business will invent new lead statuses and
// property states, and altering a text column is a migration while altering an
// enum is a migration plus a table rewrite. Constrained at the Zod boundary.
// ---------------------------------------------------------------------------

/** Possession label shown on public cards. Pre-existing, unchanged. */
export type PropertyStatus =
  | "Ready to move"
  | "Under construction"
  | "New launch";

export type PropertyDetail = { label: string; value: string };

/** Publishing lifecycle (§11). Distinct from the public possession label. */
export const WORKFLOW_STATUSES = [
  "draft",
  "ready_for_review",
  "published",
  "reserved",
  "sold",
  "rented",
  "off_market",
  "archived",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const PROPERTY_KINDS = ["residential", "commercial"] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];

export const LISTING_TYPES = ["sale", "rental", "both"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const AREA_UNITS = ["cent", "acre", "sqft", "sqm"] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

export const COMMERCIAL_KINDS = [
  "office",
  "retail",
  "warehouse",
  "land",
  "building",
  "other",
] as const;

export const MEDIA_KINDS = [
  "image",
  "video",
  "sketch",
  "floor_plan",
  "document",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const ROLES = ["admin", "employee"] as const;
export type Role = (typeof ROLES)[number];

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "property_matched",
  "site_visit_scheduled",
  "site_visited",
  "negotiation",
  "booking",
  "closed_won",
  "closed_lost",
  "on_hold",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_PRIORITIES = ["hot", "warm", "cold"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const FOLLOWUP_KINDS = [
  "call",
  "whatsapp",
  "email",
  "meeting",
  "site_visit",
  "other",
] as const;

export const FOLLOWUP_STATUSES = ["pending", "completed", "cancelled"] as const;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

// One table for everyone who can log in. There is no "user" that isn't an
// employee of Living, so splitting users/employees would mean a join on every
// single request to learn a role. §38 lists them separately; collapsing them is
// the same data with one less join.
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    employeeCode: text("employee_code"),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    mobile: text("mobile"),
    role: text("role").$type<Role>().notNull().default("employee"),
    department: text("department"),
    photoKey: text("photo_key"),

    // scrypt output, "salt:hash". Never selected into any public projection.
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(false),

    isActive: boolean("is_active").notNull().default(true),
    // Per-employee grants beyond the base role (e.g. "property.publish",
    // "property.final_price"). Admins bypass this list entirely.
    permissions: text("permissions").array().notNull().default([]),

    joinedAt: timestamp("joined_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

    // Brute-force throttle (§4). Cleared on every successful login.
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Case-insensitive uniqueness: emails are lowercased before every write.
    uniqueIndex("users_email_idx").on(t.email),
    index("users_role_idx").on(t.role),
  ],
);

// Opaque server-side sessions. The cookie carries a random token; only its
// SHA-256 lives here, so a database leak doesn't hand over live sessions.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Properties — the pre-existing table, extended in place (§48)
//
// Every column below the original block is nullable or defaulted, so the
// existing rows and the existing seed keep working untouched.
// ---------------------------------------------------------------------------

export const properties = pgTable(
  "properties",
  {
    // Human-readable slug, also the /homes/[slug] URL segment.
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
    // so the same row works across local, staging and prod. Superseded by
    // property_media for new listings; kept as the fallback for seeded rows.
    gallery: text("gallery").array().notNull(),

    // Explicit display order; row order out of Postgres is otherwise undefined.
    sortOrder: integer("sort_order").notNull().default(0),

    // --- added for the admin panel ------------------------------------------

    reference: text("reference"), // LIV-0001, generated on create
    description: text("description"),
    kind: text("kind").$type<PropertyKind>().notNull().default("residential"),
    listingType: text("listing_type")
      .$type<ListingType>()
      .notNull()
      .default("sale"),
    workflowStatus: text("workflow_status")
      .$type<WorkflowStatus>()
      .notNull()
      .default("draft"),
    // Rule 1: creating a property never publishes it. Both this and
    // workflowStatus="published" must hold before it reaches the website.
    isPublic: boolean("is_public").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),

    // Location
    addressLine: text("address_line"),
    // §6: the street address may be commercially sensitive even when the
    // listing is public, so it hides independently of the listing itself.
    addressIsPublic: boolean("address_is_public").notNull().default(false),
    district: text("district"),
    state: text("state").default("Kerala"),
    pincode: text("pincode"),
    country: text("country").default("India"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),

    // Land
    landArea: doublePrecision("land_area"),
    landAreaUnit: text("land_area_unit").$type<AreaUnit>(),
    surveyNumber: text("survey_number"),
    roadAccess: text("road_access"),
    facing: text("facing"),
    boundaryNotes: text("boundary_notes"),

    // Building
    hasBuilding: boolean("has_building").notNull().default(true),
    builtUpArea: doublePrecision("built_up_area"),
    builtUpAreaUnit: text("built_up_area_unit").$type<AreaUnit>(),
    floors: integer("floors"),
    units: integer("units"),
    balconies: integer("balconies"),
    parking: text("parking"),
    propertyAge: text("property_age"),
    furnishedStatus: text("furnished_status"),

    // Commercial-only
    commercialKind: text("commercial_kind"),
    floorNumber: text("floor_number"),
    occupancy: text("occupancy"),
    suitableFor: text("suitable_for"),
    leasePotential: text("lease_potential"),

    // Financial. askingPrice mirrors priceValue and is the field the admin
    // edits; priceValue/priceLabel stay as the public display pair.
    askingPrice: bigint("asking_price", { mode: "number" }),
    priceUnit: text("price_unit").default("INR"),
    rentalIncome: bigint("rental_income", { mode: "number" }),
    rentalFrequency: text("rental_frequency"),
    rentalYield: doublePrecision("rental_yield"),

    // INTERNAL ONLY (§9). Excluded from every public projection by
    // construction — see lib/properties/public.ts, which selects an explicit
    // column allowlist rather than filtering a full row.
    finalPrice: bigint("final_price", { mode: "number" }),
    internalNotes: text("internal_notes"),
    sellerName: text("seller_name"),
    sellerContact: text("seller_contact"),
    /**
     * Owner contact detail. Internal like the rest of this block — none of it
     * is in the public projection, and check-security.ts asserts that.
     *
     * The two numbers are stored canonical (E.164 digits, no plus) so they can
     * be dialled or messaged without re-parsing, and so a number written three
     * different ways is still one number.
     */
    sellerWhatsapp: text("seller_whatsapp"),
    sellerAltContact: text("seller_alt_contact"),
    sellerEmail: text("seller_email"),
    /**
     * Whether Living may contact this owner on WhatsApp. Off by default: an
     * owner's number appearing on a record is not consent to message it.
     */
    sellerWhatsappOptIn: boolean("seller_whatsapp_opt_in").notNull().default(false),

    // SEO
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),

    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedById: text("updated_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Rule 12: archive rather than delete.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("properties_status_idx").on(t.status),
    // The public listing query filters on exactly these two, together.
    index("properties_public_idx").on(t.workflowStatus, t.isPublic),
    index("properties_kind_idx").on(t.kind),
    index("properties_city_idx").on(t.city),
    index("properties_created_at_idx").on(t.createdAt),
    uniqueIndex("properties_reference_idx").on(t.reference),
  ],
);

export const propertyMedia = pgTable(
  "property_media",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    kind: text("kind").$type<MediaKind>().notNull().default("image"),
    // Bucket-relative object key, same convention as properties.gallery.
    storageKey: text("storage_key").notNull(),
    caption: text("caption"),
    // Documents and sketches default to private; images to public.
    isPublic: boolean("is_public").notNull().default(true),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    sizeBytes: integer("size_bytes"),
    contentType: text("content_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("property_media_property_idx").on(t.propertyId, t.sortOrder),
    index("property_media_public_idx").on(t.propertyId, t.kind, t.isPublic),
  ],
);

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

// Lead types and sources are rows, not unions, because §17 and §20 both say
// admins add more later without a deploy.
export const leadTypes = pgTable("lead_types", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const leadSources = pgTable("lead_sources", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const leads = pgTable(
  "leads",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull(),

    name: text("name").notNull(),
    mobile: text("mobile").notNull(),
    altMobile: text("alt_mobile"),
    email: text("email"),
    preferredContact: text("preferred_contact"),
    location: text("location"),
    city: text("city"),
    country: text("country"),

    typeKey: text("type_key").references(() => leadTypes.key, {
      onDelete: "set null",
    }),

    // Requirement (§18)
    propertyKind: text("property_kind").$type<PropertyKind>(),
    requirementType: text("requirement_type"), // buy | sell | rent | lease
    preferredLocation: text("preferred_location"),
    budgetMin: bigint("budget_min", { mode: "number" }),
    budgetMax: bigint("budget_max", { mode: "number" }),
    preferredPropertyType: text("preferred_property_type"),
    bedrooms: integer("bedrooms"),
    landRequirement: text("land_requirement"),
    timeline: text("timeline"),
    purpose: text("purpose"),

    // Pipeline
    status: text("status").$type<LeadStatus>().notNull().default("new"),
    priority: text("priority").$type<LeadPriority>().notNull().default("warm"),

    // Attribution (§20)
    sourceKey: text("source_key").references(() => leadSources.key, {
      onDelete: "set null",
    }),
    campaign: text("campaign"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    landingPage: text("landing_page"),
    referrerUrl: text("referrer_url"),

    // Assignment (§23)
    assignedToId: text("assigned_to_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    assignedById: text("assigned_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    initialMessage: text("initial_message"),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    // Denormalised from the earliest pending follow-up so the list and pipeline
    // views can sort and filter on it without a correlated subquery per row.
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedValue: bigint("closed_value", { mode: "number" }),
    lostReason: text("lost_reason"),

    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("leads_reference_idx").on(t.reference),
    // Duplicate detection (§30) hits mobile on every lead create.
    index("leads_mobile_idx").on(t.mobile),
    index("leads_email_idx").on(t.email),
    index("leads_status_idx").on(t.status),
    index("leads_assigned_idx").on(t.assignedToId, t.status),
    index("leads_source_idx").on(t.sourceKey),
    index("leads_created_at_idx").on(t.createdAt),
    index("leads_follow_up_idx").on(t.nextFollowUpAt),
  ],
);

export const leadProperties = pgTable(
  "lead_properties",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    propertyId: text("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    note: text("note"),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("lead_properties_pair_idx").on(t.leadId, t.propertyId),
    index("lead_properties_property_idx").on(t.propertyId),
  ],
);

// Append-only (Rule 11). Nothing in the app updates or deletes these.
export const leadNotes = pgTable(
  "lead_notes",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    kind: text("kind").notNull().default("note"), // note | initial | followup
    authorId: text("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("lead_notes_lead_idx").on(t.leadId, t.createdAt)],
);

// The timeline (§25). Also append-only.
export const leadActivities = pgTable(
  "lead_activities",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // created | assigned | status | note | call | ...
    summary: text("summary").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("lead_activities_lead_idx").on(t.leadId, t.createdAt)],
);

export const leadFollowups = pgTable(
  "lead_followups",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    kind: text("kind").notNull().default("call"),
    assignedToId: text("assigned_to_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    status: text("status").notNull().default("pending"),
    remindAt: timestamp("remind_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lead_followups_lead_idx").on(t.leadId),
    // "My follow-ups", overdue counts and the today view all read this.
    index("lead_followups_due_idx").on(t.assignedToId, t.status, t.dueAt),
  ],
);

// ---------------------------------------------------------------------------
// Expenses
//
// An admin-only ledger. There is no submit/approve workflow: expenses are
// recorded by administrators and edited in place, with archive rather than
// delete so history survives.
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "upi",
  "card",
  "cheque",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// A row rather than a union, same reasoning as lead types: the finance team
// invents categories without waiting for a deploy.
export const expenseCategories = pgTable("expense_categories", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const expenses = pgTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    reference: text("reference"),

    // Paise, not rupees. Storing money as a float invites 0.1 + 0.2 problems
    // in totals; bigint of the minor unit cannot drift.
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("INR"),

    spentAt: timestamp("spent_at", { withTimezone: true }).notNull(),
    categoryKey: text("category_key").references(() => expenseCategories.key, {
      onDelete: "set null",
    }),
    vendor: text("vendor"),
    description: text("description").notNull(),
    paymentMethod: text("payment_method").$type<PaymentMethod>(),
    invoiceNumber: text("invoice_number"),
    taxMinor: bigint("tax_minor", { mode: "number" }),
    notes: text("notes"),

    // Cost attribution. Both optional — an office electricity bill belongs to
    // neither. ON DELETE SET NULL: archiving a listing must not delete the
    // record that money was spent on it.
    propertyId: text("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    leadId: text("lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),

    // Bucket-relative key, same convention as property media.
    receiptKey: text("receipt_key"),

    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("expenses_reference_idx").on(t.reference),
    // The list is date-ordered and the reports group by month.
    index("expenses_spent_at_idx").on(t.spentAt),
    index("expenses_category_idx").on(t.categoryKey),
    index("expenses_property_idx").on(t.propertyId),
    index("expenses_lead_idx").on(t.leadId),
  ],
);

// ---------------------------------------------------------------------------
// Notification outbox
//
// Every attempt is recorded, sent or not. Email is the one part of this system
// that fails silently and invisibly; without a log, "the agent never got the
// alert" is unanswerable.
// ---------------------------------------------------------------------------

export const NOTIFICATION_STATUSES = ["sent", "failed", "skipped"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    event: text("event").notNull(), // lead.created, lead.assigned, ...
    channel: text("channel").notNull().default("email"),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    status: text("status").$type<NotificationStatus>().notNull(),
    error: text("error"),
    entity: text("entity"),
    entityId: text("entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_created_idx").on(t.createdAt),
    index("notifications_entity_idx").on(t.entity, t.entityId),
  ],
);

// ---------------------------------------------------------------------------
// Audit (§37)
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(), // property.published, lead.assigned, ...
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
    index("audit_logs_actor_idx").on(t.actorId, t.createdAt),
  ],
);
