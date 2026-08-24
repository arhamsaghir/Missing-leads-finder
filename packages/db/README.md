# @missed-lead/db

Multi-tenant schema, migrations, and ingest repository.

## Setup

```bash
npm run supabase:start          # from the repo root; needs Docker
cp .env.example .env            # fill from the `supabase start` output
npm run db:migrate
```

## Tables

| Table | Purpose |
|---|---|
| `customers` | the tenant; 1:1 with an `auth.users` row today |
| `lead_sources` | a webhook URL, forwarding address, or CSV upload |
| `leads` | the lead itself |
| `lead_identities` | contact points a lead is reachable at — the merge key |
| `lead_events` | ingest audit trail + idempotency key |
| `detection_settings` | per-tenant thresholds feeding `detectLeaks` |
| `push_tokens` | devices to notify (empty until the notification phase) |

## Three things that will bite you

**1. RLS grants nothing.** Policies filter *within* privileges a role already
holds. Drizzle emits `CREATE POLICY` but never `GRANT`, so a new table needs an
explicit grant or every query returns `42501`. See `0002_grants.sql`. If you add
a table, add its grants in the same migration.

**2. Ingest is unauthenticated, so it cannot use the `authenticated` policies.**
A form tool POSTs to a secret URL — there is no `auth.uid()`. Use
`withIngestScope(db, customerId, fn)`, which sets a transaction-local
`app.customer_id` and switches to `ingest_role`. That role is `NOBYPASSRLS`, so a
bug cannot write across tenants; an unset scope fails closed. It needs a real
transaction, so a stateless HTTP driver will not work.

**3. Two dedupe mechanisms, for two different problems.**

```
retried delivery   → lead_events.dedupe_key  → recordLeadEvent() no-ops
same person, two   → lead_identities         → upsertLead() merges
channels                                        onto the existing lead
```

The second one is the guard against double-counted revenue. If it breaks, the
product reports a wrong number rather than an obvious error — so the tests for
it are worth keeping strict.

## Tests

```bash
npm test -w @missed-lead/db                    # 61 tests; needs Supabase running
npm run test:prove-isolation -w @missed-lead/db # verify the tests can actually fail
```

`merge.test.ts` is pure and needs no database.

**Always run `test:prove-isolation` after touching policies or grants.** It
loosens `leads_tenant_isolation` to `using (true)`, asserts the suite goes red,
then restores it. A green isolation test that cannot detect a breach is false
confidence.

When writing isolation assertions, go through an **anon-key client carrying a
user JWT**. A service-role client bypasses RLS and would make the suite pass
while proving nothing.

## Migrations

```bash
npm run db:generate -w @missed-lead/db                  # from schema changes
npx drizzle-kit generate --custom --name=<thing>        # for raw SQL (roles, grants)
```

Use `--custom` rather than hand-writing a file — it registers the journal entry
that `migrate` reads. Migrations run against `DATABASE_URL_DIRECT`; DDL needs
session state a transaction pooler will not hold.
