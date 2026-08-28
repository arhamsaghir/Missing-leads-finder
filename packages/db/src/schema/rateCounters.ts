import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Rate-limit counters for the public ingest endpoint.
 *
 * A Postgres table rather than a vendor service: no new dependency, it survives
 * a cold start, and it leaves an audit trail a future "you're being spammed"
 * message can read.
 *
 * Deliberately NOT tenant-scoped, which is why this is the one table in this
 * directory with no `tenantPolicy()` call. The buckets that matter most are
 * charged before a token resolves to a tenant (`unk:<ip>`, `ip:<ip>`), so a
 * customer_id column would be null exactly when it is needed. RLS is still
 * enabled on it in the migration, with `authenticated` and `anon` granted
 * nothing.
 *
 * `bucket` is one of `src:<source_id>`, `unk:<ip>`, or `ip:<ip>`; `windowStart`
 * is `date_trunc('minute', now())`. Rows older than two hours are pruned inside
 * `ingest_admit`, so there is no cron job and no unbounded growth.
 */
export const ingestRateCounters = pgTable(
  'ingest_rate_counters',
  {
    bucket: text('bucket').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.windowStart] })],
);

export type IngestRateCounter = typeof ingestRateCounters.$inferSelect;
