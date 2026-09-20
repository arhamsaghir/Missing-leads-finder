import { randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { leadEvents, leadSources } from '../schema/leads';

/**
 * Webhook source provisioning, token lifecycle, and the pre-tenant admission
 * wrapper.
 *
 * Token generation lives here rather than in `packages/core` for the same reason
 * `buildDedupeKey` does: it needs `node:crypto`, and core stays
 * dependency-free. That keeps this package Node-only — never import it into a
 * browser bundle.
 *
 * IMPORTANT — tenant scoping on this path is application code, not RLS. These
 * functions run as `postgres`, which owns the tables, and
 * `ENABLE ROW LEVEL SECURITY` exempts the owner. Every query below therefore
 * carries an explicit `customer_id = ...`, exactly as `api/me.ts:22` does. The
 * database is not enforcing it here; the `where` clause is.
 */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** `lead_events.kind` written on a delivery that used the demoted token. */
export const PREVIOUS_TOKEN_EVENT = 'webhook.previous_token_used';

export type TokenState = 'current' | 'previous' | 'unknown';

export interface AdmitResult {
  customerId: string | null;
  sourceId: string | null;
  tokenState: TokenState;
  admit: boolean;
  /** Seconds. Null unless `admit` is false. */
  retryAfter: number | null;
}

/**
 * 32 random bytes, base64url — 43 characters, url-safe with no padding.
 *
 * Stored in plaintext. The honest cost is that a database dump leaks live hook
 * URLs; accepted because the URL must be displayed back to the owner and a hash
 * cannot be, and because the worst outcome from a leaked hook URL is injected
 * junk leads, recoverable by one rotation.
 */
export function generateWebhookToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Resolve a token and charge the rate counters, in one round trip.
 *
 * Runs as `resolver_role` inside its own transaction, which commits *before* the
 * ingest write. That separation is deliberate: if the counters shared the ingest
 * transaction, a retry storm whose deliveries all deduped would roll its own
 * counters back and abuse would be free.
 *
 * The IP is trimmed, and a whitespace-only value is treated as absent. Necessary
 * because `ingest_admit` guards only `p_ip IS NOT NULL AND p_ip <> ''` and keys
 * the bucket on `'ip:' || p_ip` verbatim — so `"1.2.3.4 "` and `"1.2.3.4"` would
 * otherwise be two quotas for one client, and `"   "` a shared bucket for every
 * caller with a blank header. Hardening at this boundary rather than a live fix
 * on the webhook path: Task 5's `clientIp` already trims. The beneficiaries are
 * Phase 3's email path and any future caller.
 *
 * A MISSING ip (null, or blank after trimming) DELIBERATELY charges nothing —
 * `ingest_admit` skips both IP buckets, so an unresolvable token with no IP is
 * metered by nothing at all. This is an argued choice, not an oversight, and it
 * agrees with `0003_webhook_ingest.sql:162-163`: the alternative is a sentinel
 * such as `unk:no-ip`, which `<> ''` would accept and which would then be
 * charged on EVERY request that arrives without an IP, valid ones included. If
 * Vercel ever stopped setting `x-forwarded-for`, every tenant would share one
 * 300/min bucket — a global 429 at five requests a second. What the sentinel
 * buys is metering on unauthenticated guesses against a 43-character base64url
 * token: 32 random bytes, 256 bits, which is not guessable at any rate. Both the
 * threat and the mitigation's cost live in the same branch (Vercel's edge always
 * sets the header), and in that branch a bounded outage is the worse outcome.
 *
 * Residual exposure, stated plainly: a caller who can suppress the IP header can
 * probe tokens without consuming any quota. It costs them a round trip each and
 * buys them nothing against 256 bits of entropy, and the per-source bucket still
 * binds the moment a token does resolve.
 */
export async function admitWebhookDelivery(
  db: Db,
  token: string,
  ip: string | null,
): Promise<AdmitResult> {
  const normalizedIp = ip?.trim() ? ip.trim() : null;

  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`set local role resolver_role`);
    return tx.execute<{
      customer_id: string | null;
      source_id: string | null;
      token_state: TokenState;
      admit: boolean;
      retry_after: number | null;
    }>(sql`select * from public.ingest_admit(${token}, ${normalizedIp})`);
  });

  const row = rows[0];
  // A set-returning plpgsql function always yields exactly one row here, but a
  // missing row must not become a silent admit.
  if (!row) {
    return { customerId: null, sourceId: null, tokenState: 'unknown', admit: false, retryAfter: 1 };
  }
  return {
    customerId: row.customer_id,
    sourceId: row.source_id,
    tokenState: row.token_state,
    admit: row.admit,
    retryAfter: row.retry_after,
  };
}

export interface SourceStatus {
  id: string;
  label: string;
  kind: 'webhook' | 'email' | 'csv';
  /** Null once revoked. Returned in full otherwise — it is a URL the owner must
   *  copy, not a password. */
  webhookToken: string | null;
  createdAt: Date;
  revokedAt: Date | null;
  lastEventAt: Date | null;
  eventCount: number;
  leadCount: number;
  /** True when the demoted token has been used since the latest rotation. */
  previousTokenInUse: boolean;
  lastParseWarningAt: Date | null;
}

/**
 * Shape of one status row as Postgres returns it.
 *
 * A `type` alias, not an `interface`: `db.execute<T>` constrains `T` to
 * `Record<string, unknown>`, and an interface has no implicit index signature,
 * so an interface here fails with TS2344.
 */
type StatusRow = {
  id: string;
  label: string;
  kind: 'webhook' | 'email' | 'csv';
  webhook_token: string | null;
  // db.execute() runs raw SQL, and postgres.js hands timestamptz back over that
  // path as a text string, not a Date — unlike the ORM's typed query path. Typed
  // honestly here so toStatus is forced to coerce; otherwise SourceStatus claims
  // a Date it does not have and toResponse's .toISOString() throws.
  created_at: Date | string;
  revoked_at: Date | string | null;
  last_event_at: Date | string | null;
  event_count: string;
  lead_count: string;
  previous_token_in_use: boolean;
  last_parse_warning_at: Date | string | null;
};

/**
 * One row per source with its live counts.
 *
 * Scalar subqueries rather than joins plus GROUP BY: joining lead_events and
 * leads at once multiplies their rows together, which would report an event
 * count of 12 as 108 the moment a source has both. Each subquery is independent
 * and indexed on `(customer_id, ...)`.
 *
 * `count(*)` comes back as a bigint, which postgres.js hands over as a string —
 * hence the `Number()` in the mapper. Left as-is, `eventCount` would serialize
 * as "12" and the connection card would compare a string to a number.
 */
function statusSelect(customerId: string, sourceId?: string) {
  return sql`
    select
      s.id,
      s.label,
      s.kind,
      s.webhook_token,
      s.created_at,
      s.revoked_at,
      (select max(e.occurred_at) from public.lead_events e
         where e.customer_id = ${customerId} and e.source_id = s.id) as last_event_at,
      (select count(*) from public.lead_events e
         where e.customer_id = ${customerId} and e.source_id = s.id) as event_count,
      (select count(*) from public.leads l
         where l.customer_id = ${customerId} and l.source_id = s.id) as lead_count,
      exists (
        select 1 from public.lead_events e
        where e.customer_id = ${customerId}
          and e.source_id = s.id
          and e.kind = ${PREVIOUS_TOKEN_EVENT}
          -- Only since the latest rotation. Without this bound, one hit would
          -- light the "your old URL is still in use" alert permanently.
          --
          -- Bounded on created_at, NOT occurred_at, and the difference is
          -- load-bearing. occurred_at is caller-supplied — Task 5's
          -- recordPreviousTokenUse passes the handler's own new Date() — so
          -- comparing it against a database-stamped token_rotated_at straddles
          -- two clocks, and a host running even a millisecond behind makes a
          -- delivery that arrived AFTER the rotation look as though it preceded
          -- it. The alert then silently fails to light for the one customer whose
          -- form is about to break. created_at has no override path (default
          -- now(), never set by recordLeadEvent), so both sides of this
          -- comparison come from the database and the ordering is the real one:
          -- was this delivery recorded before or after the rotation.
          and s.token_rotated_at is not null
          and e.created_at >= s.token_rotated_at
      ) as previous_token_in_use,
      (select max(e.occurred_at) from public.lead_events e
         where e.customer_id = ${customerId}
           and e.source_id = s.id
           and jsonb_array_length(e.parse_warnings) > 0) as last_parse_warning_at
    from public.lead_sources s
    where s.customer_id = ${customerId}
      ${sourceId ? sql`and s.id = ${sourceId}` : sql``}
    order by s.created_at desc
  `;
}

/** Coerce a timestamptz that arrived from the raw-SQL path as text (see
 *  StatusRow) into the Date the SourceStatus contract promises. A value that is
 *  already a Date passes through unchanged. */
const asDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));
const asDateOrNull = (v: Date | string | null): Date | null => (v == null ? null : asDate(v));

function toStatus(row: StatusRow): SourceStatus {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    webhookToken: row.webhook_token,
    createdAt: asDate(row.created_at),
    revokedAt: asDateOrNull(row.revoked_at),
    lastEventAt: asDateOrNull(row.last_event_at),
    eventCount: Number(row.event_count),
    leadCount: Number(row.lead_count),
    previousTokenInUse: row.previous_token_in_use,
    lastParseWarningAt: asDateOrNull(row.last_parse_warning_at),
  };
}

export async function listSources(db: Db, customerId: string): Promise<SourceStatus[]> {
  const rows = await db.execute<StatusRow>(statusSelect(customerId));
  return rows.map(toStatus);
}

/**
 * One source, or null when the id is not this tenant's.
 *
 * Null covers both "does not exist" and "belongs to someone else", and the
 * caller cannot tell them apart — which is the point. `response.ts:14`: "not
 * found" and "not yours" must be indistinguishable, or the API is an enumeration
 * oracle.
 */
export async function getSource(
  db: Db,
  customerId: string,
  sourceId: string,
): Promise<SourceStatus | null> {
  const rows = await db.execute<StatusRow>(statusSelect(customerId, sourceId));
  const row = rows[0];
  return row ? toStatus(row) : null;
}

export async function createWebhookSource(
  db: Db,
  customerId: string,
  label: string,
): Promise<SourceStatus> {
  const [created] = await db
    .insert(leadSources)
    .values({ customerId, kind: 'webhook', label, webhookToken: generateWebhookToken() })
    .returning({ id: leadSources.id });

  // Read back through the same path a GET uses, so create and get can never
  // disagree about the shape they return.
  const status = await getSource(db, customerId, created!.id);
  return status!;
}

/**
 * Rotate: current token becomes previous, a new one is issued, and the moment is
 * stamped.
 *
 * The 72-hour overlap is enforced at lookup time in `ingest_admit` rather than by
 * a sweep, so there is nothing to schedule and nothing to forget.
 *
 * `isNull(revokedAt)` is load-bearing: `revokeSource` nulls both token columns so
 * the secret ceases to exist, and without this clause a revoke-then-rotate would
 * mint a fresh LIVE token onto a revoked row and hand it back in a SourceStatus —
 * a brand-new secret in an API response for a source its owner believes is dead.
 *
 * `token_rotated_at` is stamped from the DATABASE clock, not `new Date()`. Two
 * comparisons read it, and both would otherwise straddle two clocks:
 * `previous_token_in_use` above compares it against `lead_events.occurred_at`
 * (defaulted by Postgres), and `ingest_admit`'s 72-hour overlap compares it
 * against `now()`. A webhook delivery arriving in the skew window right after a
 * rotation would then be judged to precede that rotation, and the "your old URL
 * is still in use" alert would silently fail to light — measured here at a
 * sub-millisecond margin, with the host reliably ahead of the database, so it
 * failed roughly one time in ten locally and would be far worse across a real
 * network. Both timestamps must come from one clock; only the database's is
 * available to both.
 *
 * Known limitation, documented rather than engineered around: the previous
 * column is singular, so rotating twice inside 72 hours invalidates the original
 * token immediately.
 */
export async function rotateWebhookToken(
  db: Db,
  customerId: string,
  sourceId: string,
): Promise<SourceStatus | null> {
  const updated = await db
    .update(leadSources)
    .set({
      webhookToken: generateWebhookToken(),
      // Right-hand side of a SET renders as "lead_sources"."webhook_token" and
      // reads the OLD value, so this demotes in one statement.
      webhookTokenPrevious: sql`${leadSources.webhookToken}`,
      tokenRotatedAt: sql`now()`,
    })
    .where(
      and(
        eq(leadSources.id, sourceId),
        eq(leadSources.customerId, customerId),
        isNull(leadSources.revokedAt),
      ),
    )
    .returning({ id: leadSources.id });

  if (!updated[0]) return null;
  return getSource(db, customerId, sourceId);
}

/**
 * Revoke: stamp `revoked_at` and null BOTH token columns, so the secret ceases
 * to exist rather than merely being flagged.
 *
 * Never a hard delete — `leads.source_id` references this row
 * (`schema/leads.ts:72`), and destroying the row would orphan the leads it
 * explains.
 */
export async function revokeSource(
  db: Db,
  customerId: string,
  sourceId: string,
): Promise<boolean> {
  const updated = await db
    .update(leadSources)
    .set({ revokedAt: new Date(), webhookToken: null, webhookTokenPrevious: null })
    .where(and(eq(leadSources.id, sourceId), eq(leadSources.customerId, customerId)))
    .returning({ id: leadSources.id });
  return updated.length > 0;
}

/**
 * Has this exact delivery already been recorded?
 *
 * A cheap read that short-circuits the common retry case before any write, so a
 * redelivery never reaches the rollback path. Takes a `Tx` because it runs
 * inside the ingest transaction as `ingest_role`, which holds SELECT on
 * lead_events.
 *
 * The `customer_id` clause is not redundant with the dedupe key: the unique index
 * is on `(customer_id, dedupe_key)`, so the same key legitimately exists for two
 * tenants, and without it one tenant's retry would suppress another's real lead.
 */
export async function findExistingEvent(
  tx: Tx,
  customerId: string,
  dedupeKey: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: leadEvents.id })
    .from(leadEvents)
    .where(and(eq(leadEvents.customerId, customerId), eq(leadEvents.dedupeKey, dedupeKey)))
    .limit(1);
  return rows.length > 0;
}

