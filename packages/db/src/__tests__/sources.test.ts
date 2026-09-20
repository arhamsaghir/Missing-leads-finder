import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../client';
import { buildDedupeKey, recordLeadEvent, upsertLead, withIngestScope } from '../repo/ingest';
import {
  admitWebhookDelivery,
  createWebhookSource,
  findExistingEvent,
  generateWebhookToken,
  getSource,
  listSources,
  PREVIOUS_TOKEN_EVENT,
  revokeSource,
  rotateWebhookToken,
} from '../repo/sources';

/**
 * Source provisioning and admission. Requires `npx supabase start`.
 *
 * Tenant scoping on this path is application code, not RLS: these functions run
 * as `postgres`, which owns the tables and is exempt from ENABLE ROW LEVEL
 * SECURITY. So "another tenant's id returns null" is an assertion about the
 * `where customer_id = ...` clause, and it is the only thing standing between two
 * tenants here. Hence a cross-tenant case for every function.
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

/**
 * Rate-limit buckets are GLOBAL and outlive a single suite run — they are keyed
 * on a string, not scoped to a tenant or a transaction, and only pruned after two
 * hours. So every IP this file hands to `admitWebhookDelivery` carries RUN:
 * `ingest_admit(p_token, p_ip)` takes p_ip as text and never parses it as an
 * address, so `11.11.11.${RUN}` is a legal per-run key, and afterAll's
 * `like '%RUN%'` sweep can reach it. See resolver-role.test.ts:30-41 — and never
 * key on something derived like RUN.length, which is constant until 2059.
 */
const RUN = Date.now().toString(36);
const userIds: string[] = [];
let db: Db;
let raw: ReturnType<typeof createDb>['sql'];
let customerId: string;
let otherCustomerId: string;

async function seedCustomer(slug: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${slug}-${RUN}@sources.test`,
    password: 'test-password-1234',
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);
  const [row] = await raw<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${data.user.id}, ${`${slug} Salon`}) returning id
  `;
  return row!.id;
}

beforeAll(async () => {
  const created = createDb(DB_URL);
  db = created.db;
  raw = created.sql;
  customerId = await seedCustomer('owner');
  otherCustomerId = await seedCustomer('rival');
}, 60_000);

afterAll(async () => {
  const ids = [customerId, otherCustomerId].filter(Boolean);
  // `src:<uuid>` buckets carry no RUN, so sweep them off the sources themselves
  // before the cascade removes the rows that name them.
  if (ids.length) {
    await raw`
      delete from ingest_rate_counters
      where bucket in (
        select 'src:' || s.id::text from lead_sources s where s.customer_id in ${raw(ids)}
      )
    `;
  }
  for (const id of ids) {
    await raw`delete from customers where id = ${id}`;
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await raw`delete from ingest_rate_counters where bucket like ${`%${RUN}%`}`;
  await raw?.end();
});

describe('generateWebhookToken', () => {
  it('is 43 url-safe characters from 32 random bytes', () => {
    const token = generateWebhookToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 500 }, generateWebhookToken));
    expect(tokens.size).toBe(500);
  });
});

describe('createWebhookSource', () => {
  it('returns a source with a live token and empty counters', async () => {
    const source = await createWebhookSource(db, customerId, 'Website form');
    expect(source.label).toBe('Website form');
    expect(source.kind).toBe('webhook');
    expect(source.webhookToken).toHaveLength(43);
    expect(source.revokedAt).toBeNull();
    expect(source.eventCount).toBe(0);
    expect(source.leadCount).toBe(0);
    expect(source.lastEventAt).toBeNull();
    expect(source.previousTokenInUse).toBe(false);
    expect(source.lastParseWarningAt).toBeNull();
  });

  it('stamps the row with the calling tenant, not any other', async () => {
    const source = await createWebhookSource(db, customerId, 'Scoped');
    const [row] = await raw<{ customer_id: string }[]>`
      select customer_id from lead_sources where id = ${source.id}
    `;
    expect(row!.customer_id).toBe(customerId);
  });

  it('lets two tenants each have a source with the same label', async () => {
    const mine = await createWebhookSource(db, customerId, 'Contact form');
    const theirs = await createWebhookSource(db, otherCustomerId, 'Contact form');
    expect(theirs.id).not.toBe(mine.id);
    expect(theirs.webhookToken).not.toBe(mine.webhookToken);
  });
});

describe('rotateWebhookToken', () => {
  it('demotes the current token, issues a new one, and stamps the time', async () => {
    const before = await createWebhookSource(db, customerId, 'Rotating');
    const after = await rotateWebhookToken(db, customerId, before.id);

    expect(after).not.toBeNull();
    expect(after!.webhookToken).toHaveLength(43);
    expect(after!.webhookToken).not.toBe(before.webhookToken);

    const [row] = await raw<{
      webhook_token: string;
      webhook_token_previous: string;
      token_rotated_at: Date | null;
    }[]>`
      select webhook_token, webhook_token_previous, token_rotated_at
      from lead_sources where id = ${before.id}
    `;
    expect(row!.webhook_token).toBe(after!.webhookToken);
    expect(row!.webhook_token_previous).toBe(before.webhookToken);
    expect(row!.token_rotated_at).not.toBeNull();
  });

  it('keeps the old URL working right after a rotation', async () => {
    const before = await createWebhookSource(db, customerId, 'Still working');
    await rotateWebhookToken(db, customerId, before.id);
    const admitted = await admitWebhookDelivery(db, before.webhookToken!, null);
    expect(admitted.tokenState).toBe('previous');
    expect(admitted.customerId).toBe(customerId);
  });

  it('rotating twice inside the window invalidates the original — known limitation', async () => {
    // The column is singular, so the second rotation overwrites the first
    // previous value. Documented rather than engineered around; see the spec.
    const first = await createWebhookSource(db, customerId, 'Double rotate');
    const second = await rotateWebhookToken(db, customerId, first.id);
    await rotateWebhookToken(db, customerId, first.id);

    expect((await admitWebhookDelivery(db, first.webhookToken!, null)).tokenState).toBe('unknown');
    expect((await admitWebhookDelivery(db, second!.webhookToken!, null)).tokenState).toBe('previous');
  });

  it('returns null for another tenant\'s source id and changes nothing', async () => {
    const mine = await createWebhookSource(db, customerId, 'Not yours');
    const result = await rotateWebhookToken(db, otherCustomerId, mine.id);
    expect(result).toBeNull();

    const [row] = await raw<{ webhook_token: string }[]>`
      select webhook_token from lead_sources where id = ${mine.id}
    `;
    expect(row!.webhook_token).toBe(mine.webhookToken);
  });

  it('returns null for an id that does not exist', async () => {
    const result = await rotateWebhookToken(
      db,
      customerId,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(result).toBeNull();
  });

  it('refuses to rotate a revoked source, leaving both token columns null', async () => {
    // The `isNull(revokedAt)` guard in the update's where clause. Without it,
    // revoke-then-rotate would mint a fresh LIVE token onto a revoked row and
    // return it in a SourceStatus — handing a brand-new secret to an API caller
    // for a source its owner believes is dead.
    const source = await createWebhookSource(db, customerId, 'Revoked then rotated');
    expect(await revokeSource(db, customerId, source.id)).toBe(true);

    expect(await rotateWebhookToken(db, customerId, source.id)).toBeNull();

    // The row state is the assertion that matters: a test checking only the null
    // return would still pass if the UPDATE had landed and merely failed to
    // return a row.
    const [row] = await raw<{
      webhook_token: string | null;
      webhook_token_previous: string | null;
      token_rotated_at: Date | null;
    }[]>`
      select webhook_token, webhook_token_previous, token_rotated_at
      from lead_sources where id = ${source.id}
    `;
    expect(row!.webhook_token).toBeNull();
    expect(row!.webhook_token_previous).toBeNull();
  });
});

describe('revokeSource', () => {
  it('nulls both token columns so the secret ceases to exist', async () => {
    const source = await createWebhookSource(db, customerId, 'To revoke');
    await rotateWebhookToken(db, customerId, source.id);
    expect(await revokeSource(db, customerId, source.id)).toBe(true);

    const [row] = await raw<{
      webhook_token: string | null;
      webhook_token_previous: string | null;
      revoked_at: Date | null;
    }[]>`
      select webhook_token, webhook_token_previous, revoked_at
      from lead_sources where id = ${source.id}
    `;
    // Flagging alone would leave a live secret in the row; a dump would leak it.
    expect(row!.webhook_token).toBeNull();
    expect(row!.webhook_token_previous).toBeNull();
    expect(row!.revoked_at).not.toBeNull();
  });

  it('keeps the row — leads.source_id references it', async () => {
    const source = await createWebhookSource(db, customerId, 'Referenced');
    await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        sourceId: source.id,
        createdAt: new Date(),
        email: `ref-${RUN}@example.com`,
      }),
    );
    await revokeSource(db, customerId, source.id);

    const rows = await raw`select 1 from lead_sources where id = ${source.id}`;
    expect(rows).toHaveLength(1);
  });

  it('makes the token stop resolving', async () => {
    const source = await createWebhookSource(db, customerId, 'Dead token');
    const token = source.webhookToken!;
    await revokeSource(db, customerId, source.id);
    expect((await admitWebhookDelivery(db, token, null)).tokenState).toBe('unknown');
  });

  it('returns false for another tenant\'s source and leaves it live', async () => {
    const mine = await createWebhookSource(db, customerId, 'Theirs to keep');
    expect(await revokeSource(db, otherCustomerId, mine.id)).toBe(false);
    const [row] = await raw<{ revoked_at: Date | null }[]>`
      select revoked_at from lead_sources where id = ${mine.id}
    `;
    expect(row!.revoked_at).toBeNull();
  });

  it('is idempotent', async () => {
    const source = await createWebhookSource(db, customerId, 'Twice revoked');
    expect(await revokeSource(db, customerId, source.id)).toBe(true);
    expect(await revokeSource(db, customerId, source.id)).toBe(true);
  });
});

describe('listSources and getSource — the status contract', () => {
  it('counts events and leads independently, and reports the last event time', async () => {
    const source = await createWebhookSource(db, customerId, 'Counted');

    // Asymmetric and both > 1, deliberately. A 1x1 fixture is the one shape
    // where scalar subqueries and a join with GROUP BY agree, so it would pass
    // whether or not the counts had been rewritten as a join. With 2 events and
    // 3 leads a join reports 6 for both, and distinct numbers also catch a
    // transposition of the two subqueries.
    const leadIds: string[] = [];
    for (const n of [1, 2, 3]) {
      // Distinct identities per lead — a repeated email merges onto the existing
      // lead through lead_identities and the count would be 1, not 3.
      const result = await withIngestScope(db, customerId, (tx) =>
        upsertLead(tx, customerId, {
          sourceId: source.id,
          createdAt: new Date(),
          email: `counted-${n}-${RUN}@example.com`,
        }),
      );
      leadIds.push(result.leadId);
    }
    expect(new Set(leadIds).size).toBe(3);

    for (const n of [1, 2]) {
      // Distinct dedupe keys — the unique index is on (customer_id, dedupe_key),
      // so a repeat would be swallowed by onConflictDoNothing.
      const recorded = await withIngestScope(db, customerId, (tx) =>
        recordLeadEvent(tx, customerId, {
          kind: 'webhook.received',
          dedupeKey: buildDedupeKey({ sourceId: source.id, providerEventId: `e${n}-${RUN}` }),
          sourceId: source.id,
          leadId: leadIds[0]!,
        }),
      );
      expect(recorded.recorded).toBe(true);
    }

    const status = await getSource(db, customerId, source.id);
    expect(status!.eventCount).toBe(2);
    expect(status!.leadCount).toBe(3);
    expect(status!.lastEventAt).not.toBeNull();
  });

  it('reports previousTokenInUse only inside the current rotation window', async () => {
    const source = await createWebhookSource(db, customerId, 'Old URL live');
    const rotated = await rotateWebhookToken(db, customerId, source.id);
    expect(rotated!.previousTokenInUse).toBe(false);

    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: PREVIOUS_TOKEN_EVENT,
        dedupeKey: buildDedupeKey({ sourceId: source.id, providerEventId: `prev-${RUN}` }),
        sourceId: source.id,
      }),
    );

    // This flag is the alert PITFALLS.md:12 asks for: the owner's form is still
    // posting to a URL that is about to stop working.
    const status = await getSource(db, customerId, source.id);
    expect(status!.previousTokenInUse).toBe(true);
  });

  it('ignores a previous-token event from before the latest rotation', async () => {
    const source = await createWebhookSource(db, customerId, 'Stale alert');
    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: PREVIOUS_TOKEN_EVENT,
        dedupeKey: buildDedupeKey({ sourceId: source.id, providerEventId: `old-${RUN}` }),
        sourceId: source.id,
        occurredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      }),
    );
    const rotated = await rotateWebhookToken(db, customerId, source.id);
    // A hit from a previous rotation cycle must not light the alert forever.
    expect(rotated!.previousTokenInUse).toBe(false);
  });

  it('lights the alert even when the caller stamps occurred_at from a lagging clock', async () => {
    // The test above is the readable one; this is the one that can fail.
    //
    // Task 5 calls recordPreviousTokenUse with `receivedAt` — the handler's own
    // `new Date()` — so occurred_at is HOST-stamped while token_rotated_at is
    // DATABASE-stamped. Comparing those two straddles two clocks, and a host even
    // a millisecond behind makes a delivery that arrived AFTER a rotation look as
    // though it preceded it. The alert then silently fails to light for the one
    // customer whose form is about to break.
    //
    // 60 seconds of lag rather than a millisecond: the bug is a race, and racing
    // it is what a probabilistic test does. Exaggerating the skew makes the same
    // assertion deterministic — it fails on every run against occurred_at and
    // passes on every run against created_at, which has no override path.
    const source = await createWebhookSource(db, customerId, 'Lagging clock');
    await rotateWebhookToken(db, customerId, source.id);

    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: PREVIOUS_TOKEN_EVENT,
        dedupeKey: buildDedupeKey({ sourceId: source.id, providerEventId: `lag-${RUN}` }),
        sourceId: source.id,
        occurredAt: new Date(Date.now() - 60_000),
      }),
    );

    const status = await getSource(db, customerId, source.id);
    expect(status!.previousTokenInUse).toBe(true);
  });

  it('does not light the alert for an ordinary delivery after a rotation', async () => {
    // The kind filter. Without it previousTokenInUse degrades to "any event since
    // the last rotation", so every source that receives one normal lead after a
    // rotation tells its owner the old URL is still in use — permanently, for a
    // URL that is fine. Owners then learn to ignore the one warning that means
    // their form is about to break.
    const source = await createWebhookSource(db, customerId, 'Normal after rotate');
    await rotateWebhookToken(db, customerId, source.id);
    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: 'webhook.received',
        dedupeKey: buildDedupeKey({ sourceId: source.id, providerEventId: `norm-${RUN}` }),
        sourceId: source.id,
      }),
    );
    const status = await getSource(db, customerId, source.id);
    expect(status!.previousTokenInUse).toBe(false);
  });

  it('surfaces the last parse warning time', async () => {
    const source = await createWebhookSource(db, customerId, 'Warned');
    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: 'webhook.received',
        dedupeKey: buildDedupeKey({ sourceId: source.id, providerEventId: `warn-${RUN}` }),
        sourceId: source.id,
        parseWarnings: ['nothing_extracted'],
      }),
    );
    const status = await getSource(db, customerId, source.id);
    expect(status!.lastParseWarningAt).not.toBeNull();
  });

  it('leaves lastParseWarningAt null when every delivery parsed cleanly', async () => {
    // The negative half of the test above, and the one that can fail: without the
    // `jsonb_array_length(parse_warnings) > 0` filter, lastParseWarningAt collapses
    // into lastEventAt and every healthy source wears a parse-warning badge. The
    // badge then means nothing, so a genuinely broken form looks like all the
    // others.
    const source = await createWebhookSource(db, customerId, 'Clean parse');
    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: 'webhook.received',
        dedupeKey: buildDedupeKey({ sourceId: source.id, providerEventId: `clean-${RUN}` }),
        sourceId: source.id,
      }),
    );
    const status = await getSource(db, customerId, source.id);
    expect(status!.lastEventAt).not.toBeNull();
    expect(status!.lastParseWarningAt).toBeNull();
  });

  it('keeps every per-source column correlated to its own row across a list', async () => {
    // Everything above reads one source at a time, and with a single row a
    // correlated subquery and an uncorrelated one return the same answer. So each
    // of `last_event_at`, `previous_token_in_use`, and `last_parse_warning_at`
    // could lose its `e.source_id = s.id` correlation and no test would notice.
    //
    // What that costs an owner: a working Typeform and a broken Calendly would
    // report the same last-event time and both show the old-URL alert. They could
    // not tell which integration is broken, which is the only job this screen has.
    //
    // Two sources under one tenant, deliberately opposite: one noisy (rotated,
    // then a previous-token delivery carrying a parse warning), one quiet
    // (rotated, never posted to).
    const noisy = await createWebhookSource(db, customerId, 'Noisy integration');
    const quiet = await createWebhookSource(db, customerId, 'Quiet integration');
    await rotateWebhookToken(db, customerId, noisy.id);
    await rotateWebhookToken(db, customerId, quiet.id);

    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: PREVIOUS_TOKEN_EVENT,
        dedupeKey: buildDedupeKey({ sourceId: noisy.id, providerEventId: `noisy-${RUN}` }),
        sourceId: noisy.id,
        parseWarnings: ['nothing_extracted'],
      }),
    );

    const listed = await listSources(db, customerId);
    const gotNoisy = listed.find((s) => s.id === noisy.id)!;
    const gotQuiet = listed.find((s) => s.id === quiet.id)!;

    expect(gotNoisy.lastEventAt).not.toBeNull();
    expect(gotNoisy.previousTokenInUse).toBe(true);
    expect(gotNoisy.lastParseWarningAt).not.toBeNull();

    // The quiet source is the assertion that matters: every one of these is null
    // or false only if the subquery is correlated to its own row.
    expect(gotQuiet.lastEventAt).toBeNull();
    expect(gotQuiet.previousTokenInUse).toBe(false);
    expect(gotQuiet.lastParseWarningAt).toBeNull();
    expect(gotQuiet.eventCount).toBe(0);
  });

  it('lists only the calling tenant\'s sources', async () => {
    await createWebhookSource(db, otherCustomerId, 'Rival form');
    const mine = await listSources(db, customerId);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.some((s) => s.label === 'Rival form')).toBe(false);

    const [{ count }] = await raw<{ count: string }[]>`
      select count(*)::text as count from lead_sources where customer_id = ${customerId}
    `;
    expect(mine).toHaveLength(Number(count));
  });

  it('includes revoked sources in the list, so an owner can see what happened', async () => {
    const source = await createWebhookSource(db, customerId, 'Visible after revoke');
    await revokeSource(db, customerId, source.id);
    const listed = (await listSources(db, customerId)).find((s) => s.id === source.id);
    expect(listed).toBeDefined();
    expect(listed!.revokedAt).not.toBeNull();
    expect(listed!.webhookToken).toBeNull();
  });

  it('returns null for another tenant\'s source id', async () => {
    const theirs = await createWebhookSource(db, otherCustomerId, 'Private');
    expect(await getSource(db, customerId, theirs.id)).toBeNull();
  });

  it('returns null for an id that does not exist — same shape as not-yours', async () => {
    expect(await getSource(db, customerId, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('counts a source with no activity as zero rather than omitting it', async () => {
    const source = await createWebhookSource(db, customerId, 'Quiet');
    const status = await getSource(db, customerId, source.id);
    // A LEFT JOIN aggregate that drops rows with no events would hide a source
    // an owner has just created and is waiting to see light up.
    expect(status).not.toBeNull();
    expect(status!.eventCount).toBe(0);
    expect(status!.leadCount).toBe(0);
  });
});

describe('findExistingEvent — the retry short-circuit', () => {
  // Takes a Tx, not a Db, and runs as ingest_role inside withIngestScope, which
  // is how Task 5's dedupe path calls it. ingest_role holds SELECT on
  // lead_events (0001_ingest_role.sql:81).
  it('is true for a dedupe key that was already written', async () => {
    const source = await createWebhookSource(db, customerId, 'Dedupe hit');
    const dedupeKey = buildDedupeKey({
      sourceId: source.id,
      providerEventId: `exists-${RUN}`,
    });
    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: 'webhook.received',
        dedupeKey,
        sourceId: source.id,
      }),
    );

    const found = await withIngestScope(db, customerId, (tx) =>
      findExistingEvent(tx, customerId, dedupeKey),
    );
    expect(found).toBe(true);
  });

  it('is false for a dedupe key that was never written', async () => {
    const found = await withIngestScope(db, customerId, (tx) =>
      findExistingEvent(tx, customerId, `never-written-${RUN}`),
    );
    expect(found).toBe(false);
  });

  it('does not see another tenant\'s event with the same dedupe key', async () => {
    // Deleting the customer_id clause from findExistingEvent does NOT fail this
    // test, and that is worth stating rather than hiding: withIngestScope runs as
    // ingest_role, whose lead_events policy already filters
    // `customer_id = current_ingest_customer_id()`, so RLS alone produces the
    // right answer here. Verified by mutation — the suite stays green with the
    // clause removed.
    //
    // Kept anyway, because it pins the behaviour Task 5 actually depends on. The
    // test that can fail is the next one.
    const source = await createWebhookSource(db, customerId, 'Shared key');
    const dedupeKey = buildDedupeKey({
      sourceId: source.id,
      providerEventId: `cross-${RUN}`,
    });
    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: 'webhook.received',
        dedupeKey,
        sourceId: source.id,
      }),
    );

    const seenByOwner = await withIngestScope(db, customerId, (tx) =>
      findExistingEvent(tx, customerId, dedupeKey),
    );
    const seenByRival = await withIngestScope(db, otherCustomerId, (tx) =>
      findExistingEvent(tx, otherCustomerId, dedupeKey),
    );
    expect(seenByOwner).toBe(true);
    expect(seenByRival).toBe(false);
  });

  it('filters by tenant on its own, without relying on RLS to do it', async () => {
    // The `Tx` this takes is not necessarily an ingest-scoped one. A plain
    // db.transaction() runs as `postgres`, which OWNS lead_events, and
    // ENABLE ROW LEVEL SECURITY exempts the owner (relforcerowsecurity is false —
    // a deliberate, recorded deviation). In that context the function's own
    // customer_id clause is the ONLY thing separating two tenants.
    //
    // The unique index is (customer_id, dedupe_key), so the same key legitimately
    // exists for both. Without the clause, one tenant's retry would report as
    // already-recorded for another tenant and suppress a genuine lead — a silently
    // lost lead, which is the one failure this product cannot have.
    const source = await createWebhookSource(db, customerId, 'Owner-context key');
    const dedupeKey = buildDedupeKey({
      sourceId: source.id,
      providerEventId: `owner-ctx-${RUN}`,
    });
    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, { kind: 'webhook.received', dedupeKey, sourceId: source.id }),
    );

    const [ownerSees, rivalSees] = await db.transaction(async (tx) => [
      await findExistingEvent(tx, customerId, dedupeKey),
      await findExistingEvent(tx, otherCustomerId, dedupeKey),
    ]);
    expect(ownerSees).toBe(true);
    expect(rivalSees).toBe(false);
  });
});

describe('admitWebhookDelivery — the typed wrapper', () => {
  it('maps the SQL row onto camelCase and nulls', async () => {
    const source = await createWebhookSource(db, customerId, 'Admitted');
    const result = await admitWebhookDelivery(db, source.webhookToken!, `11.11.11.${RUN}`);
    expect(result).toEqual({
      customerId,
      sourceId: source.id,
      tokenState: 'current',
      admit: true,
      retryAfter: null,
    });
  });

  it('returns a fully-null result for an unknown token rather than throwing', async () => {
    const result = await admitWebhookDelivery(db, `nope-${RUN}`, `12.12.12.${RUN}`);
    expect(result.customerId).toBeNull();
    expect(result.sourceId).toBeNull();
    expect(result.tokenState).toBe('unknown');
  });

  it('surfaces retryAfter as a number when over the limit', async () => {
    const source = await createWebhookSource(db, customerId, 'Limited');
    await raw`
      insert into ingest_rate_counters (bucket, window_start, count)
      values (${`src:${source.id}`}, date_trunc('minute', now()), 60)
    `;
    const result = await admitWebhookDelivery(db, source.webhookToken!, null);
    expect(result.admit).toBe(false);
    expect(typeof result.retryAfter).toBe('number');
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('charges a padded IP to the same bucket as the bare form', async () => {
    // ingest_admit guards `p_ip IS NOT NULL AND p_ip <> ''` and never parses the
    // value — the bucket is literally 'ip:' || p_ip. So untrimmed whitespace
    // would give one client two quotas. Normalizing in this wrapper is what
    // prevents that.
    const ip = `13.13.13.${RUN}`;
    await admitWebhookDelivery(db, `pad-a-${RUN}`, ip);
    await admitWebhookDelivery(db, `pad-b-${RUN}`, `  ${ip}  `);

    const [bare] = await raw<{ count: number }[]>`
      select count from ingest_rate_counters
      where bucket = ${`ip:${ip}`} and window_start = date_trunc('minute', now())
    `;
    expect(bare!.count).toBe(2);

    // And no padded twin. Matched on a like against this test's own IP so any
    // amount of surrounding whitespace is caught, without colliding with the
    // other RUN-keyed IPs in this file.
    const padded = await raw<{ bucket: string }[]>`
      select bucket from ingest_rate_counters
      where bucket like ${`ip:%${ip}%`} and bucket <> ${`ip:${ip}`}
    `;
    expect(padded).toHaveLength(0);
  });

  it('treats a whitespace-only IP as absent, charging no IP bucket at all', async () => {
    // Whitespace-only must not collapse onto a shared 'ip:' bucket either: one
    // blank-IP caller would then throttle every other blank-IP caller.
    const before = await raw<{ bucket: string }[]>`
      select bucket from ingest_rate_counters
      where bucket in ('ip:', 'unk:', 'ip:   ', 'unk:   ')
    `;
    await admitWebhookDelivery(db, `blank-ip-${RUN}`, '   ');
    const after = await raw<{ bucket: string }[]>`
      select bucket from ingest_rate_counters
      where bucket in ('ip:', 'unk:', 'ip:   ', 'unk:   ')
    `;
    expect(after).toHaveLength(before.length);
  });

  it('charges nothing at all for a null IP with an unresolvable token — pinned, not a gap', async () => {
    // Deliberate. See the note on admitWebhookDelivery: the alternative is a
    // sentinel bucket every caller shares, which turns a missing
    // x-forwarded-for into one global 300/min quota. Unmetered guessing of a
    // 256-bit token is not the threat that trade buys off.
    //
    // Asserted as "no counter went UP", comparing bucket→count maps across the
    // call. Two weaker forms of this assertion do not discriminate, and both are
    // tempting:
    //
    //  - Comparing total row counts, or the set of bucket NAMES, detects only a
    //    bucket that did not exist before. Six earlier tests in this file already
    //    admit with a null IP, so a sentinel would have been created by one of
    //    them and this probe would merely increment it. Verified: with
    //    `normalizedIp = 'no-ip'` substituted for null, a name-set diff stays
    //    green.
    //  - Ignoring deletions is deliberate, not laxity. ingest_admit prunes rows
    //    older than two hours on ~1% of calls, so a prune firing on this very
    //    call must not fail a test about whether anything was charged.
    const token = `null-ip-probe-${RUN}`;
    const counts = async () =>
      new Map(
        (
          await raw<{ bucket: string; count: number }[]>`
            select bucket, count from ingest_rate_counters
          `
        ).map((r) => [r.bucket, r.count]),
      );
    const before = await counts();

    const result = await admitWebhookDelivery(db, token, null);
    expect(result.tokenState).toBe('unknown');
    expect(result.admit).toBe(true);

    const after = await counts();
    const charged = [...after.entries()]
      .filter(([bucket, count]) => count > (before.get(bucket) ?? 0))
      .map(([bucket, count]) => `${bucket} → ${count}`);
    // Names the offender rather than failing on a bare number, so a future
    // sentinel shows up in the message under whatever name it was given.
    expect(charged).toEqual([]);
  });
});

