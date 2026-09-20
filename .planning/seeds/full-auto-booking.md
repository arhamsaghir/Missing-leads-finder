---
title: Full-Auto Booking Engine
trigger_condition: After draft-and-approve follow-ups ships AND any lead category reaches ~90% approve-without-edit rate over 20–30 drafts for a given customer.
planted_date: 2026-08-23
---

# Seed: Full-Auto Booking (Graduated Autonomy End-State)

Unlock automatic follow-up/booking per category, per customer, opt-in.

## Unlock criteria
- ≥20–30 drafts sent in category, ≥90% approved without edits.
- Offered as explicit toggle: "Auto-answer new inquiries?"

## Always-on guardrails even when auto
- Escalate to human: pricing commitments, refunds/discounts, negative sentiment,
  anything the model scores low-confidence.
- Quiet hours (owner-defined); queue until morning.
- Max autonomous touches per lead before handing to owner (e.g., 2).
- Per-category switches; global kill switch.

## Behavior
- Auto-reply within minutes of new inquiry; propose booking slots from connected
  calendar; confirm booking; summarize daily activity digest to owner.
