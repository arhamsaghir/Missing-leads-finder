# Project Research — Architecture

> ⚠ Inline research (researcher subagents unavailable in this runtime, 2026-08-23).

## How new features integrate with existing architecture

Existing: monorepo (`packages/core` engine + `packages/ui` Tamagui kit), Vite PWA (Vercel), Expo 57 mobile. Stateless — no backend, no DB today.

## Target architecture (v2)

```
[Typeform/Calendly/site]──POST /api/hook/{custId+secret}──┐
[Gmail filter fwd]──► Cloudflare Email Worker ──POST──────┤
                                                          ▼
                                     Vercel API routes (ingest)
                                       │ normalize → Lead schema
                                       │ dedupe (hash name+contact)
                                       ▼
                                  Neon Postgres ── RLS by customer_id
                                       │        (leads, events, customers,
                                       │         push_tokens, settings)
                    event-driven detect│ nightly cron sweep
                                       ▼
                              missed-lead records ($ estimate)
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                             ▼
                Expo push (mobile)            Web Push (PWA)
                        └──────── deep link → lead detail screen
```

## New components (explicit)

1. **Ingest API** (`/api/hook/[token].ts`, `/api/inbound-email.ts`) — validate, normalize, dedupe, persist, trigger detection for that customer.
2. **DB layer** — Drizzle schema: `customers`, `lead_sources`, `leads`, `lead_events`, `detection_settings`, `push_tokens`. Multi-tenant via `customer_id` FK on every row + Postgres RLS.
3. **Detection service** — pure function in `packages/core` (reuses existing rules), invoked per-event + nightly sweep; emits missed-lead rows with $ estimates.
4. **Notification dispatcher** — Expo push API call + `web-push`; token registry per device.
5. **Onboarding UI** — connection cards with live "we're listening" test state.
6. **Auth** — email OAuth sign-in; session → customer_id resolution middleware.

## Data flow changes

- Detection input changes from file-at-rest to event stream: engine becomes a library called by ingest/cron instead of an upload handler.
- Settings move from client state to DB (thresholds drive detection).
- CSV upload path persists unchanged but writes to the same `leads` table (backfill = historical rows flagged `source:'csv'`).

## Suggested build order (dependency-driven)

1. DB + auth + multi-tenant skeleton (everything needs tenancy)
2. Ingest webhook endpoint (+ test-connection UX) ← first user-visible value
3. Email inbound worker → same pipeline
4. Detection-on-event + nightly sweep
5. Push notifications (mobile then PWA) + notification content
6. Dashboard upgrade (live counter, source breakdown) + settings screens
