import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Tenant isolation — the acceptance gate for the multi-tenant foundation.
 *
 * Requires a local Supabase: `npx supabase start`.
 *
 * READ THIS BEFORE EDITING: every assertion below must run through a client
 * built with the ANON key plus a real user JWT. A service-role client bypasses
 * RLS entirely, so swapping the key in would make this whole file pass while
 * proving nothing at all.
 *
 * The suite is only meaningful if it can fail. `npm run test:prove-isolation`
 * loosens a policy to `using (true)` and asserts these tests go red.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const DB_URL =
  process.env.DATABASE_URL_DIRECT ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

interface Tenant {
  email: string;
  userId: string;
  customerId: string;
  /** Anon-key client carrying this user's JWT — subject to RLS. */
  client: SupabaseClient;
  leadIds: string[];
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(DB_URL, { prepare: false, max: 2 });

/** A unique suffix per run so repeated runs don't collide on email. */
const RUN = Date.now().toString(36);

async function createTenant(name: string, leadCount: number): Promise<Tenant> {
  const email = `${name}-${RUN}@isolation.test`;
  const password = 'test-password-1234';

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;
  const userId = created.user.id;

  const [customer] = await sql<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${userId}, ${`${name} Salon`})
    returning id
  `;
  const customerId = customer!.id;

  const leadIds: string[] = [];
  for (let i = 0; i < leadCount; i++) {
    const [lead] = await sql<{ id: string }[]>`
      insert into leads (customer_id, created_at, customer_name, email, source, status, estimated_value)
      values (${customerId}, now(), ${`${name} Lead ${i}`}, ${`lead${i}@${name}.test`},
              'Web', 'new', ${50000 + i})
      returning id
    `;
    leadIds.push(lead!.id);
  }

  await sql`insert into detection_settings (customer_id) values (${customerId})`;

  // Sign in as this user to get a real JWT, then bind it to an anon-key client.
  const authed = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await authed.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { email, userId, customerId, client: authed, leadIds };
}

let alice: Tenant;
let bob: Tenant;

beforeAll(async () => {
  alice = await createTenant('alice', 3);
  bob = await createTenant('bob', 2);
}, 60_000);

afterAll(async () => {
  for (const t of [alice, bob]) {
    if (!t) continue;
    await sql`delete from customers where id = ${t.customerId}`;
    await admin.auth.admin.deleteUser(t.userId);
  }
  await sql.end();
});

describe('tenant isolation', () => {
  it('seeded two distinct tenants', () => {
    expect(alice.customerId).not.toBe(bob.customerId);
    expect(alice.leadIds).toHaveLength(3);
    expect(bob.leadIds).toHaveLength(2);
  });

  it('each tenant reads only its own leads', async () => {
    const { data: aliceLeads, error: aErr } = await alice.client.from('leads').select('id, customer_id');
    expect(aErr).toBeNull();
    expect(aliceLeads).toHaveLength(3);
    expect(aliceLeads!.every((l) => l.customer_id === alice.customerId)).toBe(true);

    const { data: bobLeads, error: bErr } = await bob.client.from('leads').select('id, customer_id');
    expect(bErr).toBeNull();
    expect(bobLeads).toHaveLength(2);
    expect(bobLeads!.every((l) => l.customer_id === bob.customerId)).toBe(true);
  });

  it('asking for another tenant\'s lead by id returns empty, not an error', async () => {
    // RLS filters rather than rejecting — an error would leak that the row exists.
    const { data, error } = await alice.client
      .from('leads')
      .select('id')
      .eq('id', bob.leadIds[0]!);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('cannot insert a lead stamped with another tenant\'s customer_id', async () => {
    const { error } = await alice.client.from('leads').insert({
      customer_id: bob.customerId,
      created_at: new Date().toISOString(),
      customer_name: 'Injected',
      email: 'injected@evil.test',
    });
    // withCheck must reject this. Without it, tenants could plant rows.
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/policy/i);

    const [{ count }] = await sql<{ count: string }[]>`
      select count(*)::text as count from leads where customer_name = 'Injected'
    `;
    expect(count).toBe('0');
  });

  it('cannot update another tenant\'s lead', async () => {
    const { data } = await alice.client
      .from('leads')
      .update({ customer_name: 'Hijacked' })
      .eq('id', bob.leadIds[0]!)
      .select();
    expect(data ?? []).toEqual([]);

    const [row] = await sql<{ customer_name: string }[]>`
      select customer_name from leads where id = ${bob.leadIds[0]!}
    `;
    expect(row!.customer_name).not.toBe('Hijacked');
  });

  it('cannot delete another tenant\'s lead', async () => {
    await alice.client.from('leads').delete().eq('id', bob.leadIds[0]!);
    const [{ count }] = await sql<{ count: string }[]>`
      select count(*)::text as count from leads where id = ${bob.leadIds[0]!}
    `;
    expect(count).toBe('1');
  });

  it('customers table exposes only the signed-in owner', async () => {
    const { data, error } = await alice.client.from('customers').select('id, business_name');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.id).toBe(alice.customerId);
  });

  it.each(['lead_events', 'lead_identities', 'detection_settings', 'push_tokens'])(
    'isolates %s',
    async (table) => {
      const { data, error } = await alice.client.from(table).select('customer_id');
      expect(error).toBeNull();
      expect((data ?? []).every((r) => r.customer_id === alice.customerId)).toBe(true);
    },
  );

  it('detection_settings is visible to its owner and nobody else', async () => {
    const { data: mine } = await alice.client.from('detection_settings').select('customer_id, slow_reply_hours');
    expect(mine).toHaveLength(1);
    expect(mine![0]!.customer_id).toBe(alice.customerId);
    expect(mine![0]!.slow_reply_hours).toBe(24); // matches DEFAULT_DETECTION_CONFIG

    const { data: theirs } = await alice.client
      .from('detection_settings')
      .select('customer_id')
      .eq('customer_id', bob.customerId);
    expect(theirs).toEqual([]);
  });

  it('an anonymous client sees nothing at all', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await anon.from('leads').select('id');
    expect(data ?? []).toEqual([]);
  });
});

describe('ingest role', () => {
  it('is not permitted to bypass RLS', async () => {
    const [role] = await sql<{ rolbypassrls: boolean }[]>`
      select rolbypassrls from pg_roles where rolname = 'ingest_role'
    `;
    expect(role!.rolbypassrls).toBe(false);
  });

  it('writes nothing when app.customer_id is unset — fails closed', async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`set local role ingest_role`;
        await tx`insert into leads (customer_id, created_at, customer_name)
                 values (${alice.customerId}, now(), 'No GUC Set')`;
      }),
    ).rejects.toThrow();

    const [{ count }] = await sql<{ count: string }[]>`
      select count(*)::text as count from leads where customer_name = 'No GUC Set'
    `;
    expect(count).toBe('0');
  });

  it('writes only into the tenant named by app.customer_id', async () => {
    await sql.begin(async (tx) => {
      await tx`select set_config('app.customer_id', ${alice.customerId}, true)`;
      await tx`set local role ingest_role`;
      await tx`insert into leads (customer_id, created_at, customer_name)
               values (${alice.customerId}, now(), 'Ingested OK')`;
    });

    const [row] = await sql<{ customer_id: string }[]>`
      select customer_id from leads where customer_name = 'Ingested OK'
    `;
    expect(row!.customer_id).toBe(alice.customerId);
  });

  it('cannot write into a different tenant than the one it is scoped to', async () => {
    // The core guarantee: even with a valid customer_id in hand, a handler bug
    // (or a forged token resolving to the wrong tenant) cannot cross the line.
    await expect(
      sql.begin(async (tx) => {
        await tx`select set_config('app.customer_id', ${alice.customerId}, true)`;
        await tx`set local role ingest_role`;
        await tx`insert into leads (customer_id, created_at, customer_name)
                 values (${bob.customerId}, now(), 'Cross Tenant Ingest')`;
      }),
    ).rejects.toThrow();

    const [{ count }] = await sql<{ count: string }[]>`
      select count(*)::text as count from leads where customer_name = 'Cross Tenant Ingest'
    `;
    expect(count).toBe('0');
  });

  it('cannot read another tenant\'s leads', async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`select set_config('app.customer_id', ${alice.customerId}, true)`;
      await tx`set local role ingest_role`;
      return tx<{ id: string }[]>`select id from leads where customer_id = ${bob.customerId}`;
    });
    expect(rows).toEqual([]);
  });
});

describe('dedupe constraints', () => {
  it('rejects a duplicate webhook delivery via the event dedupe key', async () => {
    const key = `evt-${RUN}-dup`;
    await sql`insert into lead_events (customer_id, kind, dedupe_key)
              values (${alice.customerId}, 'ingested', ${key})`;
    await expect(
      sql`insert into lead_events (customer_id, kind, dedupe_key)
          values (${alice.customerId}, 'ingested', ${key})`,
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('allows the same dedupe key for a different tenant', async () => {
    const key = `evt-${RUN}-shared`;
    await sql`insert into lead_events (customer_id, kind, dedupe_key)
              values (${alice.customerId}, 'ingested', ${key})`;
    await expect(
      sql`insert into lead_events (customer_id, kind, dedupe_key)
          values (${bob.customerId}, 'ingested', ${key})`,
    ).resolves.toBeDefined();
  });

  it('rejects a second lead claiming the same normalized identity', async () => {
    const value = `sarah-${RUN}@salon.test`;
    await sql`insert into lead_identities (customer_id, lead_id, kind, value_normalized)
              values (${alice.customerId}, ${alice.leadIds[0]!}, 'email', ${value})`;
    // This is the double-counted-revenue guard: the same human arriving via a
    // second channel must not become a second lead.
    await expect(
      sql`insert into lead_identities (customer_id, lead_id, kind, value_normalized)
          values (${alice.customerId}, ${alice.leadIds[1]!}, 'email', ${value})`,
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('scopes identity uniqueness per tenant', async () => {
    const value = `shared-${RUN}@salon.test`;
    await sql`insert into lead_identities (customer_id, lead_id, kind, value_normalized)
              values (${alice.customerId}, ${alice.leadIds[0]!}, 'phone', ${value})`;
    // Two businesses can each have a lead with the same number — to them those
    // are different people.
    await expect(
      sql`insert into lead_identities (customer_id, lead_id, kind, value_normalized)
          values (${bob.customerId}, ${bob.leadIds[0]!}, 'phone', ${value})`,
    ).resolves.toBeDefined();
  });
});
