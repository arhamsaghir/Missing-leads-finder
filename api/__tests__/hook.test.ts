import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The public ingest endpoint, end to end. Requires `npx supabase start`.
 *
 * Handlers are invoked directly with real `Request` objects rather than through
 * `vercel dev`, following api/__tests__/endpoints.test.ts, so this runs in CI
 * without the Vercel runtime. The token is read from the URL path, which is what
 * Vercel's [token] segment resolves to — so a direct invocation and a real
 * deployment take the same code path.
 */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB_URL = process.env.DATABASE_URL_DIRECT!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(DB_URL, { prepare: false, max: 2 });
const RUN = Date.now().toString(36);

/** Imported lazily so env vars are set before module init. */
let hookHandler: (req: Request) => Promise<Response>;

const userIds: string[] = [];
let customerId: string;
let otherCustomerId: string;
let sourceId: string;
let token: string;

async function seedTenant(slug: string): Promise<{ customerId: string; sourceId: string; token: string }> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${slug}-${RUN}@hook.test`,
    password: 'test-password-1234',
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);

  const [customer] = await sql<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${data.user.id}, ${`${slug} Salon`}) returning id
  `;
  const tok = `hooktok-${slug}-${RUN}`;
  const [source] = await sql<{ id: string }[]>`
    insert into lead_sources (customer_id, kind, label, webhook_token)
    values (${customer!.id}, 'webhook', 'Website form', ${tok}) returning id
  `;
  return { customerId: customer!.id, sourceId: source!.id, token: tok };
}

beforeAll(async () => {
  ({ default: hookHandler } = await import('../hook/[token]'));
  const mine = await seedTenant('owner');
  customerId = mine.customerId;
  sourceId = mine.sourceId;
  token = mine.token;
  ({ customerId: otherCustomerId } = await seedTenant('rival'));
}, 60_000);

afterAll(async () => {
  for (const id of [customerId, otherCustomerId].filter(Boolean)) {
    await sql`delete from customers where id = ${id}`;
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await sql`delete from ingest_rate_counters where bucket like ${`%${RUN}%`}`;
  await sql.end();
});

/** A POST shaped the way a form tool sends one. */
function post(
  tok: string,
  body: unknown,
  init: { contentType?: string; ip?: string; raw?: string } = {},
): Request {
  const headers: Record<string, string> = {
    'content-type': init.contentType ?? 'application/json',
  };
  if (init.ip) headers['x-forwarded-for'] = init.ip;
  return new Request(`https://example.test/api/hook/${tok}`, {
    method: 'POST',
    headers,
    body: init.raw ?? JSON.stringify(body),
  });
}

/**
 * A Typeform-shaped payload for one distinct submitter.
 *
 * The phone advances per call so two happy-path fixtures are two different
 * people. Sharing one phone would (correctly) merge them onto a single lead via
 * phone identity, which makes a lead-count-by-email assertion depend on which
 * fixture ran first.
 */
let phoneSeq = 100;
const typeform = (eventId: string) => {
  const phone = '+1 (555) 010-' + String(phoneSeq++).padStart(4, '0');
  return {
    event_id: eventId,
    form_response: {
      submitted_at: new Date().toISOString(),
      answers: [
        { field: { ref: 'full_name' }, type: 'text', text: 'Priya Raman' },
        { field: { ref: 'email' }, type: 'email', email: 'priya-' + eventId + '@example.com' },
        { field: { ref: 'phone' }, type: 'phone_number', phone_number: phone },
        { field: { ref: 'message' }, type: 'text', text: 'Balayage on Friday?' },
      ],
    },
  };
};

describe('POST /api/hook/[token] — the happy path', () => {
  it('creates a lead from a Typeform-shaped payload', async () => {
    const res = await hookHandler(post(token, typeform(`evt-${RUN}-1`), { ip: '20.0.0.1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, deduped: false });

    const [lead] = await sql<{
      customer_name: string;
      email: string;
      phone: string;
      notes: string;
      source_id: string;
      status: string;
      estimated_value: number;
    }[]>`
      select customer_name, email, phone, notes, source_id, status, estimated_value
      from leads where customer_id = ${customerId} and email = ${`priya-evt-${RUN}-1@example.com`}
    `;
    expect(lead!.customer_name).toBe('Priya Raman');
    // Normalized to 10 digits; the last four come from the fixture counter.
    expect(lead!.phone).toMatch(/^555010\d{4}$/);
    expect(lead!.notes).toBe('Balayage on Friday?');
    expect(lead!.source_id).toBe(sourceId);
    expect(lead!.status).toBe('new');
    // estimatedValue is never extracted from a payload — the column default
    // stands, because guessing a dollar figure writes into the headline number.
    expect(lead!.estimated_value).toBe(25000);
  });

  it('stores the raw payload on the event, always', async () => {
    const payload = typeform(`evt-${RUN}-raw`);
    await hookHandler(post(token, payload, { ip: '20.0.0.2' }));
    const [event] = await sql<{ raw_payload: unknown; kind: string; lead_id: string | null }[]>`
      select raw_payload, kind, lead_id from lead_events
      where customer_id = ${customerId} and raw_payload->>'event_id' = ${`evt-${RUN}-raw`}
    `;
    // An owner debugging a misconfigured form needs to see what we received.
    expect(event!.raw_payload).toEqual(payload);
    expect(event!.lead_id).not.toBeNull();
  });

  it('writes the lead before the event, carrying the lead id', async () => {
    // ingest_role has no UPDATE on lead_events (0001_ingest_role.sql:81), so an
    // event cannot be inserted first and backfilled. The order is fixed.
    await hookHandler(post(token, typeform(`evt-${RUN}-order`), { ip: '20.0.0.3' }));
    const [row] = await sql<{ lead_id: string | null }[]>`
      select lead_id from lead_events
      where customer_id = ${customerId} and raw_payload->>'event_id' = ${`evt-${RUN}-order`}
    `;
    expect(row!.lead_id).not.toBeNull();
  });

  it('uses the payload timestamp when it is inside the trust window', async () => {
    const when = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await hookHandler(
      post(
        token,
        { id: `ts-${RUN}`, email: `ts-${RUN}@example.com`, submitted_at: when },
        { ip: '20.0.0.4' },
      ),
    );
    const [lead] = await sql<{ created_at: Date }[]>`
      select created_at from leads where email = ${`ts-${RUN}@example.com`}
    `;
    expect(lead!.created_at.toISOString()).toBe(when);
  });

  it('falls back to receipt time and warns when the timestamp is out of window', async () => {
    // leads.created_at drives every leak rule. An epoch-seconds value read as
    // milliseconds lands in 1970, making the lead instantly and maximally leaked.
    await hookHandler(
      post(
        token,
        { id: `epoch-${RUN}`, email: `epoch-${RUN}@example.com`, created_at: 1787000000 },
        { ip: '20.0.0.5' },
      ),
    );
    const [lead] = await sql<{ created_at: Date }[]>`
      select created_at from leads where email = ${`epoch-${RUN}@example.com`}
    `;
    expect(lead!.created_at.getUTCFullYear()).toBeGreaterThan(2020);

    const [event] = await sql<{ parse_warnings: string[] }[]>`
      select parse_warnings from lead_events
      where customer_id = ${customerId} and raw_payload->>'id' = ${`epoch-${RUN}`}
    `;
    expect(event!.parse_warnings).toContain('timestamp_out_of_window');
  });
});

describe('POST /api/hook/[token] — idempotency', () => {
  it('an identical redelivery returns deduped and writes nothing new', async () => {
    const payload = typeform(`evt-${RUN}-retry`);
    const first = await hookHandler(post(token, payload, { ip: '21.0.0.1' }));
    await expect(first.json()).resolves.toEqual({ ok: true, deduped: false });

    const second = await hookHandler(post(token, payload, { ip: '21.0.0.1' }));
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ ok: true, deduped: true });

    const [events] = await sql<{ count: string }[]>`
      select count(*)::text as count from lead_events
      where customer_id = ${customerId} and raw_payload->>'event_id' = ${`evt-${RUN}-retry`}
    `;
    expect(events!.count).toBe('1');
    const [leads] = await sql<{ count: string }[]>`
      select count(*)::text as count from leads
      where customer_id = ${customerId} and email = ${`priya-evt-${RUN}-retry@example.com`}
    `;
    expect(leads!.count).toBe('1');
  });

  it('dedupes on the payload hash when the provider sends no event id', async () => {
    const payload = { name: 'No Id Nancy', email: `noid-${RUN}@example.com` };
    await hookHandler(post(token, payload, { ip: '21.0.0.2' }));
    const again = await hookHandler(post(token, payload, { ip: '21.0.0.2' }));
    await expect(again.json()).resolves.toEqual({ ok: true, deduped: true });
  });

  it('key order in the payload does not defeat dedupe', async () => {
    const email = `order-${RUN}@example.com`;
    await hookHandler(post(token, { name: 'Ordered', email }, { ip: '21.0.0.3' }));
    const reordered = await hookHandler(post(token, { email, name: 'Ordered' }, { ip: '21.0.0.3' }));
    // buildDedupeKey canonicalizes, so re-serialization by a proxy is not a new
    // delivery.
    await expect(reordered.json()).resolves.toEqual({ ok: true, deduped: true });
  });

  it('the same payload to two tenants is two leads, not a dedupe', async () => {
    const theirs = await seedTenant('third');
    const payload = { id: `shared-${RUN}`, email: `shared-${RUN}@example.com`, name: 'Shared' };
    await hookHandler(post(token, payload, { ip: '21.0.0.4' }));
    const other = await hookHandler(post(theirs.token, payload, { ip: '21.0.0.4' }));
    await expect(other.json()).resolves.toEqual({ ok: true, deduped: false });
    await sql`delete from customers where id = ${theirs.customerId}`;
  });
});

describe('POST /api/hook/[token] — rejection', () => {
  it('404s an unknown token', async () => {
    const res = await hookHandler(post(`no-such-${RUN}`, { email: 'x@example.com' }, { ip: '22.0.0.1' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('404s a revoked token and writes no event', async () => {
    const seeded = await seedTenant('revoked');
    await sql`
      update lead_sources set revoked_at = now(), webhook_token = null
      where id = ${seeded.sourceId}
    `;
    const res = await hookHandler(post(seeded.token, { email: 'x@example.com' }, { ip: '22.0.0.2' }));
    expect(res.status).toBe(404);
    const events = await sql`select 1 from lead_events where customer_id = ${seeded.customerId}`;
    expect(events).toHaveLength(0);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('404s an expired previous token', async () => {
    const seeded = await seedTenant('expired');
    await sql`
      update lead_sources
      set webhook_token = ${`${seeded.token}-new`},
          webhook_token_previous = ${seeded.token},
          token_rotated_at = now() - interval '73 hours'
      where id = ${seeded.sourceId}
    `;
    const res = await hookHandler(post(seeded.token, { email: 'x@example.com' }, { ip: '22.0.0.3' }));
    expect(res.status).toBe(404);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('never echoes the token back in an error body', async () => {
    const guess = `guessed-${RUN}`;
    const res = await hookHandler(post(guess, { email: 'x@example.com' }, { ip: '22.0.0.4' }));
    const body = await res.text();
    expect(body).not.toContain(guess);
  });

  it('405s a GET with an Allow header', async () => {
    const res = await hookHandler(new Request(`https://example.test/api/hook/${token}`));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('400s an unparseable JSON body and writes no event', async () => {
    const before = await sql<{ count: string }[]>`
      select count(*)::text as count from lead_events where customer_id = ${customerId}
    `;
    const res = await hookHandler(post(token, null, { ip: '22.0.0.5', raw: '{"name": ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_body');

    // A body we cannot parse has no dedupe key, so a malformed-body loop would
    // fill the audit log with unbounded rows.
    const after = await sql<{ count: string }[]>`
      select count(*)::text as count from lead_events where customer_id = ${customerId}
    `;
    expect(after[0]!.count).toBe(before[0]!.count);
  });

  it('400s an unsupported content type', async () => {
    const res = await hookHandler(
      post(token, null, { ip: '22.0.0.6', contentType: 'application/xml', raw: '<lead/>' }),
    );
    expect(res.status).toBe(400);
  });

  it('a 400 still consumes rate quota — admit happens before the body is read', async () => {
    // Otherwise a flood of malformed bodies is unlimited.
    const seeded = await seedTenant('malformed-quota');
    await hookHandler(post(seeded.token, null, { ip: '22.0.0.7', raw: 'not json' }));
    const [row] = await sql<{ count: number }[]>`
      select count from ingest_rate_counters
      where bucket = ${`src:${seeded.sourceId}`} and window_start = date_trunc('minute', now())
    `;
    expect(row!.count).toBe(1);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('429s with retry-after once over the per-source limit', async () => {
    const seeded = await seedTenant('rate-limited');
    await sql`
      insert into ingest_rate_counters (bucket, window_start, count)
      values (${`src:${seeded.sourceId}`}, date_trunc('minute', now()), 60)
    `;
    const res = await hookHandler(
      post(seeded.token, { email: `rl-${RUN}@example.com` }, { ip: '22.0.0.8' }),
    );
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('rate_limited');
    const retryAfter = Number(res.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);

    // A spam flood must not become an audit-log flood.
    const events = await sql`select 1 from lead_events where customer_id = ${seeded.customerId}`;
    expect(events).toHaveLength(0);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });
});

describe('POST /api/hook/[token] — form-encoded bodies', () => {
  it('accepts application/x-www-form-urlencoded flattened to one level', async () => {
    // Several form tools post this by default. Rejecting them would fail in the
    // field for a reason the owner could never diagnose.
    const res = await hookHandler(
      post(token, null, {
        ip: '23.0.0.1',
        contentType: 'application/x-www-form-urlencoded',
        raw: new URLSearchParams({
          name: 'Form Encoded Fran',
          email: `fran-${RUN}@example.com`,
          phone: '(555) 246-8100',
          message: 'Sent as a form post',
        }).toString(),
      }),
    );
    expect(res.status).toBe(200);
    const [lead] = await sql<{ customer_name: string; phone: string; notes: string }[]>`
      select customer_name, phone, notes from leads where email = ${`fran-${RUN}@example.com`}
    `;
    expect(lead!.customer_name).toBe('Form Encoded Fran');
    expect(lead!.phone).toBe('5552468100');
    expect(lead!.notes).toBe('Sent as a form post');
  });

  it('accepts a charset parameter on the content type', async () => {
    const res = await hookHandler(
      post(token, null, {
        ip: '23.0.0.2',
        contentType: 'application/json; charset=utf-8',
        raw: JSON.stringify({ email: `charset-${RUN}@example.com` }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('400s an empty form body', async () => {
    const res = await hookHandler(
      post(token, null, {
        ip: '23.0.0.3',
        contentType: 'application/x-www-form-urlencoded',
        raw: '',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/hook/[token] — nothing usable in the payload', () => {
  it('stores the event with a warning and no lead, and still returns 200', async () => {
    const res = await hookHandler(post(token, { hello: 'world' }, { ip: '24.0.0.1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, parsed: false });

    const [event] = await sql<{ parse_warnings: string[]; lead_id: string | null }[]>`
      select parse_warnings, lead_id from lead_events
      where customer_id = ${customerId} and raw_payload->>'hello' = 'world'
    `;
    // Never a rejection: an owner debugging a misconfigured form needs to see
    // that something arrived.
    expect(event!.parse_warnings).toContain('nothing_extracted');
    expect(event!.lead_id).toBeNull();
  });

  it('refuses the business\'s own address and creates no lead from it', async () => {
    const res = await hookHandler(
      post(
        token,
        { id: `biz-${RUN}`, from: 'hello@sunsetsalon.com', subject: 'New website enquiry' },
        { ip: '24.0.0.2' },
      ),
    );
    await expect(res.json()).resolves.toEqual({ ok: true, parsed: false });

    // The corruption this prevents: that address is identical on every
    // submission, so one identity row would swallow the whole dataset.
    const identities = await sql`
      select 1 from lead_identities
      where customer_id = ${customerId} and value_normalized = 'hello@sunsetsalon.com'
    `;
    expect(identities).toHaveLength(0);
  });

  it('records a phone-refused warning without blocking a lead that has a name', async () => {
    const res = await hookHandler(
      post(
        token,
        { id: `ref-${RUN}`, name: 'Reference Rita', reference: '4155550199' },
        { ip: '24.0.0.3' },
      ),
    );
    await expect(res.json()).resolves.toEqual({ ok: true, deduped: false });

    const [lead] = await sql<{ phone: string | null }[]>`
      select phone from leads where customer_id = ${customerId} and customer_name = 'Reference Rita'
    `;
    expect(lead!.phone).toBeNull();

    const [event] = await sql<{ parse_warnings: string[] }[]>`
      select parse_warnings from lead_events
      where customer_id = ${customerId} and raw_payload->>'id' = ${`ref-${RUN}`}
    `;
    expect(event!.parse_warnings).toContain('phone_rejected_unformatted');
  });
});

describe('POST /api/hook/[token] — the rotation overlap', () => {
  it('ingests through a previous token AND records the alert event', async () => {
    const seeded = await seedTenant('rotated');
    await sql`
      update lead_sources
      set webhook_token = ${`${seeded.token}-new`},
          webhook_token_previous = ${seeded.token},
          token_rotated_at = now() - interval '1 hour'
      where id = ${seeded.sourceId}
    `;

    const res = await hookHandler(
      post(seeded.token, { id: `rot-${RUN}`, email: `rot-${RUN}@example.com`, name: 'Rota' }, { ip: '25.0.0.1' }),
    );
    // A rotation must not silently drop real leads.
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, deduped: false });

    const leads = await sql`
      select 1 from leads where customer_id = ${seeded.customerId} and email = ${`rot-${RUN}@example.com`}
    `;
    expect(leads).toHaveLength(1);

    // This event is what lets the status endpoint tell the owner their old URL
    // is still in use — the alert PITFALLS.md:12 asks for.
    const alerts = await sql`
      select 1 from lead_events
      where customer_id = ${seeded.customerId} and kind = 'webhook.previous_token_used'
    `;
    expect(alerts).toHaveLength(1);

    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('records the alert once per delivery, not once per retry', async () => {
    const seeded = await seedTenant('rotated-retry');
    await sql`
      update lead_sources
      set webhook_token = ${`${seeded.token}-new`},
          webhook_token_previous = ${seeded.token},
          token_rotated_at = now() - interval '1 hour'
      where id = ${seeded.sourceId}
    `;
    const payload = { id: `rot2-${RUN}`, email: `rot2-${RUN}@example.com` };
    await hookHandler(post(seeded.token, payload, { ip: '25.0.0.2' }));
    await hookHandler(post(seeded.token, payload, { ip: '25.0.0.2' }));

    const [alerts] = await sql<{ count: string }[]>`
      select count(*)::text as count from lead_events
      where customer_id = ${seeded.customerId} and kind = 'webhook.previous_token_used'
    `;
    expect(alerts!.count).toBe('1');
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('writes no alert event on a current token', async () => {
    await hookHandler(post(token, typeform(`evt-${RUN}-noalert`), { ip: '25.0.0.3' }));
    const alerts = await sql`
      select 1 from lead_events
      where customer_id = ${customerId} and kind = 'webhook.previous_token_used'
    `;
    expect(alerts).toHaveLength(0);
  });
});

describe('POST /api/hook/[token] — tenant isolation', () => {
  it('writes into the token\'s tenant and nowhere else', async () => {
    const email = `iso-${RUN}@example.com`;
    await hookHandler(post(token, { id: `iso-${RUN}`, email, name: 'Isolated' }, { ip: '26.0.0.1' }));

    const [row] = await sql<{ customer_id: string }[]>`
      select customer_id from leads where email = ${email}
    `;
    expect(row!.customer_id).toBe(customerId);
    expect(row!.customer_id).not.toBe(otherCustomerId);

    const theirs = await sql`
      select 1 from leads where customer_id = ${otherCustomerId} and email = ${email}
    `;
    expect(theirs).toHaveLength(0);
  });

  it('the same email for two tenants is two different people', async () => {
    const theirs = await seedTenant('fourth');
    const email = `both-${RUN}@example.com`;
    await hookHandler(post(token, { id: `b1-${RUN}`, email }, { ip: '26.0.0.2' }));
    await hookHandler(post(theirs.token, { id: `b2-${RUN}`, email }, { ip: '26.0.0.2' }));

    const rows = await sql<{ customer_id: string }[]>`
      select customer_id from leads where email = ${email} order by customer_id
    `;
    expect(rows).toHaveLength(2);
    await sql`delete from customers where id = ${theirs.customerId}`;
  });

  it('THE DOUBLE-COUNT GUARD: the same person twice is one lead', async () => {
    const email = `merge-${RUN}@example.com`;
    await hookHandler(post(token, { id: `m1-${RUN}`, email, name: 'Merged Mo' }, { ip: '26.0.0.3' }));
    await hookHandler(
      post(token, { id: `m2-${RUN}`, email: email.toUpperCase(), phone: '555-777-8888' }, { ip: '26.0.0.3' }),
    );

    const rows = await sql<{ id: string; phone: string | null }[]>`
      select id, phone from leads where customer_id = ${customerId} and lower(email) = ${email}
    `;
    // Two leads would count this person's lost revenue twice, corrupting the one
    // number the product reports.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.phone).toBe('5557778888');
  });
});
