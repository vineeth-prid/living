CREATE TABLE "whatsapp_broadcast_recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"broadcast_id" text NOT NULL,
	"lead_id" text,
	"phone_number" text NOT NULL,
	"name" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_broadcasts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"media_key" text,
	"media_mime_type" text,
	"media_filename" text,
	"media_kind" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"audience" jsonb,
	"total_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN "marketing_opt_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ADD CONSTRAINT "whatsapp_broadcast_recipients_broadcast_id_whatsapp_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."whatsapp_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ADD CONSTRAINT "whatsapp_broadcast_recipients_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcasts" ADD CONSTRAINT "whatsapp_broadcasts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_broadcast_recipients_phone_idx" ON "whatsapp_broadcast_recipients" USING btree ("broadcast_id","phone_number");--> statement-breakpoint
CREATE INDEX "whatsapp_broadcast_recipients_queue_idx" ON "whatsapp_broadcast_recipients" USING btree ("broadcast_id","status");--> statement-breakpoint
CREATE INDEX "whatsapp_broadcast_recipients_lead_idx" ON "whatsapp_broadcast_recipients" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "whatsapp_broadcasts_status_idx" ON "whatsapp_broadcasts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_broadcasts_created_idx" ON "whatsapp_broadcasts" USING btree ("created_at");