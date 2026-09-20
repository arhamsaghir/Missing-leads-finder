-- Ingest role: writes for unauthenticated webhook/email deliveries.
--
-- The problem: a form tool POSTs to a secret URL. There is no user JWT, so
-- auth.uid() is null and every `authenticated` policy from migration 0000
-- evaluates false. The lazy fix is to run ingest as service_role, which
-- bypasses RLS entirely — one bug in a handler could then write into the wrong
-- tenant, and the database would happily accept it.
--
-- Instead: a role that is explicitly NOT BYPASSRLS, whose policies read the
-- customer from a transaction-local setting. Ingest resolves the webhook token
-- to a customer_id, then:
--
--   BEGIN;
--   SELECT set_config('app.customer_id', $1, true);  -- true = transaction-local
--   ... writes ...
--   COMMIT;
--
-- A handler that forgets to set it writes nothing (the policy fails closed);
-- a handler that sets the wrong one cannot reach another tenant's rows.
--
-- NOTE: `set_config(..., true)` is transaction-scoped, so ingest MUST wrap its
-- writes in an explicit transaction. This requires a transaction-capable
-- connection — Supavisor in transaction mode is fine, a stateless HTTP driver
-- is not.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ingest_role') THEN
    CREATE ROLE ingest_role NOBYPASSRLS NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO ingest_role;
--> statement-breakpoint

-- Fails closed: NULL when unset, so the comparison is never true.
CREATE OR REPLACE FUNCTION public.current_ingest_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT nullif(current_setting('app.customer_id', true), '')::uuid
$$;
--> statement-breakpoint

-- Read-only on customers: ingest needs to confirm the tenant exists, never to
-- create or modify one.
GRANT SELECT ON TABLE public.customers TO ingest_role;
--> statement-breakpoint
CREATE POLICY "customers_ingest_scoped" ON public.customers
  AS PERMISSIVE FOR SELECT TO ingest_role
  USING (id = public.current_ingest_customer_id());
--> statement-breakpoint

GRANT SELECT ON TABLE public.lead_sources TO ingest_role;
--> statement-breakpoint
CREATE POLICY "lead_sources_ingest_scoped" ON public.lead_sources
  AS PERMISSIVE FOR SELECT TO ingest_role
  USING (customer_id = public.current_ingest_customer_id());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE public.leads TO ingest_role;
--> statement-breakpoint
CREATE POLICY "leads_ingest_scoped" ON public.leads
  AS PERMISSIVE FOR ALL TO ingest_role
  USING (customer_id = public.current_ingest_customer_id())
  WITH CHECK (customer_id = public.current_ingest_customer_id());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE public.lead_identities TO ingest_role;
--> statement-breakpoint
CREATE POLICY "lead_identities_ingest_scoped" ON public.lead_identities
  AS PERMISSIVE FOR ALL TO ingest_role
  USING (customer_id = public.current_ingest_customer_id())
  WITH CHECK (customer_id = public.current_ingest_customer_id());
--> statement-breakpoint

GRANT SELECT, INSERT ON TABLE public.lead_events TO ingest_role;
--> statement-breakpoint
CREATE POLICY "lead_events_ingest_scoped" ON public.lead_events
  AS PERMISSIVE FOR ALL TO ingest_role
  USING (customer_id = public.current_ingest_customer_id())
  WITH CHECK (customer_id = public.current_ingest_customer_id());
--> statement-breakpoint

-- Detection thresholds are read to score a lead on arrival. Read-only: an
-- inbound webhook has no business changing a customer's settings.
GRANT SELECT ON TABLE public.detection_settings TO ingest_role;
--> statement-breakpoint
CREATE POLICY "detection_settings_ingest_scoped" ON public.detection_settings
  AS PERMISSIVE FOR SELECT TO ingest_role
  USING (customer_id = public.current_ingest_customer_id());
--> statement-breakpoint

-- Deliberately no grant on push_tokens: ingest never reads or writes devices.
