import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../client';
import {
  buildDedupeKey,
  ensureDetectionSettings,
  getDetectionSettings,
  recordLeadEvent,
  upsertLead,
  withIngestScope,
} from '../repo/ingest';

/**
 * Ingest repository behaviour. Requires `npx supabase start`.
 *
 * The headline case is "same person, two channels, one lead" — if that breaks,
 * lost revenue gets counted twice and the product's central number is wrong.
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

const RUN = Date.now().toString(36);
let db: Db;
let raw: ReturnType<typeof createDb>['sql'];
let customerId: string;
let otherCustomerId: string;
let userIds: string[] = [];
let webFormSourceId: string;
let emailSourceId: string;

async function seedCustomer(name: string): Promise<string> {
  // The local-part must be email-safe, so derive a slug from the business name.
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const { data, error } = await admin.auth.admin.createUser({
    email: `${slug}-${RUN}@ingest.test`,
    password: 'test-password-1234',
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);
  const [row] = await raw<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${data.user.id}, ${name}) returning id
  `;
  return row!.id;
}

beforeAll(async () => {
  const created = createDb(DB_URL);
  db = created.db;
  raw = created.sql;

  customerId = await seedCustomer('Sunset Salon');
  otherCustomerId = await seedCustomer('Rival Salon');

  const [webForm] = await raw<{ id: string }[]>`
    insert into lead_sources (customer_id, kind, label, webhook_token)
    values (${customerId}, 'webhook', 'Website form', ${`tok-web-${RUN}`}) returning id
  `;
  const [inbox] = await raw<{ id: string }[]>`
    insert into lead_sources (customer_id, kind, label, inbound_address)
    values (${customerId}, 'email', 'Forwarded inbox', ${`in-${RUN}@in.missedlead.app`}) returning id
  `;
  webFormSourceId = webForm!.id;
  emailSourceId = inbox!.id;
}, 60_000);

afterAll(async () => {
  // beforeAll may have thrown partway, so guard every id before using it.
  const ids = [customerId, otherCustomerId].filter(Boolean);
  if (ids.length) await raw`delete from customers where id in ${raw(ids)}`;
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await raw?.end();
});

describe('buildDedupeKey', () => {
  it('is stable for the same provider event id', () => {
    const a = buildDedupeKey({ sourceId: 's1', providerEventId: 'evt_123' });
    const b = buildDedupeKey({ sourceId: 's1', providerEventId: 'evt_123' });
    expect(a).toBe(b);
  });

  it('differs across sources even for the same event id', () => {
    expect(buildDedupeKey({ sourceId: 's1', providerEventId: 'e' })).not.toBe(
      buildDedupeKey({ sourceId: 's2', providerEventId: 'e' }),
    );
  });

  it('ignores key order in the payload — re-serialization must not change it', () => {
    const a = buildDedupeKey({ sourceId: 's1', payload: { name: 'Sarah', email: 'a@b.co' } });
    const b = buildDedupeKey({ sourceId: 's1', payload: { email: 'a@b.co', name: 'Sarah' } });
    expect(a).toBe(b);
  });

  it('changes when the payload changes', () => {
    expect(buildDedupeKey({ sourceId: 's1', payload: { a: 1 } })).not.toBe(
      buildDedupeKey({ sourceId: 's1', payload: { a: 2 } }),
    );
  });
});

describe('recordLeadEvent', () => {
  it('records a first delivery and ignores the retry', async () => {
    const dedupeKey = buildDedupeKey({ sourceId: webFormSourceId, providerEventId: `evt-${RUN}-1` });

    const first = await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, { kind: 'ingested', dedupeKey, sourceId: webFormSourceId }),
    );
    expect(first.recorded).toBe(true);
    expect(first.eventId).not.toBeNull();

    // Typeform retrying on timeout must not produce a second event.
    const retry = await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, { kind: 'ingested', dedupeKey, sourceId: webFormSourceId }),
    );
    expect(retry.recorded).toBe(false);
    expect(retry.eventId).toBeNull();

    const [{ count }] = await raw<{ count: string }[]>`
      select count(*)::text as count from lead_events where dedupe_key = ${dedupeKey}
    `;
    expect(count).toBe('1');
  });

  it('stores parse diagnostics alongside the event, not on the lead', async () => {
    const dedupeKey = buildDedupeKey({ sourceId: webFormSourceId, providerEventId: `evt-${RUN}-diag` });
    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: 'ingested',
        dedupeKey,
        sourceId: webFormSourceId,
        parseWarnings: ['Invalid status "super-hot", defaulting to "new"'],
      }),
    );
    const [row] = await raw<{ parse_warnings: string[] }[]>`
      select parse_warnings from lead_events where dedupe_key = ${dedupeKey}
    `;
    expect(row!.parse_warnings).toEqual(['Invalid status "super-hot", defaulting to "new"']);
  });
});

describe('upsertLead — identity merge', () => {
  it('creates a lead on first sighting and records its identity', async () => {
    const result = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        sourceId: webFormSourceId,
        createdAt: new Date('2026-08-01T10:00:00Z'),
        customerName: 'Sarah M',
        contact: 'Sarah.M@Example.com',
        source: 'Web',
        estimatedValue: 45000,
      }),
    );
    expect(result.created).toBe(true);

    const identities = await raw<{ kind: string; value_normalized: string }[]>`
      select kind, value_normalized from lead_identities where lead_id = ${result.leadId}
    `;
    expect(identities).toEqual([{ kind: 'email', value_normalized: 'sarah.m@example.com' }]);
  });

  it('THE DOUBLE-COUNT GUARD: same person via form and forwarded email is one lead', async () => {
    const email = `jo-${RUN}@example.com`;

    const viaForm = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        sourceId: webFormSourceId,
        createdAt: new Date('2026-08-02T09:00:00Z'),
        customerName: 'Jo Blake',
        contact: email,
        source: 'Web',
        estimatedValue: 60000,
      }),
    );

    // Same human, different channel, different capitalisation.
    const viaEmail = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        sourceId: emailSourceId,
        createdAt: new Date('2026-08-02T09:05:00Z'),
        customerName: 'Jo Blake',
        contact: email.toUpperCase(),
        source: 'Email',
      }),
    );

    expect(viaForm.created).toBe(true);
    expect(viaEmail.created).toBe(false);
    expect(viaEmail.matchedOn).toBe('email');
    expect(viaEmail.leadId).toBe(viaForm.leadId);

    // The revenue consequence: one row, one contribution — not two.
    const rows = await raw<{ id: string; estimated_value: number }[]>`
      select id, estimated_value from leads
      where customer_id = ${customerId} and lower(email) = ${email.toLowerCase()}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.estimated_value).toBe(60000);
  });

  it('matches on a phone number across formats', async () => {
    const first = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        createdAt: new Date('2026-08-03T09:00:00Z'),
        customerName: 'Phone Only',
        contact: '(555) 987-6543',
      }),
    );
    const second = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        createdAt: new Date('2026-08-03T10:00:00Z'),
        customerName: 'Phone Only',
        contact: '+1 555 987 6543',
      }),
    );
    expect(second.created).toBe(false);
    expect(second.matchedOn).toBe('phone');
    expect(second.leadId).toBe(first.leadId);
  });

  it('keeps tenants separate — the same email is a different person per business', async () => {
    const shared = `shared-${RUN}@example.com`;
    const mine = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, { createdAt: new Date(), contact: shared, customerName: 'Mine' }),
    );
    const theirs = await withIngestScope(db, otherCustomerId, (tx) =>
      upsertLead(tx, otherCustomerId, { createdAt: new Date(), contact: shared, customerName: 'Theirs' }),
    );
    expect(theirs.created).toBe(true);
    expect(theirs.leadId).not.toBe(mine.leadId);
  });

  it('merges on the provider id when a redelivery carries no usable contact', async () => {
    const externalId = `ext-${RUN}-77`;
    const first = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        sourceId: webFormSourceId,
        externalLeadId: externalId,
        createdAt: new Date('2026-08-04T09:00:00Z'),
        customerName: 'Ask For Bob',
        contact: 'ask for Bob', // unclassifiable — no identity row
      }),
    );
    const again = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        sourceId: webFormSourceId,
        externalLeadId: externalId,
        createdAt: new Date('2026-08-04T09:00:00Z'),
        customerName: 'Ask For Bob',
        contact: 'ask for Bob',
      }),
    );
    expect(again.created).toBe(false);
    expect(again.matchedOn).toBe('external_id');
    expect(again.leadId).toBe(first.leadId);
  });

  it('stores a lead with no usable contact, just without an identity', async () => {
    const result = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        createdAt: new Date('2026-08-05T09:00:00Z'),
        customerName: 'Walk In',
        contact: 'came by the shop',
      }),
    );
    expect(result.created).toBe(true);
    const identities = await raw`select 1 from lead_identities where lead_id = ${result.leadId}`;
    expect(identities).toHaveLength(0);
  });
});

describe('upsertLead — merging must not lose data', () => {
  it('fills blanks, advances dates, and never lowers the value', async () => {
    const email = `enrich-${RUN}@example.com`;
    const first = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        createdAt: new Date('2026-08-06T09:00:00Z'),
        contact: email,
        estimatedValue: 30000,
        status: 'new',
      }),
    );

    await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        createdAt: new Date('2026-08-06T09:00:00Z'),
        email,
        phone: '555-111-2222', // new information
        customerName: 'Now Named',
        lastContactAt: new Date('2026-08-07T09:00:00Z'),
        estimatedValue: 10000, // lower — must not win
        status: 'contacted',
      }),
    );

    const [row] = await raw<{
      customer_name: string;
      phone: string;
      estimated_value: number;
      status: string;
      last_contact_at: string;
    }[]>`
      select customer_name, phone, estimated_value, status, last_contact_at
      from leads where id = ${first.leadId}
    `;
    expect(row!.customer_name).toBe('Now Named'); // was 'Unknown'
    expect(row!.phone).toBe('555-111-2222');
    expect(row!.estimated_value).toBe(30000); // kept the higher figure
    expect(row!.status).toBe('contacted');
    expect(row!.last_contact_at).not.toBeNull();
  });

  it('does not regress a terminal status when a stale form arrives late', async () => {
    const email = `booked-${RUN}@example.com`;
    const lead = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, { createdAt: new Date(), contact: email, status: 'booked' }),
    );
    await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, { createdAt: new Date(), contact: email, status: 'new' }),
    );
    const [row] = await raw<{ status: string }[]>`select status from leads where id = ${lead.leadId}`;
    expect(row!.status).toBe('booked');
  });

  it('adds a newly-discovered identity to an existing lead', async () => {
    const email = `multi-${RUN}@example.com`;
    const lead = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, { createdAt: new Date(), email }),
    );
    await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, { createdAt: new Date(), email, phone: '555-333-4444' }),
    );
    const identities = await raw<{ kind: string }[]>`
      select kind from lead_identities where lead_id = ${lead.leadId} order by kind
    `;
    expect(identities.map((i) => i.kind)).toEqual(['email', 'phone']);
  });
});

describe('detection settings', () => {
  it('falls back to the engine defaults when no row exists — detection is never blocked', async () => {
    const fresh = await seedCustomer('Threshold Salon');
    const settings = await withIngestScope(db, fresh, (tx) => getDetectionSettings(tx, fresh));
    expect(settings).toEqual({ slowReplyHours: 24, staleQuoteDays: 7, defaultAverageTicket: 25000 });
    await raw`delete from customers where id = ${fresh}`;
  });

  it('ensureDetectionSettings creates the row once, then leaves it alone', async () => {
    const fresh = await seedCustomer('Ensure Salon');
    await db.transaction((tx) => ensureDetectionSettings(tx, fresh));
    await raw`update detection_settings set slow_reply_hours = 9 where customer_id = ${fresh}`;
    await db.transaction((tx) => ensureDetectionSettings(tx, fresh)); // must not reset it
    const [row] = await raw<{ slow_reply_hours: number }[]>`
      select slow_reply_hours from detection_settings where customer_id = ${fresh}
    `;
    expect(row!.slow_reply_hours).toBe(9);
    await raw`delete from customers where id = ${fresh}`;
  });

  it('returns edited values on the ingest path', async () => {
    await raw`
      insert into detection_settings (customer_id, slow_reply_hours, stale_quote_days)
      values (${customerId}, 4, 2)
      on conflict (customer_id) do update set slow_reply_hours = 4, stale_quote_days = 2
    `;
    const settings = await withIngestScope(db, customerId, (tx) =>
      getDetectionSettings(tx, customerId),
    );
    expect(settings.slowReplyHours).toBe(4);
    expect(settings.staleQuoteDays).toBe(2);
  });

  it('ingest cannot write settings even though it can read them', async () => {
    // Drizzle wraps driver errors, so assert on the Postgres cause: 42501 is
    // insufficient_privilege. ingest_role holds SELECT on this table and no more.
    const attempt = withIngestScope(db, customerId, (tx) =>
      ensureDetectionSettings(tx, customerId),
    );
    await expect(attempt).rejects.toThrow();
    const error = await attempt.catch((e: unknown) => e as { cause?: { code?: string } });
    expect(error.cause?.code).toBe('42501');
  });
});
