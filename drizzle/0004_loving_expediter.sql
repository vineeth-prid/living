CREATE TABLE "whatsapp_command_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text,
	"conversation_id" text,
	"employee_id" text,
	"sender_phone" text,
	"original_text" text,
	"intent" text NOT NULL,
	"confidence" double precision,
	"model" text,
	"entities" jsonb,
	"status" text DEFAULT 'executed' NOT NULL,
	"requires_confirmation" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"target_entity" text,
	"target_entity_id" text,
	"result_summary" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "whatsapp_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"phone_number" text NOT NULL,
	"national_digits" text NOT NULL,
	"whatsapp_id" text,
	"display_name" text,
	"contact_type" text DEFAULT 'unknown' NOT NULL,
	"employee_id" text,
	"lead_id" text,
	"is_allowed" boolean DEFAULT true NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"employee_id" text,
	"lead_id" text,
	"property_id" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"provider_message_id" text,
	"direction" text NOT NULL,
	"sender_phone" text,
	"recipient_phone" text,
	"message_type" text DEFAULT 'text' NOT NULL,
	"text" text,
	"media_metadata" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"event_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_session_id" text NOT NULL,
	"display_name" text,
	"phone_number" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"webhook_configured_at" timestamp with time zone,
	"last_connected_at" timestamp with time zone,
	"last_disconnected_at" timestamp with time zone,
	"last_api_ok_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"delivery_id" text,
	"event" text NOT NULL,
	"provider_session_id" text,
	"provider_message_id" text,
	"status" text DEFAULT 'received' NOT NULL,
	"error" text,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_crm_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_number" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_scope" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_command_executions" ADD CONSTRAINT "whatsapp_command_executions_message_id_whatsapp_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."whatsapp_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_command_executions" ADD CONSTRAINT "whatsapp_command_executions_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_command_executions" ADD CONSTRAINT "whatsapp_command_executions_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_session_id_whatsapp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."whatsapp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_contact_id_whatsapp_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."whatsapp_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_commands_employee_idx" ON "whatsapp_command_executions" USING btree ("employee_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_commands_status_idx" ON "whatsapp_command_executions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "whatsapp_commands_conversation_idx" ON "whatsapp_command_executions" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_contacts_phone_idx" ON "whatsapp_contacts" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "whatsapp_contacts_national_idx" ON "whatsapp_contacts" USING btree ("national_digits");--> statement-breakpoint
CREATE INDEX "whatsapp_contacts_employee_idx" ON "whatsapp_contacts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "whatsapp_contacts_lead_idx" ON "whatsapp_contacts" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversations_chat_idx" ON "whatsapp_conversations" USING btree ("session_id","chat_id");--> statement-breakpoint
CREATE INDEX "whatsapp_conversations_lead_idx" ON "whatsapp_conversations" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_conversation_idx" ON "whatsapp_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_messages_provider_idx" ON "whatsapp_messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_sessions_provider_idx" ON "whatsapp_sessions" USING btree ("provider","provider_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_webhook_events_key_idx" ON "whatsapp_webhook_events" USING btree ("provider","idempotency_key");--> statement-breakpoint
CREATE INDEX "whatsapp_webhook_events_received_idx" ON "whatsapp_webhook_events" USING btree ("received_at");