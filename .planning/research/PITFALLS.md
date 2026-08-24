# Project Research — Pitfalls

> ⚠ Inline research (researcher subagents unavailable in this runtime, 2026-08-23). Each pitfall: warning sign → prevention → phase.

## Webhook ingestion

1. **Unauthenticated spam to hook URLs** (bots scan `/hook/*`). Sign: junk leads appearing.
   → Prevent: high-entropy secret embedded in URL path, reject unknown tokens silently, rate-limit per IP. Phase 2 (ingest).
2. **Duplicate POSTs** (Typeform retries on timeout; Calendly redelivers).
   → Prevent: idempotency key = hash(payload identity fields); upsert, never blind insert. Respond 200 FAST (<200ms), process async if slow. Phase 2.
3. **Secret rotation breaks customer's form silently**.
   → Prevent: accept old+new secret during overlap window; alert on incoming-to-dead-token. Phase 2.

## Email ingestion

4. **Mail loop**: our own notification forwarded back into the inbox address.
   → Prevent: skip messages where `from` contains our domain; add `X-MissedLead` header and drop echoes. Phase 3.
5. **Spam floods inbox → junk leads pollute revenue estimates**.
   → Prevent: lightweight spam scoring before LLM extraction; auto-quarantine folder visible in UI. Phase 3.
6. **HTML/quoted-printable mangling** produces garbage contact fields.
   → Prevent: `mailparser` handles encodings; never regex raw bodies; LLM extraction only for free-text intent field, schema-validated output, low-confidence → flag not guess. Phase 3.

## Serverless + database

7. **Connection pool exhaustion** — every serverless invocation opens a Postgres connection; 50 concurrent hits kill the DB.
   → Prevent: Neon HTTP serverless driver from day one (not node-postgres pooling). Warning sign: intermittent `too many connections` at low traffic. Phase 1 (foundation decision, expensive to retrofit).
8. **RLS forgotten → tenant data leaks across accounts**.
   → Prevent: enable RLS on ALL tables at migration time; integration test that customer A cannot read B's leads. Phase 1.

## Push notifications

9. **Permission asked cold at first launch → permanent denial**.
   → Prevent: ask after first value moment (first ingested lead), with pre-permission explainer. Phase 5.
10. **Token rot** — uninstalled apps keep dead tokens; sends fail silently.
    → Prevent: prune on `expired`/`invalid` responses; last-seen tracking. Phase 5.

## Data correctness

11. **Double-counted lost revenue** when same lead arrives via form AND forwarded email.
    → Prevent: dedupe key (normalized phone/email + fuzzy name); merge sources onto one lead record. Phase 2/3 boundary — design the key in the schema from day one. Phase 1 (schema), enforcement Phase 2+.
12. **CSV-era data vs streamed data drift** (different null semantics, timestamps).
    → Prevent: one table from day one; CSV backfill writes through the same normalizer. Phase 2.

## Compliance-lite

13. **PII of end-customers stored without bounds**.
    → Prevent: retention policy field (e.g., purge lead PII after 12mo), delete-account cascade, privacy policy page before public launch. Phase 6 (pre-launch checklist).
