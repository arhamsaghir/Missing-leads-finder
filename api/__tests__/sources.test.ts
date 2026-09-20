import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The authenticated provisioning API. Requires `npx supabase start`.
 *
 * These handlers run as `postgres`, which owns the tables, so RLS does not
 * constrain them — tenant scoping is the explicit `where customer_id` inside the
 * repository. Every route therefore gets a cross-tenant case, and every one of
 * those asserts **404, never 403**: "not found" and "not yours" must be
 * indistinguishable from outside, or the API is an enumeration oracle
 * (`response.ts:14`).
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

let listHandler: (req: Request) => Promise<Response>;
let oneHandler: (req: Request) => Promise<Response>;
let rotateHandler: (req: Request) => Promise<Response>;
let hookHandler: (req: Request) => Promise<Response>;

const userIds: string[] = [];
let customerId: string;
let otherCustomerId: string;
let ownerToken: string;
let otherToken: string;

async function signUp(slug: string): Promise<{ userId: string; token: string }> {
  const email = `${slug}-${RUN}@provision.test`;
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
  // PUBLIC_APP_URL must be set before the modules initialise: webhookUrlFor
  // throws without it rather than emitting a relative URL an owner cannot paste.
  process.env.PUBLIC_APP_URL ??= 'https://app.test';

  ({ default: listHandler } = await import('../sources'));
  ({ default: oneHandler } = await import('../sources/[id]'));
  ({ default: rotateHandler } = await import('../sources/[id]/rotate'));
  ({ default: hookHandler } = await import('../hook/[token]'));

  const owner = await signUp('owner');
  ownerToken = owner.token;
  const [mine] = await sql<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${owner.userId}, 'Sunset Salon') returning id
  `;
  customerId = mine!.id;

  const other = await signUp('rival');
  otherToken = other.token;
  const [theirs] = await sql<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${other.userId}, 'Rival Salon') returning id
  `;
  otherCustomerId = theirs!.id;
}, 60_000);

afterAll(async () => {
  for (const id of [customerId, otherCustomerId].filter(Boolean)) {
    await sql`delete from customers where id = ${id}`;
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await sql`delete from ingest_rate_counters where bucket like ${`%${RUN}%`}`;
  await sql.end();
});

const authed = (path: string, token: string, init: RequestInit = {}) =>
  new Request(`https://example.test${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });

/** Create a source through the API and return its parsed body. */
async function create(token: string, label: string) {
  const res = await listHandler(
    authed('/api/sources', token, { method: 'POST', body: JSON.stringify({ label }) }),
  );
  expect(res.status).toBe(201);
  return res.json() as Promise<{ id: string; label: string; webhookUrl: string }>;
}

describe('POST /api/sources', () => {
  it('creates a webhook source and returns a pasteable URL', async () => {
    const body = await create(ownerToken, 'Website form');
    expect(body.label).toBe('Website form');
    expect(body.webhookUrl).toMatch(/^https:\/\/app\.test\/api\/hook\/[A-Za-z0-9_-]{43}$/);
  });

  it('returns the whole status shape the connection card consumes', async () => {
    const body = (await create(ownerToken, 'Full shape')) as unknown as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        'createdAt',
        'eventCount',
        'id',
        'kind',
        'label',
        'lastEventAt',
        'lastParseWarningAt',
        'leadCount',
        'previousTokenInUse',
        'revokedAt',
        'webhookUrl',
      ].sort(),
    );
    // Never the raw column — a caller must not have to build the URL itself.
    expect(body.webhookToken).toBeUndefined();
    expect(body.eventCount).toBe(0);
    expect(body.previousTokenInUse).toBe(false);
  });

  it('serializes timestamps as ISO strings, not Date objects', async () => {
    const body = (await create(ownerToken, 'Timestamps')) as unknown as Record<string, unknown>;
    expect(typeof body.createdAt).toBe('string');
    expect(new Date(body.createdAt as string).getUTCFullYear()).toBeGreaterThan(2020);
    expect(body.revokedAt).toBeNull();
  });

  it('the returned URL actually ingests', async () => {
    // The end-to-end claim of the whole phase: paste this URL, leads arrive.
    const body = await create(ownerToken, 'Live URL');
    const res = await hookHandler(
      new Request(body.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '30.0.0.1' },
        body: JSON.stringify({ id: `live-${RUN}`, email: `live-${RUN}@example.com`, name: 'Live Lead' }),
      }),
    );
    expect(res.status).toBe(200);
    const [lead] = await sql<{ customer_id: string }[]>`
      select customer_id from leads where email = ${`live-${RUN}@example.com`}
    `;
    expect(lead!.customer_id).toBe(customerId);
  });

  it.each([
    ['no label', {}],
    ['empty label', { label: '' }],
    ['whitespace label', { label: '   ' }],
    ['non-string label', { label: 42 }],
    ['over-long label', { label: 'x'.repeat(121) }],
  ])('400s on %s', async (_case, body) => {
    const res = await listHandler(
      authed('/api/sources', ownerToken, { method: 'POST', body: JSON.stringify(body) }),
    );
    expect(res.status).toBe(400);
  });

  it('400s an unparseable body', async () => {
    const res = await listHandler(
      authed('/api/sources', ownerToken, { method: 'POST', body: '{"label": ' }),
    );
    expect(res.status).toBe(400);
  });

  it('400s a kind this phase does not support', async () => {
    // Email sources are Phase 3. Silently creating a webhook instead would hand
    // the owner a URL when they asked for an address.
    const res = await listHandler(
      authed('/api/sources', ownerToken, {
        method: 'POST',
        body: JSON.stringify({ label: 'Inbox', kind: 'email' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('unsupported_kind');
  });

  it('stamps the row with the token holder\'s tenant', async () => {
    const body = await create(otherToken, 'Rival form');
    const [row] = await sql<{ customer_id: string }[]>`
      select customer_id from lead_sources where id = ${body.id}
    `;
    expect(row!.customer_id).toBe(otherCustomerId);
  });
});

describe('GET /api/sources', () => {
  it('lists only the caller\'s sources', async () => {
    await create(otherToken, 'Definitely theirs');
    const res = await listHandler(authed('/api/sources', ownerToken));
    expect(res.status).toBe(200);
    const { sources } = await res.json();
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.some((s: { label: string }) => s.label === 'Definitely theirs')).toBe(false);
  });

  it('returns an empty array for a tenant with no sources, not a 404', async () => {
    const fresh = await signUp('empty');
    const [row] = await sql<{ id: string }[]>`
      insert into customers (auth_user_id, business_name)
      values (${fresh.userId}, 'Empty Salon') returning id
    `;
    const res = await listHandler(authed('/api/sources', fresh.token));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sources: [] });
    await sql`delete from customers where id = ${row!.id}`;
  });

  it('405s an unsupported method with an Allow header', async () => {
    const res = await listHandler(authed('/api/sources', ownerToken, { method: 'PUT' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, POST');
  });
});

describe('GET /api/sources/[id]', () => {
  it('returns one source with live counts', async () => {
    const created = await create(ownerToken, 'Counted');
    await hookHandler(
      new Request(created.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '31.0.0.1' },
        body: JSON.stringify({ id: `c-${RUN}`, email: `c-${RUN}@example.com` }),
      }),
    );

    const res = await oneHandler(authed(`/api/sources/${created.id}`, ownerToken));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.eventCount).toBe(1);
    expect(body.leadCount).toBe(1);
    expect(body.lastEventAt).not.toBeNull();
  });

  it('reports previousTokenInUse after a delivery on the old URL', async () => {
    const created = await create(ownerToken, 'Old URL live');
    const oldUrl = created.webhookUrl;
    await rotateHandler(
      authed(`/api/sources/${created.id}/rotate`, ownerToken, { method: 'POST' }),
    );
    await hookHandler(
      new Request(oldUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '31.0.0.2' },
        body: JSON.stringify({ id: `old-${RUN}`, email: `old-${RUN}@example.com` }),
      }),
    );

    const res = await oneHandler(authed(`/api/sources/${created.id}`, ownerToken));
    const body = await res.json();
    // This is the whole point of the status endpoint: the owner's form is still
    // posting to a URL that stops working in under 72 hours.
    expect(body.previousTokenInUse).toBe(true);
  });

  it('404s another tenant\'s source id — never 403', async () => {
    const theirs = await create(otherToken, 'Private');
    const res = await oneHandler(authed(`/api/sources/${theirs.id}`, ownerToken));
    // 403 would confirm the id exists, which is the enumeration oracle
    // response.ts:14 exists to prevent.
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('404s a well-formed id that does not exist, with the same body', async () => {
    const missing = await oneHandler(
      authed('/api/sources/00000000-0000-0000-0000-000000000000', ownerToken),
    );
    const theirs = await create(otherToken, 'Indistinguishable');
    const notMine = await oneHandler(authed(`/api/sources/${theirs.id}`, ownerToken));

    expect(missing.status).toBe(notMine.status);
    expect(await missing.text()).toBe(await notMine.text());
  });

  it('404s a malformed id rather than surfacing a database error', async () => {
    // A non-uuid reaches Postgres as `invalid input syntax for type uuid`, which
    // is a 500 and leaks the column type.
    const res = await oneHandler(authed('/api/sources/not-a-uuid', ownerToken));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/sources/[id]', () => {
  it('revokes, nulls the URL, and kills the token', async () => {
    const created = await create(ownerToken, 'To revoke');
    const url = created.webhookUrl;

    const res = await oneHandler(
      authed(`/api/sources/${created.id}`, ownerToken, { method: 'DELETE' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revokedAt).not.toBeNull();
    expect(body.webhookUrl).toBeNull();

    const posted = await hookHandler(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '32.0.0.1' },
        body: JSON.stringify({ email: `dead-${RUN}@example.com` }),
      }),
    );
    expect(posted.status).toBe(404);
  });

  it('404s another tenant\'s source and leaves it live', async () => {
    const theirs = await create(otherToken, 'Not yours to kill');
    const res = await oneHandler(
      authed(`/api/sources/${theirs.id}`, ownerToken, { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);

    const [row] = await sql<{ revoked_at: Date | null }[]>`
      select revoked_at from lead_sources where id = ${theirs.id}
    `;
    expect(row!.revoked_at).toBeNull();
  });

  it('405s an unsupported method', async () => {
    const created = await create(ownerToken, 'Method check');
    const res = await oneHandler(
      authed(`/api/sources/${created.id}`, ownerToken, { method: 'PATCH' }),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, DELETE');
  });
});

describe('POST /api/sources/[id]/rotate', () => {
  it('returns a new URL and keeps the old one working', async () => {
    const created = await create(ownerToken, 'Rotating');
    const res = await rotateHandler(
      authed(`/api/sources/${created.id}/rotate`, ownerToken, { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.webhookUrl).not.toBe(created.webhookUrl);
    expect(body.webhookUrl).toMatch(/^https:\/\/app\.test\/api\/hook\/[A-Za-z0-9_-]{43}$/);

    for (const url of [body.webhookUrl, created.webhookUrl]) {
      const posted = await hookHandler(
        new Request(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': '33.0.0.1' },
          body: JSON.stringify({ id: `rot-${RUN}-${url.slice(-6)}`, email: `rot-${url.slice(-6)}@example.com` }),
        }),
      );
      expect(posted.status).toBe(200);
    }
  });

  it('404s another tenant\'s source and does not rotate it', async () => {
    const theirs = await create(otherToken, 'Leave mine alone');
    const res = await rotateHandler(
      authed(`/api/sources/${theirs.id}/rotate`, ownerToken, { method: 'POST' }),
    );
    expect(res.status).toBe(404);

    const still = await oneHandler(authed(`/api/sources/${theirs.id}`, otherToken));
    expect((await still.json()).webhookUrl).toBe(theirs.webhookUrl);
  });

  it('404s a revoked source — there is nothing left to rotate', async () => {
    const created = await create(ownerToken, 'Revoked then rotated');
    await oneHandler(authed(`/api/sources/${created.id}`, ownerToken, { method: 'DELETE' }));
    const res = await rotateHandler(
      authed(`/api/sources/${created.id}/rotate`, ownerToken, { method: 'POST' }),
    );
    expect(res.status).toBe(404);
  });

  it('405s a GET', async () => {
    const created = await create(ownerToken, 'Rotate method');
    const res = await rotateHandler(authed(`/api/sources/${created.id}/rotate`, ownerToken));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
});

describe('auth on every provisioning route', () => {
  /** The five routes, and which handler serves each. */
  const ROUTES: Array<[string, string, string]> = [
    ['list', '/api/sources', 'GET'],
    ['create', '/api/sources', 'POST'],
    ['get one', '/api/sources/00000000-0000-0000-0000-000000000000', 'GET'],
    ['revoke', '/api/sources/00000000-0000-0000-0000-000000000000', 'DELETE'],
    ['rotate', '/api/sources/00000000-0000-0000-0000-000000000000/rotate', 'POST'],
  ];

  const handlerFor = (path: string) =>
    path.endsWith('/rotate') ? rotateHandler : path === '/api/sources' ? listHandler : oneHandler;

  it.each(ROUTES)('%s 401s with no Authorization header', async (_name, path, method) => {
    const res = await handlerFor(path)(
      new Request(`https://example.test${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({ label: 'x' }) } : {}),
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('missing_token');
  });

  it.each(ROUTES)('%s 401s on a garbage token', async (_name, path, method) => {
    const res = await handlerFor(path)(
      authed(path, 'garbage.garbage.garbage', {
        method,
        ...(method === 'POST' ? { body: JSON.stringify({ label: 'x' }) } : {}),
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('invalid_token');
  });

  it.each(ROUTES)('%s rejects auth BEFORE touching the database', async (_name, path, method) => {
    // Order matters: a route that resolved the id first would 404 an unauthorized
    // caller, telling them the id does not exist. Auth failures must win.
    const res = await handlerFor(path)(
      authed(path, 'garbage.garbage.garbage', {
        method,
        ...(method === 'POST' ? { body: JSON.stringify({ label: 'x' }) } : {}),
      }),
    );
    expect(res.status).not.toBe(404);
  });

  it('403s a valid token whose user has no customer row, and creates nothing', async () => {
    const orphan = await signUp('orphan');
    const res = await listHandler(
      authed('/api/sources', orphan.token, {
        method: 'POST',
        body: JSON.stringify({ label: 'Should not exist' }),
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('no_customer');

    const rows = await sql`select 1 from lead_sources where label = 'Should not exist'`;
    expect(rows).toHaveLength(0);
  });

  it('never echoes a token into an error body', async () => {
    const res = await listHandler(authed('/api/sources', 'garbage.garbage.garbage'));
    expect(await res.text()).not.toContain('garbage');
  });
});
