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
- Webhook ingestion endpoint (unique URL per customer) ← Phase 2, next
- Email-forwarding ingestion (unique inbound inbox → parse → normalize)
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

## Key Decisions

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

*Last updated: 2026-08-23*
