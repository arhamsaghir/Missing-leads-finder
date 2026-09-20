# Project Research — Stack

> ⚠ Inline research (researcher subagents unavailable in this runtime, 2026-08-23). Version numbers must be verified with Context7 at plan-phase.

## New capabilities required

| Capability | Recommendation | Why | What NOT to add |
|---|---|---|---|
| Backend runtime | **Vercel Serverless/Edge Functions** (already deploying web there) | Zero new infra; webhook + inbound-email receivers are small stateless functions | Express server on a VM; Hono/Nitro meta-frameworks — Vercel functions suffice |
| Database | **Postgres via Neon** (serverless driver `@neondatabase/serverless`) | HTTP-based driver avoids connection-pool exhaustion from serverless; free tier fits validation stage | Prisma+pg pool on serverless (exhaustion trap); MongoDB (relational lead/event data wants SQL) |
| ORM/query | **Drizzle ORM** | Tiny, edge-compatible, SQL-shaped; matches TS monorepo | Prisma (engine weight on Edge); raw SQL everywhere |
| Auth/multi-tenant | **Supabase Auth or Clerk**, rows scoped by `customer_id` + Postgres RLS | OAuth email sign-in for non-technical owners; RLS = tenant isolation enforced at DB, not app code | Hand-rolled JWT sessions |
| Inbound email | **Cloudflare Email Routing → Email Worker → POST to ingestion API** | Free, no approval queue, programmable; alternative: Postmark inbound (~$15/mo) | Building SMTP ourselves; IMAP polling |
| Push (mobile) | **Expo push notifications** (`expo-notifications`, already on Expo 57) | Native to existing stack, free tier generous | FCM/APNs direct wiring |
| Push (web PWA) | **Web Push API via `web-push` lib** (PWA already uses workbox) | Standard, no service dependency | OneSignal etc. until scale demands it |
| Email-body parsing | `mailparser` + LLM extraction step (existing provider) for contact/intent fields | Deterministic header parsing + LLM only for free-text fields | Pure-LLM extraction of structured headers |
| Scheduling/detection trigger | **Vercel Cron** (nightly sweep) + event-driven compute on ingest | Detection is cheap; cron catches "lead aged past threshold" without realtime infra | WebSocket/streaming stack — nothing here needs realtime |

## Integration points with existing code

- `packages/core`: add `ingest/normalize` adapters exporting the SAME Lead schema the CSV parser emits. Engine untouched.
- Web app: new `/api/*` routes live in the same Vercel project.
- Mobile: `expo-notifications` registration added to app entry.

## Versions to verify at plan-phase

`@neondatabase/serverless`, `drizzle-orm`, `expo-notifications` (SDK 54+ API changes), `web-push`, `mailparser`.
