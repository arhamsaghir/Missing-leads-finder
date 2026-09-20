# Webhook Ingest — Design

**Phase:** 2 of 6, milestone v2.0 (Automated Lead Capture & Recovery)
**Date:** 2026-08-25
**Status:** approved, ready for implementation planning
**Predecessor:** `.planning/phases/phase-1-foundation.md` (complete)

## Goal

A salon owner pastes one URL into their web-form tool and their leads start
arriving in our database, deduplicated, with no further setup and no account
credentials in the form tool.

Phase 2 delivers that path end to end plus the authenticated API an owner's
client will later use to create, rotate, revoke, and check a source. It stops
short of the UI.

## Scope

In scope:

- `POST /api/hook/<token>` — the public, unauthenticated ingest endpoint
- Token issue, rotation with a bounded overlap window, and revocation
- Rate limiting in Postgres
- Provider-agnostic payload field extraction
- `GET/POST /api/sources`, `GET/DELETE /api/sources/<id>`,
  `POST /api/sources/<id>/rotate` — authenticated provisioning and live status
- Integration tests plus manual `curl` verification

Out of scope, with reasons:

- **The "we're listening" connection card.** It needs Supabase sign-in in the
  client, which does not exist yet: `.env.example` declares
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, but no code in `src/`,
  `mobile/`, or `packages/ui/` reads them. Deferred to Phase 2b, which is why
  this phase ships the status *endpoint* the card will consume.
- **Leak detection and notifications.** Phase 4. Ingest stores leads; it does
  not score them. No `getDetectionSettings` call on this path.
- **Estimated-value extraction.** See "Deliberate omissions".
- **Email ingestion.** Phase 3, though it will reuse the extractor built here.

## What already exists

Phase 1 built most of the machinery, tested. This phase is the HTTP layer over
it, not new persistence logic.

| Already built | Where |
|---|---|
| `withIngestScope(db, customerId, fn)` | `packages/db/src/repo/ingest.ts:29` |
| `buildDedupeKey({sourceId, providerEventId, payload})` | `ingest.ts:54` |
| `recordLeadEvent(tx, customerId, event)` | `ingest.ts:78` |
| `upsertLead(tx, customerId, input)` with identity merge | `ingest.ts:270` |
| `mergeLeadFields` — monotonic merge policy | `ingest.ts:201` |
| `normalizeEmail` / `normalizePhone` / `classifyContact` | `packages/core/src/normalize.ts` |
| `lead_sources.webhook_token` / `webhook_token_previous` / `revoked_at` | `packages/db/src/schema/leads.ts:37-43` |
| `lead_events` unique on `(customer_id, dedupe_key)` | `schema/leads.ts:175` |
| `ingest_role`, `NOBYPASSRLS`, scoped by `app.customer_id` | `migrations/0001_ingest_role.sql` |
| `resolveCustomer(req)` — JWKS-verified JWT to tenant | `api/_lib/auth.ts:53` |
| `json` / `problem` / `methodNotAllowed` | `api/_lib/response.ts` |

## Architecture

```
form tool ──POST /api/hook/{token}──► api/hook/[token].ts
                                        │
                                        │ TRANSACTION 1 — pre-tenant
                                        │   set local role resolver_role
                                        │   select * from ingest_admit(token, ip)
                                        │   → customer_id, source_id, token_state,
                                        │     admit, retry_after
                                        │
                                        │ pure, no I/O
                                        │   extractLeadFields(payload)
                                        │
                                        │ TRANSACTION 2 — withIngestScope(customer_id)
                                        │   upsertLead → recordLeadEvent
                                        ▼
owner (JWT) ─────► /api/sources[...]  issue · rotate · revoke · live status
```

Two round trips. `PITFALLS.md:10` asks for a response under 200ms; two
transactions against a pooled connection is comfortably inside that, so nothing
here needs to be deferred to a queue.

### The token-resolution problem, and `resolver_role`

Resolving a token to a tenant is a chicken-and-egg. `ingest_role` holds `SELECT`
on `lead_sources` (`0001_ingest_role.sql:58`) but the policy filters
`customer_id = public.current_ingest_customer_id()` — the value the lookup is
trying to produce. So resolution cannot happen inside `withIngestScope`.

The obvious alternative is to query as `postgres`, which `DATABASE_URL`
connects as. That works, but `postgres` owns the tables and `ENABLE ROW LEVEL
SECURITY` exempts the owner, so a bug in the pre-tenant path could read any
table in the schema. That is a real weakening of the boundary Phase 1
established.

Instead, a second narrow role mirroring `ingest_role`:

```
resolver_role  NOBYPASSRLS NOLOGIN
  SELECT                    on lead_sources           policy USING (true)
  SELECT, INSERT, UPDATE    on ingest_rate_counters
  EXECUTE                   on ingest_admit(text, text)
  nothing at all            on leads, customers, lead_events,
                            lead_identities, detection_settings, push_tokens
```

`USING (true)` on `lead_sources` is not a gap — seeing every tenant's tokens
*is* the lookup. What matters is that the role can reach nothing else, so the
worst a bug in this path can do is confirm whether a token exists.

`public.ingest_admit(p_token text, p_ip text)` is plpgsql and
**`SECURITY INVOKER`** — deliberately not `DEFINER`. A `DEFINER` function owned
by `postgres` would execute with the owner's privileges and constrain nothing;
`INVOKER` means the privileges in effect are `resolver_role`'s, which makes the
narrow grant list above an actual enforcement boundary rather than a convention.

It returns one row:

```
customer_id  uuid       null when the token does not resolve
source_id    uuid       null when the token does not resolve
token_state  text       'current' | 'previous' | 'unknown'
admit        boolean    false when a rate limit is exceeded
retry_after  integer    seconds; null unless admit is false
```

Doing admission and rate accounting in one function keeps the pre-tenant surface
to a single statement the handler cannot get wrong, and means the counter
increment and the limit check cannot race apart.

## Rate limiting

A Postgres counter table, not a vendor service. No new dependency, it survives
cold starts, and it leaves an audit trail an owner-facing "you're being spammed"
message could later read.

```sql
create table ingest_rate_counters (
  bucket        text        not null,
  window_start  timestamptz not null,
  count         integer     not null default 0,
  primary key (bucket, window_start)
);
```

One-minute windows. `window_start = date_trunc('minute', now())`.

The client IP comes from Vercel's `x-forwarded-for`, first entry, which the
platform sets and a client cannot forge in a way that reaches us unchanged. When
the header is absent (local test invocation), the IP buckets are skipped rather
than keyed on a placeholder that every caller would share.

| Bucket | Limit / min | Charged when | Rationale |
|---|---|---|---|
| `src:<source_id>` | 60 | token resolves | A salon gets a handful of leads a day. Only ever catches a runaway integration loop. |
| `unk:<ip>` | 20 | token does not resolve | The scanner defence from `PITFALLS.md:7`. |
| `ip:<ip>` | 300 | every request | Coarse backstop against a single host hammering us. |

Valid-token traffic is deliberately **not** subject to a tight per-IP limit.
Typeform posts from its own egress addresses on behalf of every one of its
customers, so a tight IP limit on known-good traffic would throttle our tenants
for each other's volume. `ip:<ip>` at 300/min is high enough to never bind on
legitimate shared-egress traffic.

**The counter increment commits with transaction 1**, which is separate from and
earlier than the ingest write in transaction 2. There is no third transaction.
This matters: if the counters shared the *ingest* transaction, a retry storm
whose deliveries all deduped would roll its own counters back and abuse would be
free.

Pruning happens inside `ingest_admit`: on roughly 1% of calls (`random() < 0.01`)
delete rows with `window_start < now() - interval '2 hours'`. No cron job, no
unbounded growth. `vercel.json`'s `crons` array stays empty until Phase 4.

Over-limit returns **429** with a `retry-after` header. Nothing is written to
`lead_events` — a spam flood must not become an audit-log flood.

## Tokens, rotation, revocation

**Generation.** 32 random bytes from `node:crypto`, base64url — 43 characters.
Lives in `packages/db/src/repo/sources.ts` for the same reason `buildDedupeKey`
does: it needs `node:crypto`, which keeps `packages/core` dependency-free.

**A single opaque token.** `/api/hook/<token>`, nothing about the tenant
inferable from the URL, looked up against the existing unique index. Rotation
swaps a string and needs no URL-shape change.

**Stored in plaintext.** The honest cost: a database dump leaks live hook URLs.
Accepted, because the URL must be displayed back to the owner — a hash cannot be
shown — and the worst outcome from a leaked hook URL is injected junk leads,
recoverable by one rotation. Lookup is also an exact match on an existing unique
index.

**Rotation.** Current token moves to `webhook_token_previous`, a new token
becomes `webhook_token`, and `token_rotated_at` (new column) is stamped. The
previous token is accepted for **72 hours**, enforced at lookup time in
`ingest_admit` rather than by a sweep. Time-bounded rather than manual because a
manual window never gets closed.

Every previous-token hit records a `lead_events` row of kind
`webhook.previous_token_used`. That row is what lets the status endpoint tell an
owner "your old URL is still being used" — the alert `PITFALLS.md:12` asks for.
The lead itself is still ingested normally; a rotation must not silently drop
real leads.

Known limitation, documented rather than engineered around: the column is
singular, so rotating twice inside 72 hours invalidates the original token
immediately.

**Revocation.** Sets `revoked_at` and **nulls both token columns**, so the
secret ceases to exist rather than merely being flagged. Never a hard delete —
`leads.source_id` references the row (`schema/leads.ts:72`).

## Payload extraction

`packages/core/src/extract.ts`. Pure, zero dependencies, runs under
`npm run test:core` with no Docker. Every provider goes through one code path: a
recursive walk of the JSON collecting candidate values with the key path that
produced each one, then scoring.

`raw_payload` is **always** stored. When nothing is found, the event is recorded
with a `parse_warning` and no lead — never a rejection. An owner debugging a
misconfigured form needs to see that we received something.

### Two ways a naive deep scan silently corrupts revenue

Both mitigations follow the rule already set by `normalizeEmail`
(`normalize.ts:26-30`): refuse to merge rather than merge wrongly, because
`mergeLeadFields` is monotonic and a bad merge cannot be undone once revenue has
been attributed to it.

**1. The business's own email address.** Notification-shaped payloads carry
`from`, `reply_to`, or `owner` fields holding the *salon's* address. That value is
identical on every submission, so a naive scan would match one
`lead_identities` row every time and collapse the entire dataset onto a single
lead. Not a crash — a slow, silent corruption of the one number the product
sells.

Mitigation: keys matching `/^(from|sender|owner|account|admin|to|reply[_-]?to)$/i`
are excluded from email candidacy. Keys matching `/mail/i` are preferred. If the
only candidate came from an excluded key, record a `parse_warning` and store no
email rather than guessing.

**2. Invented phone numbers.** Any 10-digit run normalizes to a plausible phone
(`normalize.ts:45`): an order id, a zip+4 with an extension, an epoch timestamp.
A wrong phone creates a wrong identity, which merges two unrelated humans.

Mitigation: a phone candidate needs **either** a key hint
(`/phone|tel|mobile|cell/i`) **or** visible formatting (`+`, parentheses,
dashes, or spaces between digit groups). A bare digit run with neither is
rejected with a `parse_warning`.

### Other fields

- **Name** — keys matching `/name/i`, preferring `full_name` / `name` over
  `first_name` alone; `first + last` joined when both are present. Falls back to
  `upsertLead`'s `'Unknown'` default.
- **Notes** — keys matching `/message|comment|note|enquir|inquir|detail|descript/i`,
  first match, truncated to 2000 characters.
- **Provider event id** — keys matching
  `/^(id|event_id|submission_id|response_id|form_response_id)$/i` at any depth,
  passed to `buildDedupeKey` as `providerEventId`. Absent, the canonical payload
  hash is used, which `buildDedupeKey` already handles (`ingest.ts:59-62`).

### Timestamps

`leads.created_at` is `notNull` and drives every leak rule, so it must be right.
A payload timestamp is used only when it parses **and** falls within
`[now - 90 days, now + 5 minutes]`. Otherwise receipt time, plus a
`parse_warning`.

The window exists because an epoch-seconds value misread as milliseconds lands
in 1970, which makes every lead instantly and maximally leaked and inflates
reported lost revenue. That is the same class of failure as the parser lesson in
`PROJECT.md:98`, where `last_contact_at` was mapped but never written and three
of four leak rules silently disabled.

### Deliberate omissions

- **`estimatedValue` is never extracted.** The column default stands
  (`schema/leads.ts:89`). Guessing a dollar figure out of arbitrary JSON writes
  straight into the headline number; a per-source average ticket is a settings
  decision, not a parsing one.
- **`status` is never extracted.** Every ingested lead is `'new'`.
- **No provider-specific adapters.** One heuristic for all providers, per the
  locked decision. If a provider later proves genuinely unparseable, that is
  evidence for an adapter, not a reason to pre-build one.

## Idempotency and write ordering

`ingest_role` holds only `SELECT, INSERT` on `lead_events`
(`0001_ingest_role.sql:81`) — no `UPDATE`. So an event cannot be inserted first
and have its `lead_id` backfilled. The order is fixed:

1. `upsertLead` — insert or merge, returns `leadId`
2. `recordLeadEvent` — insert carrying that `leadId`

`recordLeadEvent` already uses `onConflictDoNothing` on
`(customer_id, dedupe_key)` and returns `{recorded: false}` on a repeat
(`ingest.ts:105-109`). When that happens the delivery is a retry, so the handler
**rolls transaction 2 back** and returns `200 {deduped: true}`. The redundant
upsert leaves no trace, and two concurrent retries are still resolved by the
unique constraint rather than by timing.

A cheap `SELECT` on the dedupe key before the write short-circuits the common
retry case without reaching the rollback path at all.

Rolling back is deliberate. Letting the redundant `upsertLead` commit would call
`mergeLeadFields` a second time — harmless today, since the merge is monotonic
and idempotent, but it would make correctness depend on that property holding
forever.

## Response contract

The public endpoint. Always JSON via `api/_lib/response.ts`, never a body that
echoes a token.

| Condition | Status | Body |
|---|---|---|
| Accepted, new lead | 200 | `{ok: true, deduped: false}` |
| Accepted, retry | 200 | `{ok: true, deduped: true}` |
| Parsed nothing usable | 200 | `{ok: true, parsed: false}` — event stored with warnings, no lead |
| Unknown / revoked / expired-previous token | 404 | `problem(404, 'not_found')` |
| Rate limited | 429 | `problem(429, 'rate_limited')` + `retry-after` header |
| Body is unparseable | 400 | `problem(400, 'invalid_body')` — no lead, no event |

**Request order is admit-then-parse.** The rate counter is charged before the
body is read, so a flood of malformed bodies is limited exactly like any other
traffic. A 400 therefore still consumes quota, which is correct.

**Accepted body types.** `application/json`, and
`application/x-www-form-urlencoded` flattened into a single-level object. Form
tools vary and several post form-encoded by default; rejecting those would fail
in the field for a reason the owner could never diagnose. An unparseable body of
either type, or any other content type, is the 400 above — no `lead_events` row,
because a request we cannot even parse has no dedupe key and would let a
malformed-body loop fill the audit log.
| Method not `POST` | 405 | `methodNotAllowed(['POST'])` |

**Unknown tokens return 404, not a silent 200.** `PITFALLS.md:8` says "reject
unknown tokens silently"; 404 satisfies that in the sense that matters — it tells
a scanner nothing it did not already know, since the token was its own guess.
And it appears in the form tool's own delivery log, which is the only mechanism
by which an owner ever discovers they pasted the URL wrong. A silent 200 makes a
permanently broken integration look healthy forever.

## Provisioning API

Follows `api/me.ts` exactly: a named method export plus a `default` handler that
returns `methodNotAllowed` on a method mismatch. Auth via
`resolveCustomer(req)`.

| Route | Method | Purpose |
|---|---|---|
| `/api/sources` | GET | List the tenant's sources with live status |
| `/api/sources` | POST | `{label, kind: 'webhook'}` → `{id, label, webhookUrl}` |
| `/api/sources/[id]` | GET | One source with status |
| `/api/sources/[id]` | DELETE | Revoke |
| `/api/sources/[id]/rotate` | POST | Rotate, returns the new `webhookUrl` |

The full token is returned on create and rotate, and in `GET` responses — it is a
URL the owner needs to copy, not a password.

`webhookUrl` is built from a new `PUBLIC_APP_URL` env var. Constructing it from
the inbound request's `host` header would let a proxied or spoofed host produce a
URL pointing somewhere else.

**Status payload** — this is the contract Phase 2b's connection card consumes:

```json
{
  "id": "...", "label": "Website form", "kind": "webhook",
  "webhookUrl": "https://.../api/hook/...",
  "createdAt": "...", "revokedAt": null,
  "lastEventAt": "...", "eventCount": 12, "leadCount": 9,
  "previousTokenInUse": false, "lastParseWarningAt": null
}
```

`previousTokenInUse` is true when a `webhook.previous_token_used` event exists
inside the current rotation window.

### Tenant scoping on this path

These handlers run as `postgres`, which owns the tables, so RLS does not
constrain them. Tenant scoping is therefore an explicit
`where customer_id = auth.customerId` in application code — exactly what
`api/me.ts:22` already does. This is stated plainly so no future reader assumes
the database is enforcing it here.

A source id belonging to another tenant returns **404, not 403**, per the
enumeration-oracle note in `response.ts:14`: "not found" and "not yours" must be
indistinguishable from outside.

## Schema changes — migration `0003`

`0003_webhook_ingest.sql`, following the hand-written style of `0001` and `0002`
(Drizzle emits neither `GRANT` nor `CREATE ROLE`, the lesson recorded in
`PROJECT.md:90`).

1. `alter table lead_sources add column token_rotated_at timestamptz` — the
   Phase 1 schema has `webhook_token_previous` but no timestamp, so a bounded
   overlap window is currently impossible to enforce.
2. `create table ingest_rate_counters (...)`
3. `create role resolver_role NOBYPASSRLS NOLOGIN`, guarded by the same
   `pg_roles` existence check as `0001_ingest_role.sql:26-32`
4. Grants and policies for `resolver_role` as listed above
5. `create function public.ingest_admit(text, text) ... security invoker`
6. `grant resolver_role to postgres`, plus the conditional
   `grant resolver_role to service_role` mirroring `0002_grants.sql:51-57`
7. RLS enabled on `ingest_rate_counters`, with `authenticated` and `anon`
   granted nothing — it holds no tenant data an owner needs and no data an
   anonymous visitor may see

The Drizzle schema gains `packages/db/src/schema/rateCounters.ts` and the
`tokenRotatedAt` column so generated types stay accurate, but the migration SQL
is authored by hand.

### FORCE ROW LEVEL SECURITY stays off

`phase-1-foundation.md` §B stated that force would be applied.
`0000_initial_multitenant_schema.sql` has `ENABLE ROW LEVEL SECURITY` on all
seven tables and no `FORCE` on any of them.

Leaving it off, deliberately. `ENABLE` exempts the table owner, and `postgres`
owns these tables — which is exactly why the pre-tenant lookup, the provisioning
handlers, and test seeding all work. Adding `FORCE` now would break all three
for no Phase 2 security gain, because `ingest_role` and `resolver_role` are not
owners and are already fully subject to policy. The negative control
(`npm run test:prove-isolation -w @missed-lead/db`) proves the policies bind for
the roles that matter.

To be logged in `PROJECT.md` as a known deviation from the Phase 1 plan, to
revisit if and when provisioning moves off the owner role.

## Files

New:

| File | Responsibility |
|---|---|
| `packages/core/src/extract.ts` | Deep-scan field extraction. Pure, no deps. |
| `packages/core/src/__tests__/extract.test.ts` | Fixtures + adversarial cases. |
| `packages/db/src/schema/rateCounters.ts` | `ingest_rate_counters` table. |
| `packages/db/src/repo/sources.ts` | create / rotate / revoke / status / admit wrapper / token generation. |
| `packages/db/migrations/0003_webhook_ingest.sql` | Hand-written, per above. |
| `packages/db/src/__tests__/sources.test.ts` | Rotation window, revocation, admission, rate limits, negative controls. |
| `api/_lib/ingest.ts` | Shared orchestration: admit → extract → write. Phase 3's email path reuses it. |
| `api/hook/[token].ts` | Public endpoint. Thin. |
| `api/sources.ts` | List, create. |
| `api/sources/[id].ts` | Get, revoke. |
| `api/sources/[id]/rotate.ts` | Rotate. |
| `api/__tests__/hook.test.ts` | Public endpoint integration tests. |
| `api/__tests__/sources.test.ts` | Provisioning integration tests. |

Modified:

| File | Change |
|---|---|
| `packages/core/src/index.ts` | Export `./extract`. |
| `packages/db/src/schema/leads.ts` | Add `tokenRotatedAt`. |
| `packages/db/src/schema/index.ts` | Export `rateCounters`. |
| `packages/db/src/repo/index.ts` | Export `sources`. |
| `.env.example` | Add `PUBLIC_APP_URL`. |
| `.planning/STATE.md`, `.planning/PROJECT.md` | Phase 2 outcome, new decisions, the FORCE RLS deviation. |

`vercel.json` needs no change: the SPA rewrite already excludes `/api/`
via the negative lookahead `/((?!api/).*)`, so `api/hook/[token].ts` routes
correctly.

## Testing

Mirrors the existing split — fast pure tests without Docker, integration tests
with it.

**`npm run test:core`** — extraction, no Docker. Real-shaped fixtures from
Typeform, Jotform, Calendly, and a flat Zapier-style payload, plus the
adversarial cases that motivate the design:

- business address in `from` → no email extracted, warning recorded
- bare 10-digit order id → no phone extracted, warning recorded
- formatted phone with no key hint → extracted
- unformatted digits under a `phone` key → extracted
- epoch-seconds timestamp → out of window, falls back to receipt time
- `{}` and deeply nested empty objects → no lead, warning
- payload with both a personal and a business email → personal one wins

**`npm run test:db`** — Docker. Rotation inside and outside 72 hours, revocation
nulling both tokens, `ingest_admit` returning each `token_state`, rate limits
tripping at their thresholds, counter pruning. Plus negative controls in the
spirit of the existing suite (`tenant-isolation.test.ts:211-277`):

- `resolver_role` cannot `select` from `leads`, `customers`, or `lead_events`
- `resolver_role` has `rolbypassrls = false`
- a token belonging to tenant A never yields a row visible to tenant B
- `ingest_admit` is `SECURITY INVOKER` (assert `prosecdef = false` in `pg_proc`)

**`npm run test:api`** — Docker. Handlers invoked with real `Request` objects,
following `api/__tests__/endpoints.test.ts`: lazy handler import in `beforeAll`
so env is set first, real ES256 tokens from `admin.auth.admin.createUser` plus
`signInWithPassword`, `RUN = Date.now().toString(36)` for collision-free
fixtures, cleanup in `afterAll`.

Cases: happy path creates a lead; identical redelivery returns
`{deduped: true}` and writes nothing; unknown, revoked, and expired-previous
tokens return 404; a valid previous token ingests *and* records
`webhook.previous_token_used`; over-limit returns 429 with `retry-after`; a
form-urlencoded body is accepted and flattened; an unparseable body returns 400
with no `lead_events` row; `GET` returns 405; every provisioning route rejects a
missing token, an invalid token, and another tenant's source id (404).

**Manual verification.** A `curl` sequence in the plan: create a source with a
real JWT, POST a Typeform-shaped payload to the returned URL, confirm the lead
via `/api/sources/<id>`, replay the same POST and see `deduped: true`, rotate,
POST to the old URL and see it accepted with the previous-token event, revoke,
POST again and see 404.

## Risks

1. **The extractor is a heuristic and will mis-parse some real payload.** The
   design's answer is that failures are visible (`parse_warnings`, always-stored
   `raw_payload`) and biased toward storing less rather than guessing. Some
   genuine leads will arrive with no contact and therefore undeduplicable. That
   is the correct side to err on: an un-merged duplicate overstates by one lead,
   while a wrong merge silently destroys two records and cannot be undone.
2. **72 hours may be short for an owner who rotates and then goes on holiday.**
   Mitigated by the `previous_token_used` event making the situation visible.
   Revisit if it bites.
3. **Rate limits are guesses.** 60/min per source is generous for the stated
   customer profile but unvalidated. The counter table itself is the instrument
   for tuning them.
4. **The counters table adds a write to every request, including rejected ones.**
   Bounded by pruning to two hours. If it ever becomes a bottleneck, the answer
   is a shorter retention window, not a vendor.
5. **`node:crypto` in `packages/db` keeps that package Node-only.** Already true
   via `buildDedupeKey`; noted so nobody tries to import it into the browser
   bundle.

## Locked decisions

| Decision | Rationale |
|---|---|
| Backend + provisioning API this phase, no UI | The connection card needs client sign-in that does not exist; the status endpoint unblocks it. |
| Postgres counter table for rate limiting | No new vendor, survives cold starts, gives an audit trail. |
| Generic deep-scan extraction, no per-provider adapters | One code path for every provider; adapters only on evidence. |
| Single opaque token in the URL path | Nothing tenant-identifying is guessable; rotation swaps a string. |
| `resolver_role` for the pre-tenant phase | Makes the pre-tenant boundary DB-enforced rather than a convention. |
| `SECURITY INVOKER` on `ingest_admit` | `DEFINER` would run as the table owner and constrain nothing. |
| Rate counters commit outside the ingest transaction | Otherwise a deduped retry storm rolls back its own counters and abuse is free. |
| Upsert lead, then event; roll back on dedupe conflict | `ingest_role` has no `UPDATE` on `lead_events`, so `lead_id` cannot be backfilled. |
| 72-hour rotation overlap, time-bounded | A manual window never gets closed. |
| Unknown token → 404 | Tells a scanner nothing; surfaces a mis-pasted URL in the form tool's own delivery log. |
| Detection deferred to Phase 4 | Ingest stores leads; it does not score them. |
| `estimatedValue` never extracted from payloads | Guessing writes directly into the number the product sells. |
| `FORCE ROW LEVEL SECURITY` stays off | `ENABLE` exempts the owner, which is what the pre-tenant and provisioning paths depend on. Logged as a deviation. |
