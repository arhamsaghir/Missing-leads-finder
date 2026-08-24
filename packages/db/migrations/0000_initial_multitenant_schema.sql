CREATE TYPE "public"."identity_kind" AS ENUM('email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'booked', 'lost', 'recovered', 'won');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('webhook', 'email', 'csv');--> statement-breakpoint
CREATE TYPE "public"."push_platform" AS ENUM('expo', 'web');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"business_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"lead_id" uuid,
	"source_id" uuid,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"raw_payload" jsonb,
	"parse_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parse_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_events_customer_dedupe_key" UNIQUE("customer_id","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "lead_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lead_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" "identity_kind" NOT NULL,
	"value_normalized" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_identities_customer_value_key" UNIQUE("customer_id","kind","value_normalized")
);
--> statement-breakpoint
ALTER TABLE "lead_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lead_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"label" text NOT NULL,
	"webhook_token" text,
	"webhook_token_previous" text,
	"inbound_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "lead_sources_webhook_token_unique" UNIQUE("webhook_token"),
	CONSTRAINT "lead_sources_webhook_token_previous_unique" UNIQUE("webhook_token_previous"),
	CONSTRAINT "lead_sources_inbound_address_unique" UNIQUE("inbound_address")
);
--> statement-breakpoint
ALTER TABLE "lead_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"source_id" uuid,
	"external_lead_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"customer_name" text DEFAULT 'Unknown' NOT NULL,
	"email" text,
	"phone" text,
	"source" text DEFAULT 'Manual' NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"last_contact_at" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"estimated_value" integer DEFAULT 25000 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"merged_into_lead_id" uuid,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_source_external_id_key" UNIQUE("source_id","external_lead_id")
);
--> statement-breakpoint
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "detection_settings" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"slow_reply_hours" integer DEFAULT 24 NOT NULL,
	"stale_quote_days" integer DEFAULT 7 NOT NULL,
	"default_average_ticket" integer DEFAULT 25000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "detection_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"platform" "push_platform" NOT NULL,
	"token" text NOT NULL,
	"p256dh" text,
	"auth" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_customer_platform_token_key" UNIQUE("customer_id","platform","token")
);
--> statement-breakpoint
ALTER TABLE "push_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identities" ADD CONSTRAINT "lead_identities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identities" ADD CONSTRAINT "lead_identities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_merged_into_lead_id_leads_id_fk" FOREIGN KEY ("merged_into_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detection_settings" ADD CONSTRAINT "detection_settings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_events_customer_lead_idx" ON "lead_events" USING btree ("customer_id","lead_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lead_identities_lead_idx" ON "lead_identities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_sources_customer_idx" ON "lead_sources" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "leads_customer_created_idx" ON "leads" USING btree ("customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_customer_status_idx" ON "leads" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "push_tokens_customer_idx" ON "push_tokens" USING btree ("customer_id");--> statement-breakpoint
CREATE POLICY "customers_select_own" ON "customers" AS PERMISSIVE FOR SELECT TO "authenticated" USING (auth_user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "customers_update_own" ON "customers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (auth_user_id = (select auth.uid())) WITH CHECK (auth_user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "lead_events_tenant_isolation" ON "lead_events" AS PERMISSIVE FOR ALL TO "authenticated" USING (customer_id in (select id from public.customers where auth_user_id = (select auth.uid()))) WITH CHECK (customer_id in (select id from public.customers where auth_user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "lead_identities_tenant_isolation" ON "lead_identities" AS PERMISSIVE FOR ALL TO "authenticated" USING (customer_id in (select id from public.customers where auth_user_id = (select auth.uid()))) WITH CHECK (customer_id in (select id from public.customers where auth_user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "lead_sources_tenant_isolation" ON "lead_sources" AS PERMISSIVE FOR ALL TO "authenticated" USING (customer_id in (select id from public.customers where auth_user_id = (select auth.uid()))) WITH CHECK (customer_id in (select id from public.customers where auth_user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "leads_tenant_isolation" ON "leads" AS PERMISSIVE FOR ALL TO "authenticated" USING (customer_id in (select id from public.customers where auth_user_id = (select auth.uid()))) WITH CHECK (customer_id in (select id from public.customers where auth_user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "detection_settings_tenant_isolation" ON "detection_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (customer_id in (select id from public.customers where auth_user_id = (select auth.uid()))) WITH CHECK (customer_id in (select id from public.customers where auth_user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "push_tokens_tenant_isolation" ON "push_tokens" AS PERMISSIVE FOR ALL TO "authenticated" USING (customer_id in (select id from public.customers where auth_user_id = (select auth.uid()))) WITH CHECK (customer_id in (select id from public.customers where auth_user_id = (select auth.uid())));