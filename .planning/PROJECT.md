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
- Webhook ingestion endpoint (unique URL per customer)
- Email-forwarding ingestion (unique inbound inbox → parse → normalize)
- Backend service + multi-tenant database (Vercel serverless)
- Continuous leak detection + push notifications (Expo push + PWA web push)
- Non-technical onboarding flows (paste webhook URL / add email filter)

**Explicitly deferred:** CRM OAuth connectors, Gmail read-only OAuth, Meta stack
(IG/FB/WhatsApp), automated follow-up/booking (graduated autonomy — see seed
`full-auto-booking.md`).

## Validated (v1 capabilities — do not re-research)

- CSV parsing + lead normalization (`packages/core`)
- Leak-detection rules + revenue estimation engine (`packages/core`, TDD)
- Tamagui component library (`packages/ui`), shared web/mobile design system
- Vite PWA (web) + Expo 57 (mobile) apps; monorepo workspaces
- Deployment: Vercel (web), EAS configured (mobile, project `mlead`)

## Key Decisions

- **2026-08-23 — Ingestion order:** webhooks + email forwarding first (zero
  platform approvals); CRM OAuth second; Gmail OAuth third; Meta last.
- **2026-08-23 — Backend jump accepted:** multi-tenant DB + serverless API is in
  scope for v2. All sources normalize into the same Lead schema that feeds the
  existing core engine. CSV upload remains as backfill option.
- **2026-08-23 — Autonomy posture: graduated.** v2 = detect + notify only.
  Draft-and-approve follow-ups next; full-auto unlocks later per approval-rate
  telemetry (see `.planning/seeds/full-auto-booking.md`).
- Full context: `.planning/notes/product-direction-auto-capture.md`

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
