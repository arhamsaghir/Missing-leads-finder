import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * API integration tests. Requires `npx supabase start`.
 *
 * Handlers are invoked directly with real `Request` objects rather than through
 * `vercel dev`, so these run in CI without the Vercel runtime. JWT verification
 * is genuine — local Supabase serves an ES256 JWKS, the same asymmetric scheme
 * as production, so nothing here is stubbed.
 *
 * Env is loaded by vitest.config.ts before the handlers' modules initialise.
 */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB_URL = process.env.DATABASE_URL_DIRECT!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(DB_URL, { prepare: false, max: 2 });
const RUN = Date.now().toString(36);

/** Imported lazily so env vars are set before module init. */
let healthHandler: (req: Request) => Promise<Response>;
let meHandler: (req: Request) => Promise<Response>;

const userIds: string[] = [];
let customerId: string;
let ownerToken: string;
/** A real, verifiable token whose user has no customers row. */
let orphanToken: string;

async function signUp(slug: string): Promise<{ userId: string; token: string }> {
  const email = `${slug}-${RUN}@api.test`;
  const password = 'test-password-1234';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  return { userId: data.user.id, token: session.session!.access_token };
}

beforeAll(async () => {
  ({ default: healthHandler } = await import('../health'));
  ({ default: meHandler } = await import('../me'));

  const owner = await signUp('owner');
  ownerToken = owner.token;
  const [row] = await sql<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${owner.userId}, 'Sunset Salon') returning id
  `;
  customerId = row!.id;
  await sql`insert into detection_settings (customer_id, slow_reply_hours) values (${customerId}, 12)`;

  // Verifiable token, deliberately no customers row.
  ({ token: orphanToken } = await signUp('orphan'));
}, 60_000);

afterAll(async () => {
  if (customerId) await sql`delete from customers where id = ${customerId}`;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await sql.end();
});

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://example.test${path}`, { headers });

describe('GET /api/health', () => {
  it('reports the database is reachable', async () => {
    const res = await healthHandler(get('/api/health'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, database: 'reachable' });
  });

  it('rejects non-GET with an Allow header', async () => {
    const res = await healthHandler(
      new Request('https://example.test/api/health', { method: 'POST' }),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });
});

describe('GET /api/me', () => {
  it('401s with no Authorization header', async () => {
    const res = await meHandler(get('/api/me'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('missing_token');
  });

  it.each([
    ['not a bearer scheme', { authorization: `Basic ${Buffer.from('a:b').toString('base64')}` }],
    ['bearer with no token', { authorization: 'Bearer' }],
    ['empty bearer', { authorization: 'Bearer ' }],
  ])('401s on %s', async (_label, headers) => {
    const res = await meHandler(get('/api/me', headers));
    expect(res.status).toBe(401);
  });

  it('401s on a structurally valid but unsigned token', async () => {
    const forged = [
      Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000000' })).toString('base64url'),
      'not-a-real-signature',
    ].join('.');
    const res = await meHandler(get('/api/me', { authorization: `Bearer ${forged}` }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('invalid_token');
  });

  it('does not leak why a token was rejected', async () => {
    const res = await meHandler(get('/api/me', { authorization: 'Bearer garbage.garbage.garbage' }));
    const body = await res.json();
    // Expired vs malformed vs wrong-signature are all just "invalid".
    expect(body.error.code).toBe('invalid_token');
    expect(JSON.stringify(body)).not.toMatch(/signature|expired|malformed|jwks/i);
  });

  it('403s for a valid token whose user has no customer — never auto-provisions', async () => {
    const res = await meHandler(get('/api/me', { authorization: `Bearer ${orphanToken}` }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('no_customer');

    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count from customers
      where auth_user_id = (select id from auth.users where email like ${`orphan-${RUN}%`})
    `;
    expect(rows[0]?.count).toBe('0');
  });

  it('resolves a real session to its tenant', async () => {
    const res = await meHandler(get('/api/me', { authorization: `Bearer ${ownerToken}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customerId).toBe(customerId);
    expect(body.businessName).toBe('Sunset Salon');
    expect(body.detectionSettings.slowReplyHours).toBe(12);
  });

  it('returns the tenant of the token holder, not of anyone else', async () => {
    const other = await signUp('other');
    const [row] = await sql<{ id: string }[]>`
      insert into customers (auth_user_id, business_name)
      values (${other.userId}, 'Rival Salon') returning id
    `;
    const res = await meHandler(get('/api/me', { authorization: `Bearer ${other.token}` }));
    const body = await res.json();
    expect(body.customerId).toBe(row!.id);
    expect(body.customerId).not.toBe(customerId);
    expect(body.businessName).toBe('Rival Salon');
    await sql`delete from customers where id = ${row!.id}`;
  });

  it('rejects non-GET', async () => {
    const res = await meHandler(new Request('https://example.test/api/me', { method: 'DELETE' }));
    expect(res.status).toBe(405);
  });
});
