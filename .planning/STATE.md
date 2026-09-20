---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Automated Lead Capture & Recovery
status: in_progress
last_updated: "2026-09-20T00:00:00.000Z"
last_activity: 2026-09-20
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 2
  completed_plans: 2
  percent: 33
---

# Project State

## Current Position

Phase: 2 of 6 — Webhook ingest — **complete**
Plan: `docs/superpowers/plans/2026-08-25-webhook-ingest.md`
Spec: `docs/superpowers/specs/2026-08-25-webhook-ingest-design.md`
Status: Ready to start Phase 2b (connection card) or Phase 3 (email ingest)
Last activity: 2026-09-20 — Phase 2 delivered and verified

## Phase 2 outcome

A salon owner pastes one URL into their form tool and their leads arrive,
deduplicated, with no credentials in the form tool. Backend and provisioning API
only, as scoped — no UI.

- **`POST /api/hook/<token>`** — public, unauthenticated, JSON or form-encoded
- **`resolver_role`** — second `NOBYPASSRLS` role for the pre-tenant lookup, so
  that phase is DB-enforced rather than a convention
- **`ingest_admit`** — one `SECURITY INVOKER` function holding token resolution
  and rate accounting; `prosecdef = false` asserted by test
- **Rate limiting in Postgres** — three buckets, one-minute windows, self-pruning
- **72-hour rotation overlap**, enforced at lookup time, with a
  `webhook.previous_token_used` event so the owner can see the old URL in use
- **Five provisioning routes** — list, create, get, revoke, rotate
- **Generic extraction** for every provider, refusing to guess: an address found
  only in a business-shaped key and a bare digit run are both rejected with a
  warning rather than merged wrongly
- **Negative control still passes** — `npm run test:prove-isolation -w @missed-lead/db`

Commits: the Phase 2 series (`4c84394` … `52e31db`) on `feat/webhook-ingest`, not
yet merged to `main`.

## What runs where

| Command | Needs Docker | Covers |
|---|---|---|
| `npm test` | no | web app |
| `npm run test:core` | no | engine, normalization, extraction (159) |
| `npm run test:db` | **yes** | isolation, ingest, merge, resolver_role, sources (129) |
| `npm run test:api` | **yes** | endpoints, JWT, hook, provisioning (86) |
| `npm run test:all` | yes | everything |
| `npm run test:prove-isolation -w @missed-lead/db` | yes | the negative control |

Local stack: `npm run supabase:start`, then `npm run db:migrate`.

## Next phase

**Phase 2b — the connection card**, or **Phase 3 — email ingest**, in either
order. 2b needs Supabase sign-in in the client, which still does not exist; it
consumes `GET /api/sources/<id>` as built. Phase 3 reuses
`api/_lib/ingest.ts` and `packages/core/src/extract.ts` unchanged, supplying a
parsed message in place of a webhook body.
