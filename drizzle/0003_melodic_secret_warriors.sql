ALTER TABLE "properties" ADD COLUMN "seller_whatsapp" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "seller_alt_contact" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "seller_email" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "seller_whatsapp_opt_in" boolean DEFAULT false NOT NULL;