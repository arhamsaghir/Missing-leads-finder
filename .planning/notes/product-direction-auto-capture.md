---
title: Product Direction — From CSV Tool to Automated Lead-Capture Platform
date: 2026-08-23
context: Exploration session following v1 CSV-upload release. Decisions on sources, access strategy, scope, and autonomy posture.
---

# Decision Record: Automated Lead Capture & Recovery

## Problem

Current app requires users to upload CSVs of lead data. ~90% of target customers
(non-technical local business owners) will never gather/export data manually. The
product must observe leads automatically and proactively report missed-revenue,
then recover those leads automatically.

## Target customer

Deliberately broad: local service businesses (salons, clinics, contractors),
CRM-using agencies/coaches, and website owners. No single segment chosen as
exclusive wedge — integration order substitutes for segmentation.

## Source access reality (researched 2026-08-23)

| Source | Officially readable | Friction |
|---|---|---|
| CRMs (HubSpot/Zoho/GHL) | ✅ open OAuth APIs | Low |
| Forms/Calendly/Typeform | ✅ webhooks | Trivial |
| Gmail/Outlook | ✅ gated by Google verification | Medium (weeks) |
| Instagram/Facebook DMs | ⚠️ Professional accounts only, Meta App Review | Hard |
| Personal WhatsApp | ❌ no official API exists | Blocked |

## Integration order (decided)

1. **Phase 1:** Webhooks (unique URL per customer) + email forwarding (unique
   `@in.missedlead.app` inbox via Cloudflare Email Routing/Postmark) → works day
   one, zero platform approvals.
2. **Phase 2:** CRM OAuth connectors.
3. **Phase 3:** Gmail OAuth read-only (convenience upgrade).
4. **Phase 4:** Meta stack (IG/FB DMs; WhatsApp only via Business Platform migration).

## Architecture consequences (accepted)

- Requires a real backend (webhook receivers, token storage) — serverless on
  Vercel acceptable; current static PWA + Expo cannot host integrations.
- Requires multi-tenant database with per-customer isolation.
- Push notifications required: Expo push (mobile) + web push (PWA).
- All sources converge into one normalized Lead schema feeding the existing
  `packages/core` engine (leak detection + revenue estimation). CSV upload
  remains as backfill/history option.

## Autonomy posture (decided): Graduated

- v1: detection + push notifications only ("you're losing $X on N leads").
- v2: draft-and-approve follow-ups (one-tap send).
- Full-auto unlocks later per customer, per category after ~90% approve-without-
  edit rate over 20–30 drafts; always with escalation rules (pricing/refunds/
  angry tone → human), quiet hours, per-category toggles.

Rationale: full-auto day one destroys trust on first mistake; approve-only
forever fails busy owners and defeats the product promise. Graduated earns
autonomy from approval/edit telemetry.

## Next step

Formalize as GSD milestone: `/gsd-new-milestone "vNext: Automated Lead Capture & Recovery"`
