-- Table privileges. Without these, migration 0000's policies are inert.
--
-- RLS filters *within* the privileges a role already holds — a policy grants
-- nothing on its own. Drizzle emits CREATE POLICY but never GRANT, so after
-- 0000 the `authenticated` role held only REFERENCES/TRIGGER/TRUNCATE and every
-- query returned `42501 permission denied`. The tenant-isolation suite caught
-- this; the app would have been entirely unusable.
--
-- Granting explicitly rather than leaning on ALTER DEFAULT PRIVILEGES: the
-- defaults are keyed to the role that creates the table, so they silently do
-- nothing if a migration runs as a different role. Explicit grants are also
-- self-documenting about who is expected to touch what.
--
-- `anon` is deliberately granted NOTHING. An unauthenticated visitor has no
-- business reading tenant data, and RLS is the second line of defence, not the
-- first.

-- customers: SELECT + UPDATE only. There is no INSERT or DELETE policy in 0000,
-- so tenant creation stays with the service role and a stray token cannot mint
-- a customer.
GRANT SELECT, UPDATE ON TABLE public.customers TO authenticated;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lead_sources TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leads TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lead_identities TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lead_events TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.detection_settings TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens TO authenticated;
--> statement-breakpoint

-- service_role bypasses RLS and handles provisioning, migrations, and cron.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
--> statement-breakpoint

-- Allow the application/migration role to assume ingest_role for the duration
-- of an ingest transaction (`SET LOCAL ROLE ingest_role`). Without membership,
-- SET ROLE fails with "permission denied to set role".
--
-- ingest_role itself is NOLOGIN and NOBYPASSRLS, so this widens nothing: the
-- privileges it can exercise are still only those granted in 0001, scoped by
-- app.customer_id.
GRANT ingest_role TO postgres;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ingest_role TO service_role';
  END IF;
END
$$;
