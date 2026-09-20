# Project Research Summary

> Synthesized inline 2026-08-23 (researcher subagents unavailable). Sources: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md.

## Key Findings

**Stack additions:** Vercel serverless functions + Neon Postgres via HTTP driver + Drizzle ORM + Supabase/Clerk auth with Postgres RLS tenancy; Cloudflare Email Routing→Worker for inbound email; Expo push + Web Push for notifications; Vercel Cron for nightly detection sweeps. No new frameworks; everything bolts onto the existing monorepo.

**Feature table stakes:** multi-tenant accounts (email OAuth), per-customer webhook URL, inbound email address, lead normalization into existing schema, continuous detection (+nightly sweep), actionable push ("$450 lost — Sarah M. — 26h waiting" → tap to lead), response-time threshold setting. Differentiators: live revenue-at-risk dashboard, source breakdown, weekly digest. Anti-features now: realtime streaming, auto-reply/booking (seeded), team roles.

**Architecture shape:** one funnel, many pipes — every source normalizes into the Lead schema that already feeds `packages/core`; engine becomes a library invoked per-event + by cron instead of an upload handler. Build order: DB/auth skeleton → webhook ingest → email ingest → detection-on-event → push → dashboard/settings.

**Watch Out For:** (1) Neon HTTP driver from day one — pool exhaustion is the classic serverless killer; (2) RLS on at migration time + cross-tenant test; (3) idempotency/dedupe keys designed into schema before first ingest ships (duplicate POSTs AND same-lead-two-sources); (4) mail loops from our own notifications being forwarded back; (5) cold permission asks kill push conversion — ask after first value moment; (6) PII retention policy before public launch.

## Implications for Roadmap

Phases follow dependency chain: foundation (DB+auth+RLS+schema-with-dedupe-keys) is phase 1 and unblocks everything; webhook ingest is the first user-visible value (phase 2); email inbound next (phase 3); detection+cron (phase 4); push notifications mobile+PWA (phase 5); dashboard/settings/onboarding polish + retention/compliance checklist (phase 6). Pitfalls map onto their named phases as success criteria.

## Sources

Inline research grounded in: existing repo structure (`packages/core|ui`, Vite PWA, Expo 57, Vercel+EAS deploys), exploration decision record (`.planning/notes/product-direction-auto-capture.md`), competitor patterns (Podium/Birdeye capture loop, form-parser SaaS onboarding). Version numbers deferred to plan-phase Context7 verification.
