# Phase 1 — Multi-Tenant Foundation (v2.0 milestone)

## Context

v1 of Missed Lead Revenue Finder works, but requires the user to paste or upload a CSV.
Per `.planning/notes/product-direction-auto-capture.md`, ~90% of the target customers
(non-technical local business owners) will never export a CSV — so the product has to
observe leads itself. That's the v2.0 milestone: automatic ingestion (webhooks + email
forwarding) plus proactive missed-revenue alerts.

Everything in that milestone needs tenancy. There is **no backend, no database, no auth,
and no persistence of any kind** in the repo today — state lives in `useState` in
`src/App.tsx` and dies on reload. So Phase 1 is the foundation every later phase sits on:
a multi-tenant Postgres schema with isolation proven by test, and a session→customer
resolver. `.planning/research/ARCHITECTURE.md:47-54` puts it first in the build order for
this reason.

Two Phase-1-only constraints drive the design, both flagged in
`.planning/research/PITFALLS.md` as expensive-to-retrofit:

- **Dedupe keys must exist before the first ingest ships** (#2, #11). Two different
  problems: a duplicate webhook POST, and the *same human* arriving via web form **and**
  forwarded email. The second one double-counts lost revenue — which corrupts the single
  number the entire product promise rests on.
- **RLS must go on at migration time** (#8), with a test proving customer A cannot read
  customer B.

**Outcome:** a migrated, RLS-enforced database, a JWT→`customer_id` resolver, and a
passing cross-tenant isolation test. No UI — Phase 1 is backend skeleton only, so Phase 2
(webhook ingest, the first user-visible value) is unblocked immediately.

## Decisions locked before planning

| Decision | Choice |
|---|---|
| Auth + DB | **Supabase Auth + Supabase Postgres** (one vendor) — *not* Neon |
| ORM | Drizzle (schema, migrations, queries) |
| Scope | Backend + tests only, no sign-in UI |
| Pre-existing bugs fixed here | parser date fields, npm workspace protocol, leak thresholds |

Why Supabase Postgres over the researched Neon: RLS policies need `auth.uid()`. With
Supabase both halves are one vendor, so policies read the verified JWT natively with zero
cross-vendor plumbing — tenant isolation genuinely lives in the DB as
`ARCHITECTURE.md:35` intends. Neon's stateless HTTP driver also can't hold the per-session
variable that RLS normally leans on, which would have pushed isolation back up into app
code — the exact thing PITFALLS #8 warns about.

---

## Repository

**Work in `/Users/arhamsaghir/src/project-9`** — a hand-rebuilt clean copy, pushed to
`github.com/arhamsaghir/Missing-leads-finder`. The original at
`~/Documents/All Projects/project-9(app)` is iCloud-synced and its `.git` is corrupt
(`.git.broken.nosync/` in `.gitignore` is the tell — iCloud syncing a live `.git`
directory is a known cause of `unable to read tree`). Do not work there.

Differences from the copy this plan was originally researched against, verified
2026-08-24:

| | iCloud copy | **This repo** |
|---|---|---|
| git | corrupt, unreadable history | **healthy** — clean tree, `fsck` silent, remote set |
| HEAD | `8a7ba60` | `20c04b7` (+1: adds `packages/core/vitest.config.ts`) |
| `mobile/src/**` | empty dirs | **populated** — 4 screens + `useLeadAnalysis.ts` |
| `packages/ui/src/hooks/` | empty | **populated** — `index.ts` present |
| `.planning/` | present | copied in as part of this step |

Consequences: **git re-init is unnecessary** (originally Step 0a — dropped), and risk #5
below is partly resolved. Still confirmed present in this repo: the parser date-field bug,
`workspace:*` in root `package.json:44-45`, and the module-constant thresholds at
`leaks.ts:19-21`. Note `mobile/src/components/` still does not exist.

## Step 0 — Unblock (do first, in order)

**0a. `.gitignore` does not cover `.env*`.** Verified in this repo: `node_modules/`,
`dist/`, `.expo/`, `.omo/`, `.superpowers/`, `.impeccable/`, `.cursor/`, `.codegraph`,
`.DS_Store`, `.git.broken.nosync/` — no env entry. Add `.env`, `.env.*`,
`!.env.example` **before** any key touches disk. Also add `graphify-out/` (currently
untracked noise) and commit `.planning/`.

**0b. Fix the npm workspace protocol.** Root `package.json:44-45` declares
`"@missed-lead/core": "workspace:*"` — pnpm/yarn-berry syntax that npm does not
understand — while `mobile/package.json` correctly uses `file:../packages/core`.
Normalize root to `file:` (or `*`) so installs are deterministic before adding
dependencies.

**0c. Verify the Drizzle RLS API surface — do not skip.** A docs-research pass was
blocked mid-flight by a tool outage, so the following is **unverified** and the schema
work depends on it. Confirm against <https://orm.drizzle.team/docs/rls> and
`node_modules/drizzle-orm` before writing policies:

- exact `pgPolicy(name, { as, for, to, using, withCheck })` option names
- `.enableRLS()` vs `pgTable(...).enableRLS()` placement
- whether `drizzle-orm/supabase` exports `authenticatedRole` / `anonRole` / `serviceRole`
  / `authUid` (a "Using with Supabase" section does exist on that page)
- whether `crudPolicy` is Supabase-available or Neon-only
- `drizzle.config.ts` → `entities: { roles: { provider: 'supabase' } }` shape, so
  drizzle-kit doesn't try to drop Supabase's built-in roles
- **Drizzle v1.0.0-beta.2 exists alongside stable 0.45.2.** Pin explicitly; the 0.x→1.0
  boundary is exactly where the RLS surface is most likely to have moved.

If `pgPolicy` can't express a policy, write it as a raw SQL migration in
`packages/db/migrations/` — a hand-written `.sql` file is completely acceptable here and
better than fighting the abstraction.

**Verified versions** (from npm registry): `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`,
`zod@4.4.3` (v4 is stable — v3 tutorials are stale), `postgres@3.4.9`, `jose@6.2.10`,
`@supabase/ssr@0.12.4`. Unconfirmed, re-check at install: `@supabase/supabase-js`,
`supabase` CLI.

---

## A. Schema

New workspace package: **`packages/db`** (`@missed-lead/db`) — schema, migrations, and
repository functions. Kept out of `packages/core` so core stays a pure, dependency-free
engine.

### Two decisions that shape everything else

**1. Split `contact` into `email` + `phone` in the DB.** The existing `Lead.contact` is a
single polymorphic, unvalidated string (email *or* phone). You cannot reliably dedupe on
that, and dedupe is load-bearing — PITFALLS #11's double-counted revenue is a
correctness bug in the product's headline number. The TS `Lead` type keeps `contact`
unchanged (all three test files' `baseLead` factories depend on it); the hydrator sets
`contact = email ?? phone`. This is a mapping layer, not a breaking change.

**2. Identities get their own table.** A lead can be reachable by both an email and a
phone, and the same human can arrive twice through different pipes. A one-column dedupe
key can't model that. `lead_identities` lets an incoming lead match on *any* identity and
merge onto the existing row.

### Tables

```
customers          id uuid pk default gen_random_uuid()
                   auth_user_id uuid not null unique → auth.users(id) on delete cascade
                   business_name text not null
                   created_at timestamptz not null default now()
```
`auth_user_id` is a separate column rather than `customers.id = auth.users.id`. Solo-owner
today (team roles are an anti-feature per `FEATURES.md:37`), but this keeps
many-users-per-customer from requiring a migration of every FK later. Cheap insurance.

```
lead_sources       id uuid pk
                   customer_id uuid not null → customers(id) on delete cascade
                   kind text not null check (kind in ('webhook','email','csv'))
                   label text not null
                   webhook_token text unique              -- high-entropy, PITFALLS #1
                   webhook_token_previous text            -- rotation overlap, PITFALLS #3
                   inbound_address text unique            -- @in.missedlead.app
                   created_at / revoked_at timestamptz
                   index (customer_id)
```

```
leads              id uuid pk default gen_random_uuid()   -- surrogate PK
                   customer_id uuid not null → customers(id) on delete cascade
                   external_lead_id text                  -- the source's own id (CSV lead_id)
                   created_at timestamptz not null         -- when the LEAD arrived
                   customer_name text not null default 'Unknown'
                   email text / phone text
                   email_normalized text / phone_normalized text
                   source text not null default 'Manual'   -- free text, matches Lead.source
                   status lead_status not null default 'new'
                   last_contact_at / next_follow_up_at timestamptz
                   estimated_value integer not null default 25000   -- CENTS, never float
                   notes text not null default ''
                   first_seen_source_id / merged_into_lead_id uuid
                   ingested_at timestamptz not null default now()
                   index (customer_id, created_at desc)
                   index (customer_id, status)
```
`estimated_value` is `integer` cents throughout — a float column here silently corrupts
money. `id` replaces the current `lead_id` fallback of positional `` `row-${i}` ``
(`parser.ts:96`), which collides across two imports of different files.

```
lead_identities    id uuid pk
                   customer_id uuid not null → customers(id) on delete cascade
                   lead_id uuid not null → leads(id) on delete cascade
                   kind text not null check (kind in ('email','phone'))
                   value_normalized text not null
                   unique (customer_id, kind, value_normalized)   ← identity dedupe
```

```
lead_events        id uuid pk
                   customer_id uuid not null → customers(id) on delete cascade
                   lead_id uuid → leads(id) on delete cascade
                   source_id uuid → lead_sources(id)
                   kind text not null           -- 'ingested','status_changed','contacted'
                   dedupe_key text not null
                   raw_payload jsonb
                   parse_errors jsonb not null default '[]'
                   parse_warnings jsonb not null default '[]'
                   occurred_at / created_at timestamptz
                   unique (customer_id, dedupe_key)              ← idempotency dedupe
                   index (customer_id, lead_id, occurred_at desc)
```
`row_errors` / `row_warnings` live here as `parse_errors` / `parse_warnings` — they're
per-ingest diagnostics, not attributes of a lead. They stay on the TS `Lead` type
(hydrated as `[]`) because every `baseLead` factory includes them.

```
detection_settings customer_id uuid pk → customers(id) on delete cascade
                   slow_reply_hours integer not null default 24
                   stale_quote_days integer not null default 7
                   default_average_ticket integer not null default 25000   -- cents
                   updated_at timestamptz
```
Defaults mirror `leaks.ts:19-20` and `revenue.ts:11` exactly, so behaviour is unchanged
until a customer edits them.

```
push_tokens        id uuid pk
                   customer_id uuid not null → customers(id) on delete cascade
                   platform text not null check (platform in ('expo','web'))
                   token text not null / endpoint text
                   last_seen_at timestamptz                -- token rot, PITFALLS #10
                   unique (customer_id, platform, token)
```
Created now (empty) so Phase 5 doesn't need a tenancy migration.

### Two dedupe keys, precisely

| Problem | Key | Where |
|---|---|---|
| Duplicate POST (Typeform retry, Calendly redelivery) | `dedupe_key = sha256(source_id + (provider_event_id ?? canonical_json(payload)))` | `unique(customer_id, dedupe_key)` on `lead_events` |
| Same human via form **and** email | normalized identity | `unique(customer_id, kind, value_normalized)` on `lead_identities` |

Normalization (in `packages/core`, pure + unit-tested):
- **email** → `trim().toLowerCase()`. Nothing cleverer — no gmail dot-stripping or
  plus-tag removal; that over-merges distinct people and is unrecoverable once merged.
- **phone** → strip all non-digits; drop a leading `1` if 11 digits; keep the last 10.
  NANP-shaped, which fits the local-service-business target. Store the original in
  `phone` untouched.

Ingest resolves: normalize → look up `lead_identities` → hit means merge onto that
`lead_id`, miss means insert lead + identity rows. Upsert, never blind insert
(PITFALLS #2).

---

## B. RLS

Every tenant table gets `enable row level security` **in the same migration that creates
it**, plus `force row level security` on tenant tables so even the table owner is subject
to policy.

Helper function, so the customer lookup is written once:

```sql
create or replace function public.current_customer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.customers where auth_user_id = (select auth.uid())
$$;
```

Policy shape, repeated per tenant table:

```sql
create policy tenant_isolation on public.leads
  for all to authenticated
  using      (customer_id = (select public.current_customer_id()))
  with check (customer_id = (select public.current_customer_id()));
```

`(select ...)` wrapping is deliberate — it lets Postgres cache the value as an InitPlan
instead of re-evaluating per row. `customers` itself keys on
`auth_user_id = (select auth.uid())`. **Verify the `(select auth.uid())` pattern is still
the documented recommendation** against
<https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv>
(fetched but not yet read due to the tool outage).

### The webhook hole — read this twice

Webhook ingest is **unauthenticated by design**: a form tool POSTs to a secret URL. There
is no user JWT, so `auth.uid()` is null and every policy above evaluates false. This is
the single biggest isolation risk in the whole design.

**Recommended:** a dedicated `ingest_role` that is **not** `BYPASSRLS`. Each ingest write
runs inside a transaction that sets a local GUC, with policies keyed on it:

```sql
-- per request
begin;
set local app.customer_id = '<resolved-from-webhook-token>';
-- ... writes ...
commit;

create policy ingest_scoped on public.leads
  for all to ingest_role
  using      (customer_id = current_setting('app.customer_id', true)::uuid)
  with check (customer_id = current_setting('app.customer_id', true)::uuid);
```

A bug in the ingest handler then can't write across tenants — the DB refuses. This needs a
**transaction-capable** connection (Supavisor transaction mode + `postgres.js`), not a
stateless HTTP driver — a second reason Supabase beat Neon here.

**Fallback** if the pooler fights the GUC: `service_role` (which bypasses RLS entirely),
but *only* reachable through a single repository module —
`packages/db/src/repo/ingest.ts` — that takes `customerId` as its first argument on every
function. Every write funnels through one auditable file. Note the tradeoff plainly:
this moves isolation from the DB back into app code for the ingest path only.

The service-role key must never reach the client. It is server-only, unprefixed.

---

## C. The isolation test — the phase's acceptance gate

`packages/db/src/__tests__/tenant-isolation.test.ts`, vitest, against a **local Supabase**
(`supabase start`, requires Docker; `supabase db reset` between runs).

```
seed:   customer A (user A) with 3 leads · customer B (user B) with 2 leads
assert: A's client (anon key + A's JWT) selecting leads → exactly 3, all customer_id = A
assert: B's client → exactly 2
assert: A selecting B's specific lead id → 0 rows (empty, not error — RLS filters)
assert: A inserting a lead with customer_id = B → rejected by with check
assert: A updating one of B's leads → 0 rows affected
assert: repeat for lead_events, lead_identities, detection_settings, push_tokens
assert: ingest path with A's webhook token cannot write a row carrying B's customer_id
```

Two real sessions come from `supabase.auth.signUp()` against the local instance, then
`createClient(url, ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + jwt }}})`
per tenant. Critically: use the **anon** key for assertions — a service-role client
bypasses RLS and would make this test pass while proving nothing. Add that as a comment in
the file; it's the easiest way for this test to silently rot.

**pglite is not a substitute.** It has no GoTrue/`auth` schema, so `auth.uid()` doesn't
exist and the policies under test can't even be created. Docker is required. *(Flagged for
verification — this was on the unread-docs list.)*

---

## D. Session → customer_id resolver

No API layer exists today, so these are all new:

```
api/_lib/auth.ts        resolveCustomer(req: Request): Promise<Resolved | AuthFailure>
api/_lib/db.ts          getDb() — postgres.js + drizzle, module-scope reuse
api/_lib/response.ts    json() / problem() helpers
api/health.ts           GET → { ok: true } — proves the function path works end to end
api/me.ts               GET → { customerId } — proves the resolver works end to end
```

```ts
type Resolved    = { ok: true;  userId: string; customerId: string; jwt: string };
type AuthFailure = { ok: false; status: 401 | 403; code: string };
```

Verification uses **`supabase.auth.getClaims()`**, not `getUser()`. Confirmed from the
Supabase docs page: `getClaims` "verif[ies] the JWT against the server's JSON Web Key Set
endpoint `/.well-known/jwks.json` which is often cached, resulting in significantly faster
responses. Prefer this method over `GoTrueClient.getUser` which always sends a request to
the Auth server." One network round-trip per request, removed. `jose` + cached JWKS is the
manual equivalent if we want zero SDK on the hot path.

Failure modes are explicit, never silent: missing/malformed header → 401; valid JWT but no
`customers` row → 403 `no_customer` (not an auto-create — provisioning is a deliberate act,
and silently minting tenants on a stray token is how cross-tenant bugs start).

---

## E. `packages/core` changes

**Fix the parser bug.** `last_contact_at` and `next_follow_up_at` are in `HEADER_MAP`
(`parser.ts:35-36`) but never written into the object pushed at `parser.ts:125-136`. Every
CSV lead therefore looks `no_reply`, and `slow_reply` / `no_follow_up` / `stale_quote` are
unreachable through the real CSV path — half the engine is dead. The DB would faithfully
persist nulls the parser can never fill. Add both fields to the pushed object. TDD: the
failing test goes in `parser.test.ts` first (parse a CSV *with* those columns, assert they
survive) — the existing 70-line file asserts nothing about their absence, so nothing
breaks.

**Parameterize thresholds** so `detection_settings` has something to bind to:

```ts
export interface DetectionConfig {
  slowReplyHours: number;   // default 24
  staleQuoteDays: number;   // default 7
}
export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  slowReplyHours: 24, staleQuoteDays: 7,
};

export function detectLeaks(
  leads: Lead[],
  now: Date = new Date(),
  config: DetectionConfig = DEFAULT_DETECTION_CONFIG,
): LeakSummary
```
Third positional arg with a default → both existing call sites (`src/App.tsx:23`, and
every test) keep working untouched.

**One source of truth for statuses**, so the Postgres enum is generated rather than
retyped. Currently the list is hardcoded in four places — `parser.ts:42`, `leaks.ts:21`,
`revenue.ts:18`, `revenue.ts:23` — and they've already diverged: `revenue.ts:23`'s
`isRecovered` counts `booked` as recovered while `leaks.ts:21` treats it as merely
terminal.

```ts
export const LEAD_STATUSES = ['new','contacted','qualified','booked','lost','recovered','won'] as const;
export type LeadStatus = typeof LEAD_STATUSES[number];
export const TERMINAL_STATUSES = ['booked','lost','recovered','won'] as const;
export const RECOVERED_STATUSES = ['recovered','won','booked'] as const;
```
Then `pgEnum('lead_status', LEAD_STATUSES)`. Point all four sites at these constants.
Keep the `booked`-is-recovered behaviour as-is — it's a product question, not a Phase 1
refactor; just make it explicit and named instead of an accident.

**Delete the duplicates.** `src/parser.ts`, `src/leaks.ts`, `src/revenue.ts` are
one-line re-export shims that nothing imports (`src/App.tsx:2` imports from
`@missed-lead/core` directly), and `src/{parser,leaks,revenue}.test.ts` are byte-identical
copies of the core tests — they'd silently test stale `dist` output. Delete all six.

**Also add** `packages/core/src/normalize.ts` — `normalizeEmail`, `normalizePhone`,
`buildIdentityKey`, `leadFromRow`, unit-tested, no deps. Pure functions, which is what the
rest of core already is.

---

## F. Packaging & routing (two real traps)

**ESM.** No `package.json` in the repo sets `"type": "module"`, yet `packages/core` emits
ESM (`module: "ESNext"`) into `.js`, and its `exports.require` points at that same ESM
file — so a Vercel Node function doing `require('@missed-lead/core')` fails. Fix: add
`"type": "module"` to `packages/core/package.json` and `packages/db/package.json`, and drop
the false `require` conditions from the exports map.

**Stale `dist`.** `vite.config.ts:118-129` aliases `@missed-lead/core` to
`packages/core/dist` — build output, not source — and root `build` is `tsc && vite build`,
which never rebuilds packages. So core edits are invisible until `tsc` runs there. Make the
root build compile workspaces first (`npm -w @missed-lead/core run build && ...`), and set
Vercel's build command to match.

**The greedy SPA rewrite.** `vercel.json` has `{"source": "/(.*)", "destination":
"/index.html"}`. Vercel's filesystem routing normally matches `api/` functions before
rewrites, but that pattern is maximally greedy and this is not worth leaving to
precedence. Change it to a negative lookahead and verify with a real request:

```json
{ "source": "/((?!api/).*)", "destination": "/index.html" }
```

`"crons": []` is already present and empty — Phase 4's nightly sweep drops straight in.
Functions live in `api/*.ts` at repo root.

---

## G. Environment variables

| Variable | Scope |
|---|---|
| `DATABASE_URL` | server — Supavisor **transaction** pooler, for functions |
| `DATABASE_URL_DIRECT` | server — **session**/direct, for drizzle-kit migrations |
| `SUPABASE_URL` | server |
| `SUPABASE_SERVICE_ROLE_KEY` | server — **never** client-exposed |
| `SUPABASE_JWKS_URL` | server |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | web (public by design) |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mobile (public by design) |

Migrations use the **direct** connection — poolers in transaction mode reject the session
state DDL needs. Commit `.env.example` with every key and no values; local dev gets real
values from `supabase start` output.

---

## H. Build order

Each step ends green before the next starts.

| # | Step | Acceptance check |
|---|---|---|
| 1 | Step 0: `.gitignore` env + `graphify-out`, commit `.planning/`, workspace protocol | `git status` clean; `npm install` succeeds |
| 2 | Verify Drizzle RLS API (Step 0c) | written notes on the real `pgPolicy` surface + pinned version |
| 3 | `packages/core`: constants, parser fix, `DetectionConfig`, `normalize.ts`; delete 6 dupes | `npm -w @missed-lead/core test` green, incl. new parser + normalize tests |
| 4 | Scaffold `packages/db` + `drizzle.config.ts`; local Supabase up | `supabase start` healthy; drizzle-kit connects |
| 5 | Schema + first migration (all 7 tables, enum from `LEAD_STATUSES`, all indexes/uniques) | `drizzle-kit generate` → review SQL by eye → `migrate` clean |
| 6 | RLS migration: `current_customer_id()`, policies, `ingest_role` | policies visible in `pg_policies` for every tenant table |
| 7 | **Isolation test** (§C) | passes; and flipping one policy to `using (true)` makes it **fail** — prove the test can detect a leak |
| 8 | Repo functions: `upsertLeadFromNormalized`, `recordLeadEvent`, `getOrCreateDetectionSettings` | integration tests: duplicate `dedupe_key` is a no-op; same identity across two sources merges to one lead and does **not** double-count |
| 9 | `api/_lib/*`, `api/health.ts`, `api/me.ts`; `vercel.json` lookahead; `"type": "module"` | `/api/health` 200; `/api/me` 401 bare, 200 with a real JWT; `/` still serves the SPA |
| 10 | Update `.planning/STATE.md` + `PROJECT.md` decisions | phase marked complete |

Step 7's second half matters as much as the first: a green isolation test that *cannot
fail* is worse than no test.

---

## Verification

```bash
# unit
npm -w @missed-lead/core test          # parser (incl. the two recovered date fields), normalize, leaks, revenue

# integration (Docker required)
supabase start && supabase db reset
npm -w @missed-lead/db test            # tenant isolation + dedupe/merge

# the negative control — this SHOULD fail
#   temporarily change one policy to `using (true)`, re-run, confirm RED, revert

# end to end
vercel dev
curl localhost:3000/api/health                                  # → 200 {"ok":true}
curl localhost:3000/api/me                                      # → 401
curl -H "Authorization: Bearer $JWT" localhost:3000/api/me       # → 200 {"customerId":"..."}
curl localhost:3000/                                            # → SPA html, not swallowed
```

**Phase 1 is done when:** the isolation test passes *and* provably fails when a policy is
loosened; a duplicate `dedupe_key` is a no-op; the same person arriving via two sources
becomes one lead with one revenue contribution; and `/api/me` resolves a real Supabase JWT
to a `customer_id` while `/` still serves the app.

## Risks / open questions

1. **Drizzle RLS API is unverified** (Step 0c) — the one item the schema work hinges on.
   Raw SQL migrations are the escape hatch.
2. **Supavisor transaction mode + `set local`** — if the pooler won't hold the GUC, the
   `ingest_role` design degrades to the service-role fallback in §B. Test at step 6, not
   step 9.
3. **pglite-vs-Docker** for the isolation test — I'm confident pglite can't do `auth.uid()`,
   but it's unverified. If Docker is unacceptable in CI, this needs a rethink.
4. **`booked` counted as recovered** (`revenue.ts:23`) — preserved deliberately. Product
   question for later, not a Phase 1 change.
5. **Mobile is partly built in this repo** — `mobile/src/{screens,hooks}` are populated (4
   screens + `useLeadAnalysis.ts`), unlike the iCloud copy. But `mobile/src/components/`
   still doesn't exist, so `mobile/App.tsx` may still not compile. `packages/ui/src/hooks/`
   does have its `index.ts` here. Deliberately **out of scope** — Phase 1 ships no UI — but
   verify both compile before Phase 5 (push) and Phase 6 (dashboard).
6. **Vercel + npm workspaces** — the monorepo's function bundling needs a real deploy to
   confirm; local `vercel dev` success doesn't guarantee it.
