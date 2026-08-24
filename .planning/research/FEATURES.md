# Project Research — Features

> ⚠ Inline research (researcher subagents unavailable in this runtime, 2026-08-23).

## How these features work in comparable products

Competitor pattern (Podium/Birdeye class): capture every inbound channel → score/respond fast → report money impact. Missed-call text-back tools proved the core loop owners pay for: **instant awareness + one-tap response**. Form-capture tools (Zapier parser, Calendly webhooks) prove the setup moment: success = customer completes connection in <5 min without help.

## Onboarding for a non-technical salon owner

1. Sign in with Google (no password)
2. "Connect your leads" screen shows exactly TWO cards: **Paste this URL into your form tool** / **Forward emails to this address**
3. Each card ends with a live test: "We're listening… send a test" → green check when first event arrives
4. First real lead ingested → push notification fires → value demonstrated day zero
5. CSV upload offered as optional "backfill your history" step

## The actionable notification

A "missed revenue" push that gets tapped contains: **money figure** ("~$450 likely lost"), **who** ("Sarah M., asked about balayage"), **channel badge**, **age** ("waiting 26h"), and one tap-action → open lead detail with drafted reply (v2 hook). Notifications without a number get ignored; notifications without an owner action train users to swipe them away.

## Table stakes vs differentiators vs anti-features

| Category | Feature | Complexity | Depends on |
|---|---|---|---|
| Table stake | Multi-tenant account w/ email OAuth login | Low | DB |
| Table stake | Webhook endpoint per customer + secret URL | Low | Backend |
| Table stake | Inbound email address per customer | Med | Email worker |
| Table stake | Lead normalization into existing schema | Low | core engine |
| Table stake | Continuous detection + nightly re-sweep | Med | DB + cron |
| Table stake | Push notification w/ $ amount + deep link | Med | Accounts + detection |
| Table stake | Response-time threshold setting (default 24h) | Low | Detection |
| Differentiator | Live "revenue at risk" dashboard counter | Med | All above |
| Differentiator | Source-level breakdown (form vs email losses) | Med | Normalization metadata |
| Differentiator | Weekly digest email ("you recovered/left $X") | Low | Digest job |
| Anti-feature (now) | Realtime streaming updates | High | No user asks; cron suffices |
| Anti-feature (now) | Auto-reply/booking (graduated autonomy later) | Very high | Seeded, not v2 |
| Anti-feature (now) | Team roles/permissions | Med | Solo-owner product today |

## Dependencies on existing engine

All features feed the existing leak-detection + revenue-estimation engine via the normalized Lead schema — no engine rewrite. Settings (thresholds) become engine inputs rather than upload-time options.
