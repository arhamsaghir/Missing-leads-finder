import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * resolver_role — the pre-tenant boundary. Requires `npx supabase start`.
 *
 * Resolving a token to a tenant cannot happen inside withIngestScope: the
 * lead_sources policy filters on the customer_id the lookup is trying to
 * produce (0001_ingest_role.sql:62). Running it as `postgres` would work but
 * `postgres` owns the tables and ENABLE ROW LEVEL SECURITY exempts the owner, so
 * a bug in the pre-tenant path could read anything.
 *
 * Hence a second narrow role. Every assertion below exists to prove the narrow
 * grant list is real enforcement rather than a convention someone can drift away
 * from — most of this file asserts what the role CANNOT do.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const DB_URL =
  process.env.DATABASE_URL_DIRECT ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(DB_URL, { prepare: false, max: 2 });
/**
 * Rate-limit buckets are GLOBAL and outlive a single suite run — they are keyed
 * on a string, not scoped to a tenant or a transaction, and only pruned after
 * two hours. So every bucket a test charges must carry RUN, including the IP
 * octets below: `ingest_admit(p_token, p_ip)` takes p_ip as text and never
 * parses it as an address, so `10.0.0.${RUN}` is a legal per-run key.
 *
 * Do not key on something derived, e.g. `RUN.length` — that is the constant 8
 * until 2059, so consecutive runs share `10.0.0.8`, the second run starts at the
 * 20/min unk: limit already spent, and the afterAll `like '%RUN%'` cleanup
 * matches nothing.
 */
const RUN = Date.now().toString(36);

const userIds: string[] = [];
let customerId: string;
let otherCustomerId: string;
let sourceId: string;
let otherSourceId: string;
let currentToken: string;
let otherToken: string;

/**
 * customers.auth_user_id has a real FK to auth.users
 * (0000_initial_multitenant_schema.sql:101), so a bare uuid will not insert.
 * Create the auth user first, exactly as ingest.test.ts does.
 */
async function seedTenant(
  slug: string,
): Promise<{ customerId: string; sourceId: string; token: string }> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${slug}-${RUN}@resolver.test`,
    password: 'test-password-1234',
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);

  const [customer] = await sql<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${data.user.id}, ${`${slug} Salon`}) returning id
  `;
  const token = `tok-${slug}-${RUN}`;
  const [source] = await sql<{ id: string }[]>`
    insert into lead_sources (customer_id, kind, label, webhook_token)
    values (${customer!.id}, 'webhook', 'Website form', ${token}) returning id
  `;
  return { customerId: customer!.id, sourceId: source!.id, token };
}

beforeAll(async () => {
  const mine = await seedTenant('resolver');
  const theirs = await seedTenant('rival');
  customerId = mine.customerId;
  sourceId = mine.sourceId;
  currentToken = mine.token;
  otherCustomerId = theirs.customerId;
  otherSourceId = theirs.sourceId;
  otherToken = theirs.token;
}, 60_000);

afterAll(async () => {
  for (const id of [customerId, otherCustomerId].filter(Boolean)) {
    await sql`delete from customers where id = ${id}`;
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await sql`delete from ingest_rate_counters where bucket like ${`%${RUN}%`}`;
  await sql.end();
});

/** Run `fn` as resolver_role, the way the handler will. */
function asResolver<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`set local role resolver_role`;
    // Prove the role actually took effect before running the caller's query.
    //
    // Without this, every negative control below is a test that cannot fail in
    // the way that matters: `set local role` itself fails with "permission
    // denied to set role resolver_role" when the GRANT is missing, and that
    // string matches the /permission denied/i these tests assert. So they would
    // go green while never once running as the role — including before the role
    // existed at all. Asserting current_user turns a lost GRANT into a loud
    // failure instead of eight silent false passes.
    const [who] = await tx<{ current_user: string }[]>`select current_user`;
    if (who?.current_user !== 'resolver_role') {
      throw new Error(`expected to be running as resolver_role, got ${who?.current_user}`);
    }
    return fn(tx);
  }) as Promise<T>;
}

interface AdmitRow {
  customer_id: string | null;
  source_id: string | null;
  token_state: 'current' | 'previous' | 'unknown';
  admit: boolean;
  retry_after: number | null;
}

const admit = (token: string, ip: string | null) =>
  asResolver(async (tx) => {
    const rows = await tx<AdmitRow[]>`select * from public.ingest_admit(${token}, ${ip})`;
    return rows[0]!;
  });

describe('resolver_role — what it cannot reach', () => {
  it('is not permitted to bypass RLS', async () => {
    const [role] = await sql<{ rolbypassrls: boolean }[]>`
      select rolbypassrls from pg_roles where rolname = 'resolver_role'
    `;
    expect(role!.rolbypassrls).toBe(false);
  });

  it.each(['leads', 'customers', 'lead_events', 'lead_identities', 'detection_settings', 'push_tokens'])(
    'cannot select from %s at all',
    async (table) => {
      // Not "returns no rows" — that is what a policy does. This must be a
      // privilege error, because the role holds no grant on these tables.
      //
      // `for table` is load-bearing, not decoration. A bare /permission denied/i
      // also matches "permission denied to set role resolver_role", which is what
      // `set local role` raises when the GRANT is missing — and that throw happens
      // before asResolver's current_user guard can run, so the bare matcher would
      // stay green while the suite never ran as the role at all. The live text
      // here is "permission denied for table leads".
      const attempt = asResolver((tx) => tx.unsafe(`select * from public.${table} limit 1`));
      await expect(attempt).rejects.toThrow(/permission denied for table/i);
    },
  );

  it('cannot insert, update, or delete a lead_source', async () => {
    // SELECT only. Issuing and revoking tokens is the provisioning path's job,
    // which runs authenticated as `postgres` — not this role's.
    await expect(
      asResolver((tx) => tx`update lead_sources set label = 'hijacked' where id = ${sourceId}`),
    ).rejects.toThrow(/permission denied for table/i);
    await expect(
      asResolver((tx) => tx`delete from lead_sources where id = ${sourceId}`),
    ).rejects.toThrow(/permission denied for table/i);
  });

  it.each(['ingest_admit', 'bump_rate_counter'])(
    '%s is SECURITY INVOKER with a pinned search_path, not DEFINER',
    async (fnName) => {
      // A DEFINER function owned by postgres would execute with the owner's
      // privileges, which would make every grant assertion above meaningless.
      // bump_rate_counter is checked too: it is where the counter writes happen,
      // so flipping it to DEFINER would hand any caller of ingest_admit write
      // access to the counters regardless of their own grants.
      //
      // proconfig pins search_path to '': these functions are reachable from a
      // public endpoint, and an unpinned search_path on such a function is a
      // privilege-escalation vector.
      const [fn] = await sql<{ prosecdef: boolean; proconfig: string[] | null }[]>`
        select prosecdef, proconfig from pg_proc
        where proname = ${fnName} and pronamespace = 'public'::regnamespace
      `;
      expect(fn!.prosecdef).toBe(false);
      expect(fn!.proconfig).toEqual(['search_path=""']);
    },
  );

  it('can see every tenant\'s tokens — that IS the lookup', async () => {
    // USING (true) on lead_sources is not a gap. The worst a bug on this path
    // can do is confirm whether a token exists, which a caller already knew.
    const rows = await asResolver(
      (tx) => tx<{ id: string }[]>`select id from lead_sources where webhook_token is not null`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ingest_admit — token resolution', () => {
  it('resolves a current token to its tenant', async () => {
    const row = await admit(currentToken, `1.1.1.${RUN}`);
    expect(row.customer_id).toBe(customerId);
    expect(row.source_id).toBe(sourceId);
    expect(row.token_state).toBe('current');
    expect(row.admit).toBe(true);
    expect(row.retry_after).toBeNull();
  });

  it('returns unknown for a token that does not exist', async () => {
    const row = await admit(`no-such-token-${RUN}`, `2.2.2.${RUN}`);
    expect(row.customer_id).toBeNull();
    expect(row.source_id).toBeNull();
    expect(row.token_state).toBe('unknown');
    expect(row.admit).toBe(true); // under the limit; the handler turns this into 404
  });

  it('never resolves one tenant\'s token to another tenant', async () => {
    const mine = await admit(currentToken, `3.3.3.${RUN}`);
    const theirs = await admit(otherToken, `3.3.3.${RUN}`);
    expect(mine.customer_id).toBe(customerId);
    expect(theirs.customer_id).toBe(otherCustomerId);
    expect(theirs.customer_id).not.toBe(mine.customer_id);
    expect(theirs.source_id).toBe(otherSourceId);
  });

  it('treats a revoked source as unknown even with the old token string', async () => {
    const seeded = await seedTenant('revoked');
    await sql`
      update lead_sources
      set revoked_at = now(), webhook_token = null, webhook_token_previous = null
      where id = ${seeded.sourceId}
    `;
    const row = await admit(seeded.token, `4.4.4.${RUN}`);
    expect(row.token_state).toBe('unknown');
    expect(row.customer_id).toBeNull();
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('is case-sensitive and does not match a prefix', async () => {
    expect((await admit(currentToken.toUpperCase(), `5.5.5.${RUN}`)).token_state).toBe('unknown');
    expect((await admit(currentToken.slice(0, -1), `5.5.5.${RUN}`)).token_state).toBe('unknown');
  });
});

describe('ingest_admit — the rotation overlap window', () => {
  it('accepts a previous token inside 72 hours and reports it', async () => {
    const seeded = await seedTenant('rotated-fresh');
    await sql`
      update lead_sources
      set webhook_token = ${`${seeded.token}-new`},
          webhook_token_previous = ${seeded.token},
          token_rotated_at = now() - interval '71 hours'
      where id = ${seeded.sourceId}
    `;
    const row = await admit(seeded.token, `6.6.6.${RUN}`);
    // The lead is still ingested — a rotation must not silently drop real leads.
    expect(row.customer_id).toBe(seeded.customerId);
    expect(row.token_state).toBe('previous');
    expect(row.admit).toBe(true);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('rejects a previous token past 72 hours', async () => {
    const seeded = await seedTenant('rotated-stale');
    await sql`
      update lead_sources
      set webhook_token = ${`${seeded.token}-new`},
          webhook_token_previous = ${seeded.token},
          token_rotated_at = now() - interval '73 hours'
      where id = ${seeded.sourceId}
    `;
    const row = await admit(seeded.token, `7.7.7.${RUN}`);
    expect(row.token_state).toBe('unknown');
    expect(row.customer_id).toBeNull();
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('rejects a previous token when token_rotated_at was never stamped', async () => {
    // Fails closed. A null timestamp means the window's start is unknown, and an
    // unbounded window is exactly what the column exists to prevent.
    const seeded = await seedTenant('rotated-null');
    await sql`
      update lead_sources
      set webhook_token = ${`${seeded.token}-new`},
          webhook_token_previous = ${seeded.token},
          token_rotated_at = null
      where id = ${seeded.sourceId}
    `;
    const row = await admit(seeded.token, `8.8.8.${RUN}`);
    expect(row.token_state).toBe('unknown');
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('prefers the current token when a string somehow sits in both columns', async () => {
    const seeded = await seedTenant('both-columns');
    // The SAME string in both columns, with a rotation stamp far outside the 72h
    // overlap. Writing a *different* value to webhook_token_previous would make
    // this a duplicate of the happy path: it would pass even if the current/
    // previous lookup order were inverted, which is the one thing it exists to
    // pin. With one string in both columns and a stale stamp, an inverted order
    // resolves 'unknown' (the previous branch rejects on age) and this fails.
    await sql`
      update lead_sources set webhook_token_previous = ${seeded.token},
        token_rotated_at = now() - interval '100 hours' where id = ${seeded.sourceId}
    `;
    expect((await admit(seeded.token, `9.9.9.${RUN}`)).token_state).toBe('current');
    await sql`delete from customers where id = ${seeded.customerId}`;
  });
});

describe('ingest_admit — rate limiting', () => {
  /** Charge one bucket N times and return the last row. */
  async function hammer(token: string, ip: string | null, times: number): Promise<AdmitRow> {
    let last!: AdmitRow;
    for (let i = 0; i < times; i++) last = await admit(token, ip);
    return last;
  }

  it('admits 60 deliveries a minute per source and refuses the 61st', async () => {
    const seeded = await seedTenant('rate-src');
    const ok = await hammer(seeded.token, null, 60);
    expect(ok.admit).toBe(true);

    const over = await admit(seeded.token, null);
    expect(over.admit).toBe(false);
    expect(over.retry_after).toBeGreaterThan(0);
    expect(over.retry_after).toBeLessThanOrEqual(60);
    // Still resolves — the handler needs the tenant to decide 429 vs 404.
    expect(over.customer_id).toBe(seeded.customerId);
    expect(over.token_state).toBe('current');

    await sql`delete from customers where id = ${seeded.customerId}`;
  }, 60_000);

  it('charges unknown tokens to a tighter per-IP bucket — the scanner defence', async () => {
    const ip = `10.0.0.${RUN}`;
    const ok = await hammer(`scan-${RUN}`, ip, 20);
    expect(ok.admit).toBe(true);
    const over = await admit(`scan-${RUN}-other`, ip);
    // A different guessed token, same IP: the bucket is the IP, not the token.
    expect(over.admit).toBe(false);
    expect(over.token_state).toBe('unknown');
    expect(over.retry_after).toBeGreaterThan(0);
  }, 60_000);

  it('does not let one IP\'s scanning block another IP', async () => {
    const noisy = `10.1.0.${RUN}`;
    await hammer(`noisy-${RUN}`, noisy, 21);
    expect((await admit(`quiet-${RUN}`, `10.1.1.${RUN}`)).admit).toBe(true);
  }, 60_000);

  it('does not charge the unknown bucket when the token resolves', async () => {
    // Typeform posts for every one of its customers from a handful of egress
    // addresses. Charging valid traffic to a 20/min IP bucket would throttle our
    // tenants for each other's volume.
    const seeded = await seedTenant('shared-egress');
    const ip = `10.2.0.${RUN}`;
    await hammer(seeded.token, ip, 25);
    const [row] = await sql<{ count: number }[]>`
      select count from ingest_rate_counters
      where bucket = ${`unk:${ip}`} and window_start = date_trunc('minute', now())
    `;
    expect(row).toBeUndefined();
    await sql`delete from customers where id = ${seeded.customerId}`;
  }, 60_000);

  it('skips IP buckets entirely when no IP is supplied', async () => {
    // A missing x-forwarded-for must not key every caller onto one shared
    // placeholder bucket, which would make one local invocation throttle
    // production.
    const before = await sql<{ bucket: string }[]>`
      select bucket from ingest_rate_counters where bucket in ('ip:', 'unk:', 'ip:null', 'unk:null')
    `;
    await admit(`no-ip-${RUN}`, null);
    const after = await sql<{ bucket: string }[]>`
      select bucket from ingest_rate_counters where bucket in ('ip:', 'unk:', 'ip:null', 'unk:null')
    `;
    expect(after.length).toBe(before.length);
  });

  it('counts in one-minute windows keyed on date_trunc', async () => {
    const seeded = await seedTenant('window-key');
    await admit(seeded.token, null);
    const rows = await sql<{ window_start: Date; count: number }[]>`
      select window_start, count from ingest_rate_counters
      where bucket = ${`src:${seeded.sourceId}`}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.window_start.getSeconds()).toBe(0);
    expect(rows[0]!.window_start.getMilliseconds()).toBe(0);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('a fresh window starts the count over', async () => {
    const seeded = await seedTenant('window-roll');
    // Backdate a full bucket into the previous minute; this minute must be clear.
    await sql`
      insert into ingest_rate_counters (bucket, window_start, count)
      values (${`src:${seeded.sourceId}`}, date_trunc('minute', now()) - interval '1 minute', 60)
    `;
    expect((await admit(seeded.token, null)).admit).toBe(true);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('charges the counter even when the delivery is over the limit', async () => {
    // The counters commit with transaction 1, separately from the ingest write.
    // If they shared the ingest transaction, a retry storm whose deliveries all
    // deduped would roll its own counters back and abuse would be free.
    const seeded = await seedTenant('charge-on-reject');
    await sql`
      insert into ingest_rate_counters (bucket, window_start, count)
      values (${`src:${seeded.sourceId}`}, date_trunc('minute', now()), 60)
    `;
    await admit(seeded.token, null);
    const [row] = await sql<{ count: number }[]>`
      select count from ingest_rate_counters
      where bucket = ${`src:${seeded.sourceId}`} and window_start = date_trunc('minute', now())
    `;
    expect(row!.count).toBe(61);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('prunes rows older than two hours', async () => {
    // Pruning fires on ~1% of calls, so drive it directly rather than gambling.
    const stale = `stale-${RUN}`;
    await sql`
      insert into ingest_rate_counters (bucket, window_start, count)
      values (${stale}, now() - interval '3 hours', 1)
    `;
    await asResolver(
      (tx) => tx`delete from ingest_rate_counters where window_start < now() - interval '2 hours'`,
    );
    const rows = await sql`select 1 from ingest_rate_counters where bucket = ${stale}`;
    expect(rows).toHaveLength(0);
  });
});
