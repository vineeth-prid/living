CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_followups" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"kind" text DEFAULT 'call' NOT NULL,
	"assigned_to_id" text,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"remind_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"body" text NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_properties" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"property_id" text NOT NULL,
	"note" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_sources" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_types" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"mobile" text NOT NULL,
	"alt_mobile" text,
	"email" text,
	"preferred_contact" text,
	"location" text,
	"city" text,
	"country" text,
	"type_key" text,
	"property_kind" text,
	"requirement_type" text,
	"preferred_location" text,
	"budget_min" bigint,
	"budget_max" bigint,
	"preferred_property_type" text,
	"bedrooms" integer,
	"land_requirement" text,
	"timeline" text,
	"purpose" text,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'warm' NOT NULL,
	"source_key" text,
	"campaign" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"landing_page" text,
	"referrer_url" text,
	"assigned_to_id" text,
	"assigned_at" timestamp with time zone,
	"assigned_by_id" text,
	"initial_message" text,
	"last_contacted_at" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_value" bigint,
	"lost_reason" text,
	"created_by_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_media" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"kind" text DEFAULT 'image' NOT NULL,
	"storage_key" text NOT NULL,
	"caption" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"size_bytes" integer,
	"content_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_code" text,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"mobile" text,
	"role" text DEFAULT 'employee' NOT NULL,
	"department" text,
	"photo_key" text,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"joined_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "kind" text DEFAULT 'residential' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "listing_type" text DEFAULT 'sale' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "workflow_status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "address_line" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "address_is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "district" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "state" text DEFAULT 'Kerala';--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "pincode" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "country" text DEFAULT 'India';--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "land_area" double precision;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "land_area_unit" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "survey_number" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "road_access" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "facing" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "boundary_notes" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "has_building" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "built_up_area" double precision;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "built_up_area_unit" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "floors" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "units" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "balconies" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "parking" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "property_age" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "furnished_status" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "commercial_kind" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "floor_number" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "occupancy" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "suitable_for" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "lease_potential" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "asking_price" bigint;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "price_unit" text DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "rental_income" bigint;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "rental_frequency" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "rental_yield" double precision;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "final_price" bigint;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "seller_name" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "seller_contact" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "seo_title" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "seo_description" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "created_by_id" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "updated_by_id" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_followups" ADD CONSTRAINT "lead_followups_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_followups" ADD CONSTRAINT "lead_followups_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_followups" ADD CONSTRAINT "lead_followups_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_properties" ADD CONSTRAINT "lead_properties_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_properties" ADD CONSTRAINT "lead_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_properties" ADD CONSTRAINT "lead_properties_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_type_key_lead_types_key_fk" FOREIGN KEY ("type_key") REFERENCES "public"."lead_types"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_key_lead_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."lead_sources"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_followups_lead_idx" ON "lead_followups" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_followups_due_idx" ON "lead_followups" USING btree ("assigned_to_id","status","due_at");--> statement-breakpoint
CREATE INDEX "lead_notes_lead_idx" ON "lead_notes" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_properties_pair_idx" ON "lead_properties" USING btree ("lead_id","property_id");--> statement-breakpoint
CREATE INDEX "lead_properties_property_idx" ON "lead_properties" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_reference_idx" ON "leads" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "leads_mobile_idx" ON "leads" USING btree ("mobile");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_assigned_idx" ON "leads" USING btree ("assigned_to_id","status");--> statement-breakpoint
CREATE INDEX "leads_source_idx" ON "leads" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "leads_follow_up_idx" ON "leads" USING btree ("next_follow_up_at");--> statement-breakpoint
CREATE INDEX "property_media_property_idx" ON "property_media" USING btree ("property_id","sort_order");--> statement-breakpoint
CREATE INDEX "property_media_public_idx" ON "property_media" USING btree ("property_id","kind","is_public");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "properties_public_idx" ON "properties" USING btree ("workflow_status","is_public");--> statement-breakpoint
CREATE INDEX "properties_kind_idx" ON "properties" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "properties_city_idx" ON "properties" USING btree ("city");--> statement-breakpoint
CREATE INDEX "properties_created_at_idx" ON "properties" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_reference_idx" ON "properties" USING btree ("reference");--> statement-breakpoint
-- Data migration: every listing that already existed was live on the website
-- before the admin panel introduced a publishing workflow. Without this they
-- would all default to `draft` and silently disappear from livingbyitr.com the
-- moment this migration runs. Only affects rows present at migration time.
UPDATE "properties"
SET "workflow_status" = 'published',
    "is_public" = true,
    "published_at" = COALESCE("published_at", now())
WHERE "deleted_at" IS NULL;
