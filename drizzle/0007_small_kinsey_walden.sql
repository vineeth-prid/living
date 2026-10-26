CREATE TABLE "job_runs" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"detail" jsonb,
	"consecutive_failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_broadcasts" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "whatsapp_broadcasts_due_idx" ON "whatsapp_broadcasts" USING btree ("status","scheduled_for");