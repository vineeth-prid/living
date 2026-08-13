CREATE TABLE "expense_categories" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"spent_at" timestamp with time zone NOT NULL,
	"category_key" text,
	"vendor" text,
	"description" text NOT NULL,
	"payment_method" text,
	"invoice_number" text,
	"tax_minor" bigint,
	"notes" text,
	"property_id" text,
	"lead_id" text,
	"receipt_key" text,
	"created_by_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"entity" text,
	"entity_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_key_expense_categories_key_fk" FOREIGN KEY ("category_key") REFERENCES "public"."expense_categories"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_reference_idx" ON "expenses" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "expenses_spent_at_idx" ON "expenses" USING btree ("spent_at");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category_key");--> statement-breakpoint
CREATE INDEX "expenses_property_idx" ON "expenses" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "expenses_lead_idx" ON "expenses" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_entity_idx" ON "notifications" USING btree ("entity","entity_id");--> statement-breakpoint
-- Same lesson as lead_sources in 0001: expenses.category_key is a foreign key,
-- so a fresh database needs categories to exist before anyone can record an
-- expense. Admins add more from Settings; these are the starting set.
INSERT INTO "expense_categories" ("key", "label", "sort_order", "is_active") VALUES
  ('marketing', 'Marketing & advertising', 10, true),
  ('photography', 'Photography & staging', 20, true),
  ('travel', 'Travel & site visits', 30, true),
  ('maintenance', 'Property maintenance', 40, true),
  ('legal', 'Legal & documentation', 50, true),
  ('commission', 'Commission & referral', 60, true),
  ('office', 'Office & utilities', 70, true),
  ('salaries', 'Salaries & contractors', 80, true),
  ('software', 'Software & subscriptions', 90, true),
  ('other', 'Other', 100, true)
ON CONFLICT ("key") DO NOTHING;
