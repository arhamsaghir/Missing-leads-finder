CREATE TABLE "ingest_rate_counters" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ingest_rate_counters_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
ALTER TABLE "lead_sources" ADD COLUMN "token_rotated_at" timestamp with time zone;
--> statement-breakpoint

-- ── resolver_role: the pre-tenant lookup boundary ──────────────────────────
--
-- Resolving a webhook token to a tenant is a chicken-and-egg. ingest_role holds
-- SELECT on lead_sources (0001_ingest_role.sql:58) but its policy filters
-- `customer_id = current_ingest_customer_id()` — the value the lookup is trying
-- to produce. So resolution cannot happen inside withIngestScope.
--
-- The lazy alternative is to query as `postgres`, which DATABASE_URL connects
-- as. That works, but `postgres` owns these tables and ENABLE ROW LEVEL
-- SECURITY exempts the owner, so a bug in the pre-tenant path could read any
-- table in the schema.
--
-- Instead: a second NOBYPASSRLS role that can reach lead_sources and the rate
-- counters and NOTHING else. USING (true) on lead_sources is not a gap — seeing
-- every tenant's tokens IS the lookup. What matters is that the worst a bug here
-- can do is confirm whether a token exists, which the caller already knew.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resolver_role') THEN
    CREATE ROLE resolver_role NOBYPASSRLS NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO resolver_role;
--> statement-breakpoint

GRANT SELECT ON TABLE public.lead_sources TO resolver_role;
--> statement-breakpoint
CREATE POLICY "lead_sources_resolver_lookup" ON public.lead_sources
  AS PERMISSIVE FOR SELECT TO resolver_role
  USING (true);
--> statement-breakpoint

-- The counters are not tenant-scoped: the buckets that matter are charged before
-- a token resolves, so a customer_id would be null exactly when it is needed.
-- RLS is still enabled so the table is not readable by default, and authenticated
-- and anon are granted nothing — it holds no data an owner needs and none an
-- anonymous visitor may see.
ALTER TABLE public.ingest_rate_counters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- DELETE included deliberately: pruning runs inside ingest_admit, which is
-- SECURITY INVOKER, so the DELETE executes with this role's privileges. A role
-- that can already INSERT and UPDATE arbitrary counter rows gains nothing from
-- DELETE on the same table, so granting it is cheaper than a SECURITY DEFINER
-- function whose owner privileges would need their own argument.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ingest_rate_counters TO resolver_role;
--> statement-breakpoint
CREATE POLICY "ingest_rate_counters_resolver" ON public.ingest_rate_counters
  AS PERMISSIVE FOR ALL TO resolver_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- ── Rate accounting ───────────────────────────────────────────────────────
--
-- Returns true when this request is within `p_limit` for the current minute.
-- The row is incremented either way: a rejected request must still be charged,
-- or a caller past the limit gets free retries.
--
-- SECURITY INVOKER, like its caller — a DEFINER function owned by `postgres`
-- would run with the owner's privileges and make the grants above decorative.
CREATE OR REPLACE FUNCTION public.bump_rate_counter(p_bucket text, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_window timestamptz := date_trunc('minute', now());
  v_count  integer;
BEGIN
  INSERT INTO public.ingest_rate_counters AS c (bucket, window_start, count)
  VALUES (p_bucket, v_window, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET count = c.count + 1
  RETURNING c.count INTO v_count;

  RETURN v_count <= p_limit;
END
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.bump_rate_counter(text, integer) TO resolver_role;
--> statement-breakpoint

-- ── ingest_admit: the entire pre-tenant surface, in one statement ─────────
--
-- Token resolution and rate accounting together, so the handler cannot get the
-- order wrong and so the counter increment and the limit check cannot race
-- apart.
--
-- SECURITY INVOKER, deliberately not DEFINER: the privileges in effect are the
-- caller's — resolver_role's — which is what makes the narrow grant list above
-- an enforcement boundary rather than a convention.
CREATE OR REPLACE FUNCTION public.ingest_admit(p_token text, p_ip text)
RETURNS TABLE (
  customer_id uuid,
  source_id   uuid,
  token_state text,
  admit       boolean,
  retry_after integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_source_id   uuid;
  v_state       text := 'unknown';
  v_admit       boolean := true;
  v_retry       integer;
BEGIN
  -- Current token first. A string sitting in both columns (of the same row or
  -- different ones) must resolve as current, never as an expiring previous.
  SELECT s.customer_id, s.id INTO v_customer_id, v_source_id
  FROM public.lead_sources s
  WHERE s.webhook_token = p_token AND s.revoked_at IS NULL
  LIMIT 1;

  IF v_source_id IS NOT NULL THEN
    v_state := 'current';
  ELSE
    -- Previous token, inside the 72-hour overlap. Time-bounded rather than
    -- manual because a manual window never gets closed. A null
    -- token_rotated_at fails closed: the window's start is unknown, and an
    -- unbounded window is what the column exists to prevent.
    SELECT s.customer_id, s.id INTO v_customer_id, v_source_id
    FROM public.lead_sources s
    WHERE s.webhook_token_previous = p_token
      AND s.revoked_at IS NULL
      AND s.token_rotated_at IS NOT NULL
      AND s.token_rotated_at > now() - interval '72 hours'
    LIMIT 1;
    IF v_source_id IS NOT NULL THEN v_state := 'previous'; END IF;
  END IF;

  -- Seconds remaining in this minute. Every bucket shares the window, so one
  -- figure serves whichever limit tripped.
  v_retry := 60 - floor(extract(epoch FROM (now() - date_trunc('minute', now()))))::integer;
  IF v_retry < 1 THEN v_retry := 1; END IF;

  -- Coarse per-IP backstop on EVERY request, including the ones about to be
  -- rejected. 300/min is high enough never to bind on legitimate shared-egress
  -- traffic: Typeform posts for all of its customers from a handful of
  -- addresses, so a tight limit here would throttle our tenants for each
  -- other's volume.
  --
  -- A null p_ip (no x-forwarded-for — a local invocation) skips the IP buckets
  -- rather than keying on a placeholder every caller would share.
  IF p_ip IS NOT NULL AND p_ip <> '' THEN
    IF NOT public.bump_rate_counter('ip:' || p_ip, 300) THEN
      v_admit := false;
    END IF;
  END IF;

  IF v_state = 'unknown' THEN
    -- The scanner defence (PITFALLS.md:7). Charged only when the token does not
    -- resolve, so guessing is what costs quota.
    IF p_ip IS NOT NULL AND p_ip <> '' THEN
      IF NOT public.bump_rate_counter('unk:' || p_ip, 20) THEN
        v_admit := false;
      END IF;
    END IF;
  ELSE
    -- Per-source. A salon gets a handful of leads a day, so 60/min only ever
    -- catches a runaway integration loop.
    IF NOT public.bump_rate_counter('src:' || v_source_id::text, 60) THEN
      v_admit := false;
    END IF;
  END IF;

  -- Housekeeping on roughly 1% of calls. No cron job, no unbounded growth, and
  -- vercel.json's `crons` array stays empty until Phase 4.
  IF random() < 0.01 THEN
    DELETE FROM public.ingest_rate_counters
    WHERE window_start < now() - interval '2 hours';
  END IF;

  RETURN QUERY SELECT
    v_customer_id,
    v_source_id,
    v_state,
    v_admit,
    CASE WHEN v_admit THEN NULL::integer ELSE v_retry END;
END
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.ingest_admit(text, text) TO resolver_role;
--> statement-breakpoint

-- Allow the application role to assume resolver_role for the duration of the
-- lookup transaction. Without membership, SET ROLE fails with "permission
-- denied to set role". This widens nothing: resolver_role is NOLOGIN and
-- NOBYPASSRLS, so the privileges it can exercise are only those granted above.
GRANT resolver_role TO postgres;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT resolver_role TO service_role';
  END IF;
END
$$;