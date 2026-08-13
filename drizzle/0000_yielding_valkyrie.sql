CREATE TABLE "properties" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"locality" text NOT NULL,
	"city" text NOT NULL,
	"type" text NOT NULL,
	"price_label" text NOT NULL,
	"price_value" bigint NOT NULL,
	"beds" integer NOT NULL,
	"baths" integer NOT NULL,
	"area" text NOT NULL,
	"status" text NOT NULL,
	"summary" text NOT NULL,
	"amenities" text[] NOT NULL,
	"details" jsonb NOT NULL,
	"gallery" text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "properties_status_idx" ON "properties" USING btree ("status");