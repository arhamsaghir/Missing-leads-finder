# Project: Missed Lead Revenue Finder

## What This Is

An app (web PWA + Expo mobile) that shows small businesses how much revenue they
lose to leads that fall through the cracks — inquiries that never got answered.
v1: user uploads a CSV of leads; `packages/core` parses it, detects "leaked"
leads (no response/no booking), and estimates lost revenue. UI built on Tamagui
(shared web/mobile), deployed on Vercel + EAS.

## Core Value Priority

1. Show lost revenue in money terms (the hook)
2. Zero-effort data capture (the moat — v2 focus)
3. Recover the lead automatically (the expansion)

## Current Milestone: v2.0 Automated Lead Capture & Recovery

**Goal:** Replace manual CSV upload with automatic lead ingestion and proactive
missed-revenue alerts; add backend + multi-tenant persistence.

**Target features:**
- ~~Backend service + multi-tenant database (Vercel serverless)~~ ✅ Phase 1
- ~~Webhook ingestion endpoint (unique URL per customer)~~ ✅ Phase 2
- Email-forwarding ingestion (unique inbound inbox → parse → normalize) ← Phase 3
- Continuous leak detection + push notifications (Expo push + PWA web push)
- Non-technical onboarding flows (paste webhook URL / add email filter)

**Explicitly deferred:** CRM OAuth connectors, Gmail read-only OAuth, Meta stack
(IG/FB/WhatsApp), automated follow-up/booking (graduated autonomy — see seed
`full-auto-booking.md`).

## Validated (do not re-research)

**v1 capabilities:**
- CSV parsing + lead normalization (`packages/core`)
- Leak-detection rules + revenue estimation engine (`packages/core`, TDD)
- Tamagui component library (`packages/ui`), shared web/mobile design system
- Vite PWA (web) + Expo 57 (mobile) apps; monorepo workspaces
- Deployment: Vercel (web), EAS configured (mobile, project `mlead`)

**Phase 1 (2026-08-24):**
- Multi-tenant Postgres on Supabase: 7 tables, RLS on all, isolation proven by
  test with a working negative control (`packages/db`)
- Ingest repository with identity merge + webhook idempotency
- Non-bypassing `ingest_role` scoped by transaction-local `app.customer_id`
- `/api/health` + `/api/me` with local JWKS (ES256) token verification
- Drizzle + Supabase RLS API surface verified against installed packages
  (`.planning/research/DRIZZLE-RLS-VERIFIED.md`)

**Phase 2 (2026-09-20):**
- Public webhook ingest at `POST /api/hook/<token>`, JSON and form-encoded
- `resolver_role` + `ingest_admit` — the pre-tenant lookup as a DB-enforced
  boundary, not a convention
- Rate limiting in Postgres: three buckets, one-minute windows, self-pruning
- Token rotation with a 72-hour overlap enforced at lookup time
- Provisioning API: list, create, get, revoke, rotate, with live status
- Provider-agnostic extraction (`packages/core/src/extract.ts`), no adapters

## Key Decisions

- **2026-09-20 — `resolver_role` for the pre-tenant lookup, not `postgres`.**
  Resolving a token to a tenant cannot run inside `withIngestScope`: the
  `lead_sources` policy filters on the `customer_id` the lookup is trying to
  produce. Running it as `postgres` would work, but `ENABLE ROW LEVEL SECURITY`
  exempts the table owner, so a bug there could read any table. A second
  `NOBYPASSRLS` role with grants on `lead_sources` and the rate counters and
  nothing else makes the worst case "confirm whether a token exists".
- **2026-09-20 — `ingest_admit` is `SECURITY INVOKER`.** A `DEFINER` function
  owned by `postgres` would execute with the owner's privileges and make the
  narrow grant list decorative. `prosecdef = false` is asserted by test, because
  a future `CREATE OR REPLACE` could flip it silently.
- **2026-09-20 — rate counters commit outside the ingest transaction.** If they
  shared it, a retry storm whose deliveries all deduped would roll its own
  counters back and abuse would be free.
- **2026-09-20 — extraction refuses rather than guesses.** An email found only
  under `from`/`reply_to`/`owner` is the business's own address, identical on
  every submission, and would collapse the whole dataset onto one identity. A
  bare 10-digit run is as likely an order id as a phone, and a wrong phone merges
  two unrelated humans. Both are dropped with a `parse_warning`. `mergeLeadFields`
  is monotonic, so a bad merge cannot be undone once revenue is attributed.
- **2026-09-20 — `estimatedValue` is never extracted from a payload.** Guessing a
  dollar figure out of arbitrary JSON writes straight into the headline number.
  A per-source average ticket is a settings decision, not a parsing one.
- **2026-09-20 — unknown tokens return 404, not a silent 200.** It tells a
  scanner nothing it did not already know, and it appears in the form tool's own
  delivery log — the only way an owner discovers they pasted the URL wrong. A
  silent 200 makes a permanently broken integration look healthy forever.
- **2026-09-20 — `FORCE ROW LEVEL SECURITY` stays off, deviating from the Phase 1
  plan.** `phase-1-foundation.md` §B said force would be applied; migration 0000
  only ever used `ENABLE`. Leaving it: `ENABLE` exempts the owner, which is what
  the pre-tenant lookup, the provisioning handlers, and test seeding all depend
  on. `ingest_role` and `resolver_role` are not owners and are already fully
  subject to policy, and the negative control proves the policies bind for them.
  Revisit if provisioning ever moves off the owner role.
- **2026-08-24 — Auth + DB: Supabase for both.** Not Neon, despite the research
  doc. RLS policies need `auth.uid()`; with one vendor they read the verified JWT
  natively, so isolation genuinely lives in the DB. Neon's stateless HTTP driver
  also cannot hold the per-transaction setting the ingest role depends on.
- **2026-08-24 — `contact` splits into `email`/`phone` in the DB.** The
  in-memory `Lead` type keeps one polymorphic field; hydration sets
  `contact = email ?? phone`. A single unvalidated column cannot be deduped, and
  dedupe is what prevents the same person being counted twice — which would
  corrupt the one number the product sells.
- **2026-08-24 — Two dedupe mechanisms, not one.** `lead_events.dedupe_key`
  handles retried deliveries; `lead_identities` handles the same human arriving
  through different channels. One key cannot do both, and a lead may hold several
  contact points.
- **2026-08-24 — Ingest uses a `NOBYPASSRLS` role, not `service_role`.** Webhook
  ingest has no `auth.uid()`, so the obvious move is the service key — which
  bypasses RLS entirely. Instead a dedicated role reads a transaction-local
  `app.customer_id`, so a handler bug cannot write across tenants. Verified under
  test; the service-role fallback was not needed.
- **2026-08-24 — Merge policy is a pure function** (`mergeLeadFields`), so the
  rules deciding whether a second sighting improves or corrupts a record are
  testable without a database.
- **2026-08-24 — Ingest is read-only on `detection_settings`.** An inbound
  webhook has no business changing a customer's configuration. Missing settings
  fall back to engine defaults rather than erroring, so detection is never
  blocked by absent config.
- **2026-08-23 — Ingestion order:** webhooks + email forwarding first (zero
  platform approvals); CRM OAuth second; Gmail OAuth third; Meta last.
- **2026-08-23 — Backend jump accepted:** multi-tenant DB + serverless API is in
  scope for v2. All sources normalize into the same Lead schema that feeds the
  existing core engine. CSV upload remains as backfill option.
- **2026-08-23 — Autonomy posture: graduated.** v2 = detect + notify only.
  Draft-and-approve follow-ups next; full-auto unlocks later per approval-rate
  telemetry (see `.planning/seeds/full-auto-booking.md`).
- Full context: `.planning/notes/product-direction-auto-capture.md`

## Lessons worth remembering

- **RLS grants nothing.** Enabling RLS and writing policies is not enough —
  policies filter *within* privileges a role already holds. Drizzle emits
  `CREATE POLICY` but never `GRANT`, so the first migration left
  `authenticated` unable to read anything (`42501`). Nothing warns you; the
  isolation test caught it. See migration `0002_grants.sql`.
- **A security test that cannot fail is worse than none.** Always verify the
  negative control — `npm run test:prove-isolation -w @missed-lead/db` loosens a
  policy and asserts the suite goes red.
- **The parser silently disabled three of four leak rules.** `last_contact_at`
  and `next_follow_up_at` were header-mapped but never written, so every CSV
  lead looked unanswered. Worth re-checking whenever the Lead shape changes.
- **`drizzle-kit generate` needs the schema to be CJS-resolvable.** drizzle-kit
  `require()`s the schema file. Making `packages/core` ESM-only broke every
  `generate` with `ERR_PACKAGE_PATH_NOT_EXPORTED`, and nobody noticed for four
  commits because no migration was generated in between. A `default` condition in
  the `exports` map plus `.js` extensions on relative specifiers fixes it. Run
  `db:generate` after touching package exports, even when no schema changed.
- **`--custom` writes a snapshot identical to the previous one.** So a schema
  change made in the same commit becomes invisible to the next `generate`, which
  then tries to create the same table twice. Generate normally and append raw SQL
  to the file it produced.
- **The raw-SQL path returns timestamps as strings.** `db.execute()` runs raw SQL
  and postgres.js hands `timestamptz` back as text there, not a `Date` — unlike
  the typed query path. A mapper that trusts the column to be a `Date` typechecks
  green and only throws when something calls `.toISOString()`. Coerce at the repo
  boundary so the returned type is honest.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-09-20*
