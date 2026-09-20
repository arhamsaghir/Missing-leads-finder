# Webhook Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A salon owner pastes one URL into their web-form tool and their leads arrive in our database, deduplicated, with no credentials in the form tool.

**Architecture:** Three layers, each independently testable. A pure extractor in `packages/core` turns arbitrary provider JSON into lead fields. A `resolver_role`-scoped Postgres function admits a request (token lookup + rate accounting) in one round trip. A thin Vercel handler chains admit → extract → `withIngestScope` write, reusing the Phase 1 ingest repository unchanged.

**Tech Stack:** TypeScript, Drizzle ORM 0.45.2, postgres.js 3.4.9, Supabase Postgres, Vercel serverless functions, Vitest 4, `jose` for JWT.

**Spec:** `docs/superpowers/specs/2026-08-25-webhook-ingest-design.md` — read it before starting. This plan argues from it.

## Global Constraints

- **Node-only in `packages/db`:** it imports `node:crypto`. Never import it into a browser bundle.
- **`packages/core` stays dependency-free.** No imports outside the standard library.
- **Money is integer cents.** Never a float. `estimatedValue` is never extracted from a payload.
- **Migrations: generate, then append.** Run `npm run db:generate -w @missed-lead/db`
  and append `GRANT`, `CREATE ROLE`, and `CREATE FUNCTION` by hand to the file it
  produced — Drizzle emits none of those (`.planning/PROJECT.md:90`). Never
  `--custom`, and never hand-edit `migrations/meta/`. Task 3 explains why.
- **Never echo a token in an error body.** `problem()` bodies are terse by design (`api/_lib/response.ts:9-16`).
- **"Not found" and "not yours" must be indistinguishable.** Another tenant's resource is 404, never 403.
- **Tests that cannot fail are worse than none.** Every security assertion needs a negative control.
- **Commit after every task.** Never `--amend`, never `--no-verify`.
- **Docker required** for `test:db` and `test:api`: `npm run supabase:start`, then `npm run db:migrate`.

## Verification commands

| Command | Docker | What it must prove |
|---|---|---|
| `npm run test:core` | no | Extraction, including every adversarial case |
| `npm run test:db` | yes | Migration, roles, rotation, rate limits, negative controls |
| `npm run test:api` | yes | Both endpoints end to end with real JWTs |
| `npm run typecheck` | no | Builds packages, then checks web + api |
| `npm run test:prove-isolation -w @missed-lead/db` | yes | Phase 1's negative control still red-on-loosening |

**Task order is not negotiable.** Task 2 unblocks Task 3, and 3 → 4 → 5 → 6 each
consume the one before. Task 1 is independent and can run first or in parallel.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/core/src/extract.ts` | Deep-scan extraction. Pure, no deps, no I/O. | 1 |
| `packages/core/src/extract.test.ts` | Fixtures + adversarial cases. | 1 |
| `packages/core/src/index.ts` | Add `export * from './extract'`. | 1 |
| `packages/core/package.json` | Add `./extract` to `exports`; add `default` conditions. | 1, 2 |
| `packages/core/src/{index,leaks,revenue}.ts` | `.js` extensions on relative imports. | 2 |
| `packages/db/src/schema/rateCounters.ts` | `ingest_rate_counters` table. | 3 |
| `packages/db/src/schema/leads.ts` | Add `tokenRotatedAt`. | 3 |
| `packages/db/src/schema/index.ts` | Export `rateCounters`. | 3 |
| `packages/db/migrations/0003_webhook_ingest.sql` | Column, table, `resolver_role`, `bump_rate_counter`, `ingest_admit`, grants. | 3 |
| `packages/db/migrations/meta/{_journal,0003_snapshot}.json` | Written by `db:generate`. | 3 |
| `packages/db/src/__tests__/resolver-role.test.ts` | Role privileges + negative controls. | 3 |
| `packages/db/src/repo/sources.ts` | Token generation, admit wrapper, create/rotate/revoke/list/status. | 4 |
| `packages/db/src/repo/index.ts` | Export `./sources`. | 4 |
| `packages/db/src/__tests__/sources.test.ts` | Rotation window, revocation, rate limits, admit states. | 4 |
| `api/_lib/ingest.ts` | Shared orchestration. Phase 3's email path reuses it. | 5 |
| `api/hook/[token].ts` | Public endpoint. Thin. | 5 |
| `api/__tests__/hook.test.ts` | Public endpoint integration. | 5 |
| `api/_lib/sources.ts` | `webhookUrlFor` + status row mapper, shared by all three routes. | 6 |
| `api/sources.ts` | List, create. | 6 |
| `api/sources/[id].ts` | Get, revoke. | 6 |
| `api/sources/[id]/rotate.ts` | Rotate. | 6 |
| `api/__tests__/sources.test.ts` | Provisioning integration. | 6 |
| `.env.example` | Add `PUBLIC_APP_URL`. | 6 |
| `packages/db/README.md` | Correct the `--custom` migration instruction. | 3 |
| `.planning/STATE.md`, `.planning/PROJECT.md` | Phase 2 outcome, decisions, FORCE RLS deviation. | 7 |

---

## Deviations from the spec, decided here

Five. The first three are small; the last two are blockers found by running the
tools before writing the plan, and each gets its own task step.

1. **Core test file lives beside its source**, `packages/core/src/extract.test.ts`, not
   `src/__tests__/extract.test.ts` as the spec's Files table says. `packages/core`
   puts tests beside source (`normalize.test.ts`, `parser.test.ts`) and its
   `vitest.config.ts` includes `src/**/*.test.ts`. Follow the package.
2. **`resolver_role` also gets `DELETE` on `ingest_rate_counters`.** The spec lists
   `SELECT, INSERT, UPDATE` but also puts pruning inside `ingest_admit`, which is
   `SECURITY INVOKER` — so the `DELETE` runs with `resolver_role`'s privileges. A
   role that can already `INSERT`/`UPDATE` arbitrary counter rows gains nothing
   from `DELETE` on the same table, so grant it rather than adding a
   `SECURITY DEFINER` function.
3. **One extra file: `api/_lib/sources.ts`** holding `webhookUrlFor` and the status
   row mapper. Three route files would otherwise each rebuild the URL from
   `PUBLIC_APP_URL`, and the one that got it wrong would hand a customer a broken
   URL.
4. **`drizzle-kit generate` is currently broken, and Task 3 needs it.** Verified by
   running it: every invocation, `--custom` included, dies with
   `ERR_PACKAGE_PATH_NOT_EXPORTED` on `@missed-lead/core`. drizzle-kit is CJS and
   `require()`s the schema; `e37e38d` dropped core's `require` conditions and made
   it `"type": "module"`, so there is no condition CJS can resolve. Node 22 can
   `require()` an ESM graph, but only one whose relative specifiers carry file
   extensions — core's are extensionless, so it fails on `./parser` even once a
   condition matches. **Task 2 fixes this in two lines of config plus four import
   sites**, and is a prerequisite for Task 3. Without it there is no way to
   register a journal entry, and `db:migrate` reads the journal, not the
   directory.
5. **`ingest_rate_counters` gets no `tenantPolicy`.** Every other table in
   `schema/` calls it, so the omission would read as forgetfulness. It is
   deliberate: the buckets that matter (`unk:<ip>`, `ip:<ip>`) are charged *before*
   a token resolves, so a `customer_id` column would be null exactly when it is
   needed. RLS is still enabled on the table with `authenticated` and `anon`
   granted nothing, per the spec.

## Task 1: Payload extraction in `packages/core`

**Files:**
- Create: `packages/core/src/extract.ts`
- Create: `packages/core/src/extract.test.ts`
- Modify: `packages/core/src/index.ts` (add one export line)
- Modify: `packages/core/package.json` (add `./extract` to the `exports` map)

**Interfaces:**
- Consumes: `normalizeEmail`, `normalizePhone` from `packages/core/src/normalize.ts`.
  Both are `(raw: string) => string | null`. Nothing else — this task has no
  dependency on any other task.
- Produces, relied on by Task 5:
  ```ts
  export type ParseWarning =
    | 'email_only_in_business_key'
    | 'phone_rejected_unformatted'
    | 'timestamp_out_of_window'
    | 'nothing_extracted';

  export interface ExtractedLead {
    customerName: string | null;
    email: string | null;       // normalized (lowercased/trimmed)
    phone: string | null;       // normalized (digits only)
    notes: string | null;
    providerEventId: string | null;
    occurredAt: Date | null;    // null when absent or outside the trust window
    warnings: ParseWarning[];
  }

  export function extractLead(payload: unknown, now?: Date): ExtractedLead;
  export function isEmptyExtraction(lead: ExtractedLead): boolean;
  ```
  `isEmptyExtraction` is true when `customerName`, `email` and `phone` are all
  null. Notes alone is not a lead: with no contact point and no name there is
  nobody to follow up, and every such submission would create a fresh
  un-dedupable row.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/extract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractLead, isEmptyExtraction } from './extract';

/** Fixed clock so the 90-day trust window is deterministic. */
const NOW = new Date('2026-08-27T12:00:00.000Z');

describe('extractLead — real provider shapes', () => {
  it('reads a Typeform submission (answer value under a generic key)', () => {
    const lead = extractLead(
      {
        event_id: 'evt_01H8',
        form_response: {
          form_id: 'aB3xY',
          submitted_at: '2026-08-27T11:58:00.000Z',
          answers: [
            { field: { ref: 'full_name' }, type: 'text', text: 'Priya Raman' },
            { field: { ref: 'email' }, type: 'email', email: 'Priya@Example.com' },
            { field: { ref: 'phone' }, type: 'phone_number', phone_number: '+1 (555) 010-2030' },
            { field: { ref: 'message' }, type: 'text', text: 'Balayage on Friday?' },
          ],
        },
      },
      NOW,
    );
    expect(lead.customerName).toBe('Priya Raman');
    expect(lead.email).toBe('priya@example.com');
    expect(lead.phone).toBe('5550102030');
    expect(lead.notes).toBe('Balayage on Friday?');
    expect(lead.providerEventId).toBe('evt_01H8');
    expect(lead.occurredAt?.toISOString()).toBe('2026-08-27T11:58:00.000Z');
    expect(lead.warnings).toEqual([]);
  });

  it('reads a Calendly invitee.created payload', () => {
    const lead = extractLead(
      {
        event: 'invitee.created',
        payload: {
          name: 'Dana Whitfield',
          email: 'dana@example.com',
          created_at: '2026-08-27T09:15:00.000Z',
          questions_and_answers: [
            { question: 'Notes for the stylist', answer: 'Prefer mornings' },
          ],
          scheduled_event: { start_time: '2026-11-02T15:00:00.000Z' },
        },
      },
      NOW,
    );
    expect(lead.customerName).toBe('Dana Whitfield');
    expect(lead.email).toBe('dana@example.com');
    expect(lead.notes).toBe('Prefer mornings');
    // start_time is months out and falls outside the window; created_at wins
    // without a warning because an in-window candidate was found.
    expect(lead.occurredAt?.toISOString()).toBe('2026-08-27T09:15:00.000Z');
    expect(lead.warnings).toEqual([]);
  });

  it('reads a Jotform-style flat payload with q-prefixed keys', () => {
    const lead = extractLead(
      {
        submission_id: '5820119',
        q3_fullName: 'Marcus Webb',
        q4_email: 'marcus.webb@example.com',
        q5_phone: '555.221.9087',
        q6_comments: 'Do you do beard trims?',
      },
      NOW,
    );
    expect(lead.customerName).toBe('Marcus Webb');
    expect(lead.email).toBe('marcus.webb@example.com');
    expect(lead.phone).toBe('5552219087');
    expect(lead.notes).toBe('Do you do beard trims?');
    expect(lead.providerEventId).toBe('5820119');
    // No timestamp key anywhere: the handler will use receipt time. Absent is
    // not the same as wrong, so there is no warning.
    expect(lead.occurredAt).toBeNull();
    expect(lead.warnings).toEqual([]);
  });

  it('reads a flat Zapier-style payload with capitalised keys', () => {
    const lead = extractLead(
      {
        Name: 'Aisha Khan',
        Phone: '(555) 660-1122',
        Comments: 'Wants a quote for highlights',
        order_id: '10054000322',
      },
      NOW,
    );
    expect(lead.customerName).toBe('Aisha Khan');
    expect(lead.phone).toBe('5556601122');
    expect(lead.email).toBeNull();
    expect(lead.notes).toBe('Wants a quote for highlights');
    // order_id is a bare digit run, but a real phone was found first, so
    // nothing was refused and there is nothing to warn about.
    expect(lead.warnings).toEqual([]);
  });
});

describe('extractLead — the two silent-corruption cases', () => {
  it('refuses the business\'s own address in a `from` field', () => {
    // Without this, `hello@sunsetsalon.com` is identical on every submission,
    // matches one lead_identities row every time, and collapses the entire
    // dataset onto a single lead — corrupting the one number the product sells.
    const lead = extractLead(
      {
        from: 'hello@sunsetsalon.com',
        subject: 'New enquiry from your website',
        body: 'Someone asked about balayage',
      },
      NOW,
    );
    expect(lead.email).toBeNull();
    expect(lead.warnings).toContain('email_only_in_business_key');
  });

  it.each([['reply_to'], ['reply-to'], ['sender'], ['owner'], ['account'], ['admin'], ['to']])(
    'refuses an address found only under `%s`',
    (key) => {
      const lead = extractLead({ [key]: 'hello@sunsetsalon.com' }, NOW);
      expect(lead.email).toBeNull();
      expect(lead.warnings).toContain('email_only_in_business_key');
    },
  );

  it('prefers the personal address when a business one is also present', () => {
    const lead = extractLead(
      {
        from: 'hello@sunsetsalon.com',
        customer_email: 'Nadia.Osman@example.com',
        name: 'Nadia Osman',
      },
      NOW,
    );
    expect(lead.email).toBe('nadia.osman@example.com');
    // A usable address was found, so nothing was refused.
    expect(lead.warnings).toEqual([]);
  });

  it('refuses a bare 10-digit run with no key hint and no formatting', () => {
    // An order id, a zip+4 with an extension, or an epoch value all normalize to
    // a plausible phone. A wrong phone creates a wrong identity, which merges
    // two unrelated humans — and mergeLeadFields is monotonic, so it cannot be
    // undone.
    const lead = extractLead({ reference: '4155550199', notes: 'call me' }, NOW);
    expect(lead.phone).toBeNull();
    expect(lead.warnings).toContain('phone_rejected_unformatted');
  });

  it('accepts a formatted number even with no key hint', () => {
    const lead = extractLead({ reference: '(415) 555-0199' }, NOW);
    expect(lead.phone).toBe('4155550199');
    expect(lead.warnings).toEqual([]);
  });

  it.each([
    ['plus prefix', '+14155550199', '4155550199'],
    ['dashes', '415-555-0199', '4155550199'],
    ['spaces', '415 555 0199', '4155550199'],
    ['dots', '415.555.0199', '4155550199'],
  ])('accepts %s formatting with no key hint', (_label, raw, expected) => {
    expect(extractLead({ reference: raw }, NOW).phone).toBe(expected);
  });

  it('accepts unformatted digits under a phone-hinted key', () => {
    for (const key of ['phone', 'telephone', 'mobile', 'cell', 'q5_phone', 'PhoneNumber']) {
      const lead = extractLead({ [key]: '4155550199' }, NOW);
      expect(lead.phone).toBe('4155550199');
      expect(lead.warnings).toEqual([]);
    }
  });
});

describe('extractLead — timestamps', () => {
  it('rejects an epoch-seconds value read as milliseconds (lands in 1970)', () => {
    // 1970 makes every lead instantly and maximally leaked, which inflates
    // reported lost revenue — the same class of failure as the parser lesson in
    // PROJECT.md:98.
    const lead = extractLead({ email: 'x@example.com', created_at: 1787000000 }, NOW);
    expect(lead.occurredAt).toBeNull();
    expect(lead.warnings).toContain('timestamp_out_of_window');
  });

  it('rejects a timestamp more than 90 days old', () => {
    const lead = extractLead(
      { email: 'x@example.com', submitted_at: '2026-01-01T00:00:00.000Z' },
      NOW,
    );
    expect(lead.occurredAt).toBeNull();
    expect(lead.warnings).toContain('timestamp_out_of_window');
  });

  it('rejects a timestamp more than 5 minutes in the future', () => {
    const lead = extractLead(
      { email: 'x@example.com', submitted_at: '2026-08-27T12:06:00.000Z' },
      NOW,
    );
    expect(lead.occurredAt).toBeNull();
    expect(lead.warnings).toContain('timestamp_out_of_window');
  });

  it('accepts the window edges', () => {
    const nearFuture = extractLead(
      { email: 'x@example.com', submitted_at: '2026-08-27T12:04:00.000Z' },
      NOW,
    );
    expect(nearFuture.occurredAt?.toISOString()).toBe('2026-08-27T12:04:00.000Z');
    expect(nearFuture.warnings).toEqual([]);

    const justInside = extractLead(
      { email: 'x@example.com', submitted_at: '2026-06-01T12:00:00.000Z' },
      NOW,
    );
    expect(justInside.occurredAt?.toISOString()).toBe('2026-06-01T12:00:00.000Z');
    expect(justInside.warnings).toEqual([]);
  });

  it('does not warn when no timestamp is present at all', () => {
    // Absent is not wrong. The handler uses receipt time.
    const lead = extractLead({ email: 'x@example.com' }, NOW);
    expect(lead.occurredAt).toBeNull();
    expect(lead.warnings).toEqual([]);
  });
});

describe('extractLead — nothing usable', () => {
  it.each([
    ['empty object', {}],
    ['deeply nested empties', { a: { b: { c: {} } }, d: [] }],
    ['null', null],
    ['a bare string', 'hello'],
    ['a number', 42],
    ['an array of empties', [{}, {}]],
  ])('yields an empty extraction for %s', (_label, payload) => {
    const lead = extractLead(payload, NOW);
    expect(isEmptyExtraction(lead)).toBe(true);
    expect(lead.warnings).toContain('nothing_extracted');
  });

  it('notes alone is not a lead — there is nobody to follow up', () => {
    const lead = extractLead({ message: 'call the shop about Friday' }, NOW);
    expect(lead.notes).toBe('call the shop about Friday');
    expect(isEmptyExtraction(lead)).toBe(true);
    expect(lead.warnings).toContain('nothing_extracted');
  });

  it('a name alone IS a lead', () => {
    const lead = extractLead({ name: 'Walk In Wanda' }, NOW);
    expect(lead.customerName).toBe('Walk In Wanda');
    expect(isEmptyExtraction(lead)).toBe(false);
    expect(lead.warnings).toEqual([]);
  });

  it('does not throw on a self-referential payload', () => {
    // A malicious or buggy client can send one; a stack overflow here would be a
    // 500 on the public endpoint.
    const payload: Record<string, unknown> = { email: 'loop@example.com' };
    payload.self = payload;
    expect(() => extractLead(payload, NOW)).not.toThrow();
    expect(extractLead(payload, NOW).email).toBe('loop@example.com');
  });
});

describe('extractLead — names and notes', () => {
  it('prefers a full name over a first name alone', () => {
    const lead = extractLead({ first_name: 'Sam', full_name: 'Sam Okafor' }, NOW);
    expect(lead.customerName).toBe('Sam Okafor');
  });

  it('joins first and last when there is no full name', () => {
    const lead = extractLead({ first_name: 'Sam', last_name: 'Okafor' }, NOW);
    expect(lead.customerName).toBe('Sam Okafor');
  });

  it('takes a first name alone when that is all there is', () => {
    expect(extractLead({ first_name: 'Sam' }, NOW).customerName).toBe('Sam');
  });

  it('ignores name-shaped keys that are not a person', () => {
    // `form_name` and `business_name` describe the form and the salon, not the
    // customer, so neither may become a lead's name.
    const lead = extractLead({ form_name: 'Contact us', business_name: 'Sunset Salon' }, NOW);
    expect(lead.customerName).toBeNull();
  });

  it('truncates notes at 2000 characters', () => {
    const lead = extractLead({ email: 'x@example.com', message: 'a'.repeat(2500) }, NOW);
    expect(lead.notes).toHaveLength(2000);
  });

  it.each([['message'], ['comments'], ['note'], ['enquiry'], ['inquiry'], ['details'], ['description']])(
    'reads notes from `%s`',
    (key) => {
      expect(extractLead({ email: 'x@example.com', [key]: 'Friday please' }, NOW).notes).toBe(
        'Friday please',
      );
    },
  );

  it('trims whitespace and treats a blank value as absent', () => {
    const lead = extractLead({ name: '  Sam Okafor  ', message: '   ' }, NOW);
    expect(lead.customerName).toBe('Sam Okafor');
    expect(lead.notes).toBeNull();
  });
});

describe('extractLead — provider event id', () => {
  it.each([['id'], ['event_id'], ['submission_id'], ['response_id'], ['form_response_id']])(
    'reads `%s`',
    (key) => {
      expect(extractLead({ [key]: 'abc123', email: 'x@example.com' }, NOW).providerEventId).toBe(
        'abc123',
      );
    },
  );

  it('finds an id nested at depth', () => {
    const lead = extractLead({ data: { form_response: { id: 'nested-1' } } }, NOW);
    expect(lead.providerEventId).toBe('nested-1');
  });

  it('ignores ids that are not the delivery\'s own', () => {
    // form_id and user_id are stable across every submission. Using either as
    // the dedupe key would make the second real lead look like a retry of the
    // first and silently discard it.
    const lead = extractLead({ form_id: 'aB3xY', user_id: 'u_99', email: 'x@example.com' }, NOW);
    expect(lead.providerEventId).toBeNull();
  });

  it('stringifies a numeric id', () => {
    expect(extractLead({ submission_id: 5820119 }, NOW).providerEventId).toBe('5820119');
  });

  it('never returns an empty string', () => {
    // buildDedupeKey treats a falsy providerEventId as absent and hashes the
    // payload instead; returning '' would depend on that coincidence.
    expect(extractLead({ id: '   ' }, NOW).providerEventId).toBeNull();
  });
});

describe('extractLead — arrays of question/answer pairs', () => {
  it('reads a label/value pair shape', () => {
    const lead = extractLead(
      {
        fields: [
          { label: 'Your email', value: 'pair@example.com' },
          { label: 'Phone', value: '555 314 1592' },
          { label: 'Additional details', value: 'Saturday morning' },
        ],
      },
      NOW,
    );
    expect(lead.email).toBe('pair@example.com');
    expect(lead.phone).toBe('5553141592');
    expect(lead.notes).toBe('Saturday morning');
  });

  it('does not let a question label supply the answer', () => {
    // The label is the form's wording, never the customer's data.
    const lead = extractLead(
      { fields: [{ label: 'Email us at hello@sunsetsalon.com', value: 'real@example.com' }] },
      NOW,
    );
    expect(lead.email).toBe('real@example.com');
  });
});

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:core
```

Expected: FAIL — `Cannot find module './extract'`. If it passes, you are running
the wrong file.

- [ ] **Step 3: Write `packages/core/src/extract.ts`**

Read the whole thing before typing. The ordering of the guards is the design.

```ts
/**
 * Provider-agnostic extraction of lead fields from arbitrary webhook JSON.
 *
 * One code path for Typeform, Jotform, Calendly, Zapier and anything else: walk
 * the payload collecting candidate values with the key path that produced each
 * one, then score. No per-provider adapters — see the locked decision in the
 * spec.
 *
 * Pure, zero dependencies, no I/O, so `npm run test:core` needs no Docker.
 *
 * The governing rule, inherited from normalizeEmail: refuse to merge rather
 * than merge wrongly. `mergeLeadFields` is monotonic, so a bad merge cannot be
 * undone once revenue has been attributed to it. Every guard below chooses
 * storing less over guessing.
 */

import { normalizeEmail, normalizePhone } from './normalize';

export type ParseWarning =
  | 'email_only_in_business_key'
  | 'phone_rejected_unformatted'
  | 'timestamp_out_of_window'
  | 'nothing_extracted';

export interface ExtractedLead {
  customerName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  providerEventId: string | null;
  /** null when absent OR outside the trust window. */
  occurredAt: Date | null;
  warnings: ParseWarning[];
}

/** Notes alone is not a lead: nobody to follow up, and nothing to dedupe on. */
export function isEmptyExtraction(lead: ExtractedLead): boolean {
  return lead.customerName === null && lead.email === null && lead.phone === null;
}

const MAX_NOTES = 2000;
const MAX_DEPTH = 12;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Keys that hold the *business's* own address, not the customer's.
 *
 * A notification-shaped payload puts `hello@thesalon.com` in `from` on every
 * single submission. Matching on it would collapse the entire dataset onto one
 * lead_identities row — a silent corruption of the one number the product
 * sells, not a crash.
 */
const BUSINESS_EMAIL_KEY = /^(from|sender|owner|account|admin|to|reply[_-]?to)$/i;
const EMAIL_KEY_HINT = /mail/i;
const PHONE_KEY_HINT = /phone|tel|mobile|cell/i;
const NOTES_KEY = /message|comment|note|enquir|inquir|detail|descript/i;
const EVENT_ID_KEY = /^(id|event_id|submission_id|response_id|form_response_id)$/i;
const TIMESTAMP_KEY = /^(created_at|submitted_at|timestamp|occurred_at|received_at|date|submission_date)$/i;

/** Any key mentioning a name, minus the ones that name something other than a
 *  person. `form_name` is the form's title and `business_name` is the salon —
 *  either would put the wrong string on every lead. Matched as substrings
 *  because providers prefix keys (Jotform sends `q3_fullName`). */
const NAME_KEY = /name/i;
const NAME_KEY_EXCLUDE =
  /(form|business|company|brand|file|host|event|organi[sz]ation|user|account|domain|page)[_-]?name/i;
const FIRST_NAME_KEY = /(first[_-]?name|given[_-]?name|fname)$/i;
const LAST_NAME_KEY = /(last[_-]?name|family[_-]?name|surname|lname)$/i;

/** Starts with a country-code `+`, or carries a grouping mark. Either way a
 *  human wrote this intending a phone number. */
const PHONE_FORMATTING = /^\+|[\s.\-()]/;

/** ISO-ish date or a clock time. `2026-08-27T09:15:00.000Z` reduces to 17
 *  digits, which normalizePhone happily accepts and the `-` makes look
 *  formatted — so timestamps must be excluded explicitly. */
const DATE_SHAPED = /^\d{4}-\d{2}-\d{2}|\d{2}:\d{2}/;

interface Candidate {
  /** The final path segment, lowercased. Providers prefix keys (`q4_email`),
   *  so hints are matched as substrings, not equality. */
  key: string;
  value: string;
}

/**
 * Flatten the payload into (key, string value) pairs.
 *
 * `seen` guards a self-referential payload: a client can send one, and a stack
 * overflow here would be a 500 on the public endpoint. MAX_DEPTH bounds a
 * pathologically nested body.
 *
 * `label`/`value` pairs are special-cased: the label is the form's own wording,
 * so it becomes the *key* of its sibling value rather than a candidate itself.
 * Without this, "Email us at hello@thesalon.com" as a question label would
 * become an email candidate.
 */
function flatten(payload: unknown): Candidate[] {
  const out: Candidate[] = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown, key: string, depth: number): void => {
    if (depth > MAX_DEPTH || node === null || node === undefined) return;

    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
      const value = String(node).trim();
      if (value) out.push({ key, value });
      return;
    }
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item, key, depth + 1);
      return;
    }

    const record = node as Record<string, unknown>;
    const field = record.field as Record<string, unknown> | undefined;
    // Typeform: {field: {ref: 'email'}, type: 'email', email: '...'} — the ref
    // names the answer and the typed key holds it.
    const typedValue = typeof record.type === 'string' ? record[record.type] : undefined;
    const labelish =
      record.label ?? record.question ?? record.title ?? field?.ref ?? field?.title;
    const valueish = record.value ?? record.answer ?? record.text ?? typedValue;

    if (typeof labelish === 'string' && valueish !== undefined && valueish !== null) {
      // The label names the value; walk the value under it and never let the
      // label's own text become a candidate.
      walk(valueish, labelish.toLowerCase(), depth + 1);
      const consumed = new Set(['label', 'question', 'title', 'field', 'type', 'value', 'answer', 'text']);
      if (typeof record.type === 'string') consumed.add(record.type);
      for (const [k, v] of Object.entries(record)) {
        if (consumed.has(k)) continue;
        walk(v, k.toLowerCase(), depth + 1);
      }
      return;
    }

    for (const [k, v] of Object.entries(record)) walk(v, k.toLowerCase(), depth + 1);
  };

  walk(payload, '', 0);
  return out;
}

/**
 * Email, or null plus a warning when the only candidate is the business's own.
 *
 * Order: hinted non-business keys, then any other non-business key. A candidate
 * whose key is in BUSINESS_EMAIL_KEY is never used — but its presence is what
 * distinguishes "we found the salon's address and refused it" from "there was no
 * address at all", which is the difference between a warning and silence.
 */
function pickEmail(candidates: Candidate[]): { email: string | null; refused: boolean } {
  const valid = candidates
    .map((c) => ({ ...c, normalized: normalizeEmail(c.value) }))
    .filter((c): c is Candidate & { normalized: string } => c.normalized !== null);

  const usable = valid.filter((c) => !BUSINESS_EMAIL_KEY.test(c.key));
  const hinted = usable.find((c) => EMAIL_KEY_HINT.test(c.key));
  const chosen = hinted ?? usable[0];

  if (chosen) return { email: chosen.normalized, refused: false };
  // Every candidate came from a business key — refuse, and say so.
  return { email: null, refused: valid.length > 0 };
}

/**
 * Phone, or null plus a warning when a candidate was refused for lack of
 * evidence that it is one.
 *
 * Any 10-digit run normalizes to a plausible number (normalize.ts:45): an order
 * id, a zip+4 with an extension, an epoch value. A wrong phone creates a wrong
 * identity, which merges two unrelated humans. So a candidate needs either a key
 * hint or visible formatting.
 */
function pickPhone(candidates: Candidate[]): { phone: string | null; refused: boolean } {
  let refused = false;
  // A timestamp reduces to a long digit run and contains dashes, so it passes
  // both normalizePhone and the formatting check. Exclude it up front.
  const plausible = candidates.filter(
    (c) => !DATE_SHAPED.test(c.value) && normalizePhone(c.value) !== null,
  );

  const hinted = plausible.find((c) => PHONE_KEY_HINT.test(c.key));
  if (hinted) return { phone: normalizePhone(hinted.value), refused: false };

  for (const c of plausible) {
    if (PHONE_FORMATTING.test(c.value)) return { phone: normalizePhone(c.value), refused: false };
    // Phone-shaped digits, no key hint, no formatting. Refuse and remember why.
    refused = true;
  }
  return { phone: null, refused };
}

function pickName(candidates: Candidate[]): string | null {
  const named = candidates.filter(
    (c) => NAME_KEY.test(c.key) && !NAME_KEY_EXCLUDE.test(c.key),
  );

  const first = named.find((c) => FIRST_NAME_KEY.test(c.key));
  const last = named.find((c) => LAST_NAME_KEY.test(c.key));
  // A full name beats first+last, which beats either alone.
  const full = named.find((c) => c !== first && c !== last);
  if (full) return full.value;
  if (first && last) return `${first.value} ${last.value}`;
  return first?.value ?? last?.value ?? null;
}

function pickNotes(candidates: Candidate[]): string | null {
  const found = candidates.find((c) => NOTES_KEY.test(c.key));
  if (!found) return null;
  return found.value.slice(0, MAX_NOTES);
}

/**
 * The provider's own id for THIS delivery.
 *
 * Deliberately an exact-match key list, not a substring: `form_id` and `user_id`
 * are stable across every submission, so using either as the dedupe key would
 * make the second real lead look like a retry of the first and silently discard
 * it.
 */
function pickEventId(candidates: Candidate[]): string | null {
  const found = candidates.find((c) => EVENT_ID_KEY.test(c.key));
  return found ? found.value : null;
}

/**
 * A payload timestamp, only when it parses AND lands in the trust window.
 *
 * `leads.created_at` is notNull and drives every leak rule. An epoch-seconds
 * value misread as milliseconds lands in 1970, which makes every lead instantly
 * and maximally leaked and inflates reported lost revenue.
 *
 * `refused` is true only when a candidate parsed but fell outside the window.
 * No timestamp at all is not an error — the handler uses receipt time.
 */
function pickTimestamp(
  candidates: Candidate[],
  now: Date,
): { occurredAt: Date | null; refused: boolean } {
  const floor = now.getTime() - NINETY_DAYS_MS;
  const ceiling = now.getTime() + FIVE_MINUTES_MS;
  let refused = false;

  for (const c of candidates) {
    if (!TIMESTAMP_KEY.test(c.key)) continue;
    // Bare digit runs are epoch values of ambiguous unit. Date's number parse
    // assumes milliseconds, which is exactly the 1970 bug, so let the window
    // reject them rather than guessing a multiplier.
    const parsed = new Date(/^\d+$/.test(c.value) ? Number(c.value) : c.value);
    const ms = parsed.getTime();
    if (Number.isNaN(ms)) continue;
    if (ms >= floor && ms <= ceiling) return { occurredAt: parsed, refused: false };
    refused = true;
  }
  return { occurredAt: null, refused };
}

export function extractLead(payload: unknown, now: Date = new Date()): ExtractedLead {
  const candidates = flatten(payload);
  const warnings: ParseWarning[] = [];

  const { email, refused: emailRefused } = pickEmail(candidates);
  const { phone, refused: phoneRefused } = pickPhone(candidates);
  const { occurredAt, refused: timeRefused } = pickTimestamp(candidates, now);

  if (emailRefused) warnings.push('email_only_in_business_key');
  if (phoneRefused) warnings.push('phone_rejected_unformatted');
  if (timeRefused) warnings.push('timestamp_out_of_window');

  const lead: ExtractedLead = {
    customerName: pickName(candidates),
    email,
    phone,
    notes: pickNotes(candidates),
    providerEventId: pickEventId(candidates),
    occurredAt,
    warnings,
  };

  // Last, so it reflects the outcome of every guard above.
  if (isEmptyExtraction(lead)) warnings.push('nothing_extracted');
  return lead;
}
```

- [ ] **Step 4: Export it**

Append to `packages/core/src/index.ts`:

```ts
export * from './extract'
```

Add to the `exports` map in `packages/core/package.json`, after the
`"./normalize"` entry:

```json
    "./extract": {
      "types": "./dist/extract.d.ts",
      "import": "./dist/extract.js"
    }
```

Task 2 adds the `default` condition to this entry along with the other five;
leaving it out here keeps this task's diff to one concern.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run test:core
npm run typecheck
```

Expected: all green. `test:core` runs `vitest` inside `packages/core`, whose
config includes `src/**/*.test.ts`.

If a fixture fails, fix `extract.ts`, not the test — the fixtures are the
contract, and the adversarial ones each encode a specific corruption the spec
argues against.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/extract.ts packages/core/src/extract.test.ts \
       packages/core/src/index.ts packages/core/package.json
git commit -m "$(cat <<'EOF'
feat(core): provider-agnostic lead extraction that refuses to guess

One deep scan for every provider rather than per-provider adapters. Two guards
carry the design: an address found only under from/reply_to/owner is the
business's own and would collapse every lead onto one identity, and a bare
10-digit run is as likely an order id as a phone -- either would create a wrong
identity, and mergeLeadFields is monotonic so it cannot be undone.

The 90-day/+5-minute timestamp window exists because epoch seconds misread as
milliseconds lands in 1970, which makes every lead maximally leaked and inflates
the reported figure.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Make `drizzle-kit generate` runnable again

Do this before Task 3. Task 3 cannot register a migration without it.

**Why it is broken.** drizzle-kit is CJS and `require()`s
`packages/db/src/schema/index.ts`, which imports `@missed-lead/core`. Commit
`e37e38d` made core `"type": "module"` and removed the `require` conditions from
its `exports` map — correctly, since they pointed at ESM files. The consequence
was not noticed because no migration has been generated since. Two facts, both
confirmed by running the tools:

- With no `require` and no `default` condition, CJS resolution finds no target
  and Node throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- Node 22 *can* `require()` an ESM graph, but only when every relative specifier
  inside it resolves. Core's are extensionless (`export * from './parser'`), which
  ESM does not permit, so with a condition added it fails one step later on
  `ERR_MODULE_NOT_FOUND: .../dist/parser`.

So both halves are needed. `default` rather than re-adding `require`: `default`
is the terminal fallback for any condition set, which is what we mean — there is
one build and it serves everyone.

**Files:**
- Modify: `packages/core/package.json` (add a `default` condition to all six subpaths)
- Modify: `packages/core/src/index.ts` (4 specifiers)
- Modify: `packages/core/src/leaks.ts` (2 specifiers)
- Modify: `packages/core/src/revenue.ts` (2 specifiers)

**Interfaces:** changes nothing any caller sees. No exported name, signature, or
type moves. `packages/core/src/{parser,normalize,extract}.ts` need no edit —
they import nothing relative.

- [ ] **Step 1: Write the failing check**

There is no test framework for packaging, so the check is the command that is
broken. Run it and capture the failure:

```bash
cd packages/db && npx drizzle-kit generate --name probe; cd ../..
```

Expected: `Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
.../node_modules/@missed-lead/core/package.json`, and no new file in
`packages/db/migrations/`.

- [ ] **Step 2: Add a `default` condition to every subpath**

In `packages/core/package.json`, each of the six entries gains one line. Keep
`types` first and `default` last — condition order in an `exports` map is
significant, and `default` must be the fallback.

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./parser": {
      "types": "./dist/parser.d.ts",
      "import": "./dist/parser.js",
      "default": "./dist/parser.js"
    },
    "./leaks": {
      "types": "./dist/leaks.d.ts",
      "import": "./dist/leaks.js",
      "default": "./dist/leaks.js"
    },
    "./revenue": {
      "types": "./dist/revenue.d.ts",
      "import": "./dist/revenue.js",
      "default": "./dist/revenue.js"
    },
    "./normalize": {
      "types": "./dist/normalize.d.ts",
      "import": "./dist/normalize.js",
      "default": "./dist/normalize.js"
    },
    "./extract": {
      "types": "./dist/extract.d.ts",
      "import": "./dist/extract.js",
      "default": "./dist/extract.js"
    }
  },
```

- [ ] **Step 3: Add `.js` to every relative specifier in core**

`packages/core/src/index.ts` in full:

```ts
export * from './parser.js'
export * from './leaks.js'
export * from './revenue.js'
export * from './normalize.js'
export * from './extract.js'
```

`packages/core/src/leaks.ts`, lines 1-2:

```ts
import type { Lead } from './parser.js';
import { isTerminalStatus } from './parser.js';
```

`packages/core/src/revenue.ts`, lines 1-2:

```ts
import type { LeakSummary, LeadWithLeaks } from './leaks.js';
import { isRecoveredStatus, isTerminalStatus } from './parser.js';
```

`.js` pointing at a `.ts` file is correct, not a typo: the specifier names the
*emitted* file, and `moduleResolution: bundler` maps it back to the source. This
is the standard requirement for ESM output.

- [ ] **Step 4: Verify the fix, and that nothing else moved**

```bash
npm run build --workspace @missed-lead/core
node -e "const c = require('@missed-lead/core'); console.log(c.LEAD_STATUSES.length)"
```

Expected: prints `7`. That is `require()` of an ESM package succeeding — the
exact thing that was failing.

```bash
npm run test:unit
npm run typecheck
```

Expected: 5 core test files green (the 4 that existed plus Task 1's), web tests
green, typecheck exit 0. If `test:core` reports fewer than 5 files, Task 1 is not
in the working tree and you are on the wrong branch.

- [ ] **Step 5: Commit**

```bash
git add packages/core/package.json packages/core/src/index.ts \
       packages/core/src/leaks.ts packages/core/src/revenue.ts
git commit -m "$(cat <<'EOF'
fix(core): restore CJS resolvability so drizzle-kit can read the schema

drizzle-kit is CJS and require()s the Drizzle schema, which imports this
package. e37e38d correctly dropped the `require` conditions that pointed at ESM
files, but left nothing for a CJS caller to resolve -- so every
`drizzle-kit generate` since has died on ERR_PACKAGE_PATH_NOT_EXPORTED. Nobody
noticed because no migration has been generated since.

A `default` condition alone is not enough: Node 22 can require() an ESM graph,
but only one whose relative specifiers carry extensions. These were
extensionless, so it failed one step later on ERR_MODULE_NOT_FOUND for
./dist/parser. Both halves are needed.

No exported name, signature, or type changes.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Schema, `resolver_role`, and `ingest_admit`

The security boundary of the whole phase. Everything after this trusts that
`ingest_admit` can reach `lead_sources` and `ingest_rate_counters` and nothing
else.

**Files:**
- Create: `packages/db/src/schema/rateCounters.ts`
- Create: `packages/db/src/__tests__/resolver-role.test.ts`
- Modify: `packages/db/src/schema/leads.ts` (add `tokenRotatedAt` to `leadSources`)
- Modify: `packages/db/src/schema/index.ts` (one export line)
- Modify: `packages/db/migrations/0003_webhook_ingest.sql` (generated, then appended to)
- Generated: `packages/db/migrations/meta/{_journal,0003_snapshot}.json` — never hand-edit
- Modify: `packages/db/README.md` (the `--custom` instruction is wrong)

**Interfaces:**
- Consumes: Task 2's packaging fix. `db:generate` fails without it.
- Produces, relied on by Task 4:
  - `ingestRateCounters` — Drizzle table, columns `bucket`, `windowStart`, `count`
  - `leadSources.tokenRotatedAt` — `timestamp with time zone`, nullable
  - `public.ingest_admit(p_token text, p_ip text)` returning one row:
    ```
    customer_id  uuid     null when the token does not resolve
    source_id    uuid     null when the token does not resolve
    token_state  text     'current' | 'previous' | 'unknown'
    admit        boolean  false when a rate limit is exceeded
    retry_after  integer  seconds; null unless admit is false
    ```
  - `resolver_role` — assumable via `set local role resolver_role`

- [ ] **Step 1: Write the failing test**

Create `packages/db/src/__tests__/resolver-role.test.ts`. This file is mostly
negative controls: the point is not that `ingest_admit` works but that a bug on
the pre-tenant path cannot reach tenant data.

```ts
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * resolver_role — the pre-tenant boundary. Requires `npx supabase start`.
 *
 * Resolving a token to a tenant cannot happen inside withIngestScope: the
 * lead_sources policy filters on the customer_id the lookup is trying to
 * produce (0001_ingest_role.sql:62). Running it as `postgres` would work but
 * `postgres` owns the tables and ENABLE ROW LEVEL SECURITY exempts the owner, so
 * a bug in the pre-tenant path could read anything.
 *
 * Hence a second narrow role. Every assertion below exists to prove the narrow
 * grant list is real enforcement rather than a convention someone can drift away
 * from — most of this file asserts what the role CANNOT do.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const DB_URL =
  process.env.DATABASE_URL_DIRECT ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(DB_URL, { prepare: false, max: 2 });
const RUN = Date.now().toString(36);

const userIds: string[] = [];
let customerId: string;
let otherCustomerId: string;
let sourceId: string;
let otherSourceId: string;
let currentToken: string;
let otherToken: string;

/**
 * customers.auth_user_id has a real FK to auth.users
 * (0000_initial_multitenant_schema.sql:101), so a bare uuid will not insert.
 * Create the auth user first, exactly as ingest.test.ts does.
 */
async function seedTenant(
  slug: string,
): Promise<{ customerId: string; sourceId: string; token: string }> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${slug}-${RUN}@resolver.test`,
    password: 'test-password-1234',
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);

  const [customer] = await sql<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${data.user.id}, ${`${slug} Salon`}) returning id
  `;
  const token = `tok-${slug}-${RUN}`;
  const [source] = await sql<{ id: string }[]>`
    insert into lead_sources (customer_id, kind, label, webhook_token)
    values (${customer!.id}, 'webhook', 'Website form', ${token}) returning id
  `;
  return { customerId: customer!.id, sourceId: source!.id, token };
}

beforeAll(async () => {
  const mine = await seedTenant('resolver');
  const theirs = await seedTenant('rival');
  customerId = mine.customerId;
  sourceId = mine.sourceId;
  currentToken = mine.token;
  otherCustomerId = theirs.customerId;
  otherSourceId = theirs.sourceId;
  otherToken = theirs.token;
}, 60_000);

afterAll(async () => {
  for (const id of [customerId, otherCustomerId].filter(Boolean)) {
    await sql`delete from customers where id = ${id}`;
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await sql`delete from ingest_rate_counters where bucket like ${`%${RUN}%`}`;
  await sql.end();
});

/** Run `fn` as resolver_role, the way the handler will. */
function asResolver<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`set local role resolver_role`;
    return fn(tx);
  }) as Promise<T>;
}

interface AdmitRow {
  customer_id: string | null;
  source_id: string | null;
  token_state: 'current' | 'previous' | 'unknown';
  admit: boolean;
  retry_after: number | null;
}

const admit = (token: string, ip: string | null) =>
  asResolver(async (tx) => {
    const rows = await tx<AdmitRow[]>`select * from public.ingest_admit(${token}, ${ip})`;
    return rows[0]!;
  });

describe('resolver_role — what it cannot reach', () => {
  it('is not permitted to bypass RLS', async () => {
    const [role] = await sql<{ rolbypassrls: boolean }[]>`
      select rolbypassrls from pg_roles where rolname = 'resolver_role'
    `;
    expect(role!.rolbypassrls).toBe(false);
  });

  it.each(['leads', 'customers', 'lead_events', 'lead_identities', 'detection_settings', 'push_tokens'])(
    'cannot select from %s at all',
    async (table) => {
      // Not "returns no rows" — that is what a policy does. This must be a
      // privilege error, because the role holds no grant on these tables.
      const attempt = asResolver((tx) => tx.unsafe(`select * from public.${table} limit 1`));
      await expect(attempt).rejects.toThrow(/permission denied/i);
    },
  );

  it('cannot insert, update, or delete a lead_source', async () => {
    // SELECT only. Issuing and revoking tokens is the provisioning path's job,
    // which runs authenticated as `postgres` — not this role's.
    await expect(
      asResolver((tx) => tx`update lead_sources set label = 'hijacked' where id = ${sourceId}`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asResolver((tx) => tx`delete from lead_sources where id = ${sourceId}`),
    ).rejects.toThrow(/permission denied/i);
  });

  it('ingest_admit is SECURITY INVOKER, not DEFINER', async () => {
    // A DEFINER function owned by postgres would execute with the owner's
    // privileges, which would make every grant assertion above meaningless.
    const [fn] = await sql<{ prosecdef: boolean }[]>`
      select prosecdef from pg_proc
      where proname = 'ingest_admit' and pronamespace = 'public'::regnamespace
    `;
    expect(fn!.prosecdef).toBe(false);
  });

  it('can see every tenant\'s tokens — that IS the lookup', async () => {
    // USING (true) on lead_sources is not a gap. The worst a bug on this path
    // can do is confirm whether a token exists, which a caller already knew.
    const rows = await asResolver(
      (tx) => tx<{ id: string }[]>`select id from lead_sources where webhook_token is not null`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ingest_admit — token resolution', () => {
  it('resolves a current token to its tenant', async () => {
    const row = await admit(currentToken, `1.1.1.${RUN.length}`);
    expect(row.customer_id).toBe(customerId);
    expect(row.source_id).toBe(sourceId);
    expect(row.token_state).toBe('current');
    expect(row.admit).toBe(true);
    expect(row.retry_after).toBeNull();
  });

  it('returns unknown for a token that does not exist', async () => {
    const row = await admit(`no-such-token-${RUN}`, '2.2.2.2');
    expect(row.customer_id).toBeNull();
    expect(row.source_id).toBeNull();
    expect(row.token_state).toBe('unknown');
    expect(row.admit).toBe(true); // under the limit; the handler turns this into 404
  });

  it('never resolves one tenant\'s token to another tenant', async () => {
    const mine = await admit(currentToken, '3.3.3.3');
    const theirs = await admit(otherToken, '3.3.3.3');
    expect(mine.customer_id).toBe(customerId);
    expect(theirs.customer_id).toBe(otherCustomerId);
    expect(theirs.customer_id).not.toBe(mine.customer_id);
    expect(theirs.source_id).toBe(otherSourceId);
  });

  it('treats a revoked source as unknown even with the old token string', async () => {
    const seeded = await seedTenant('revoked');
    await sql`
      update lead_sources
      set revoked_at = now(), webhook_token = null, webhook_token_previous = null
      where id = ${seeded.sourceId}
    `;
    const row = await admit(seeded.token, '4.4.4.4');
    expect(row.token_state).toBe('unknown');
    expect(row.customer_id).toBeNull();
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('is case-sensitive and does not match a prefix', async () => {
    expect((await admit(currentToken.toUpperCase(), '5.5.5.5')).token_state).toBe('unknown');
    expect((await admit(currentToken.slice(0, -1), '5.5.5.5')).token_state).toBe('unknown');
  });
});

describe('ingest_admit — the rotation overlap window', () => {
  it('accepts a previous token inside 72 hours and reports it', async () => {
    const seeded = await seedTenant('rotated-fresh');
    await sql`
      update lead_sources
      set webhook_token = ${`${seeded.token}-new`},
          webhook_token_previous = ${seeded.token},
          token_rotated_at = now() - interval '71 hours'
      where id = ${seeded.sourceId}
    `;
    const row = await admit(seeded.token, '6.6.6.6');
    // The lead is still ingested — a rotation must not silently drop real leads.
    expect(row.customer_id).toBe(seeded.customerId);
    expect(row.token_state).toBe('previous');
    expect(row.admit).toBe(true);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('rejects a previous token past 72 hours', async () => {
    const seeded = await seedTenant('rotated-stale');
    await sql`
      update lead_sources
      set webhook_token = ${`${seeded.token}-new`},
          webhook_token_previous = ${seeded.token},
          token_rotated_at = now() - interval '73 hours'
      where id = ${seeded.sourceId}
    `;
    const row = await admit(seeded.token, '7.7.7.7');
    expect(row.token_state).toBe('unknown');
    expect(row.customer_id).toBeNull();
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('rejects a previous token when token_rotated_at was never stamped', async () => {
    // Fails closed. A null timestamp means the window's start is unknown, and an
    // unbounded window is exactly what the column exists to prevent.
    const seeded = await seedTenant('rotated-null');
    await sql`
      update lead_sources
      set webhook_token = ${`${seeded.token}-new`},
          webhook_token_previous = ${seeded.token},
          token_rotated_at = null
      where id = ${seeded.sourceId}
    `;
    const row = await admit(seeded.token, '8.8.8.8');
    expect(row.token_state).toBe('unknown');
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('prefers the current token when a string somehow sits in both columns', async () => {
    const seeded = await seedTenant('both-columns');
    await sql`
      update lead_sources set webhook_token_previous = ${`${seeded.token}-old`},
        token_rotated_at = now() where id = ${seeded.sourceId}
    `;
    expect((await admit(seeded.token, '9.9.9.9')).token_state).toBe('current');
    await sql`delete from customers where id = ${seeded.customerId}`;
  });
});

describe('ingest_admit — rate limiting', () => {
  /** Charge one bucket N times and return the last row. */
  async function hammer(token: string, ip: string | null, times: number): Promise<AdmitRow> {
    let last!: AdmitRow;
    for (let i = 0; i < times; i++) last = await admit(token, ip);
    return last;
  }

  it('admits 60 deliveries a minute per source and refuses the 61st', async () => {
    const seeded = await seedTenant('rate-src');
    const ok = await hammer(seeded.token, null, 60);
    expect(ok.admit).toBe(true);

    const over = await admit(seeded.token, null);
    expect(over.admit).toBe(false);
    expect(over.retry_after).toBeGreaterThan(0);
    expect(over.retry_after).toBeLessThanOrEqual(60);
    // Still resolves — the handler needs the tenant to decide 429 vs 404.
    expect(over.customer_id).toBe(seeded.customerId);
    expect(over.token_state).toBe('current');

    await sql`delete from customers where id = ${seeded.customerId}`;
  }, 60_000);

  it('charges unknown tokens to a tighter per-IP bucket — the scanner defence', async () => {
    const ip = `10.0.0.${RUN.length}`;
    const ok = await hammer(`scan-${RUN}`, ip, 20);
    expect(ok.admit).toBe(true);
    const over = await admit(`scan-${RUN}-other`, ip);
    // A different guessed token, same IP: the bucket is the IP, not the token.
    expect(over.admit).toBe(false);
    expect(over.token_state).toBe('unknown');
    expect(over.retry_after).toBeGreaterThan(0);
  }, 60_000);

  it('does not let one IP\'s scanning block another IP', async () => {
    const noisy = `10.1.0.${RUN.length}`;
    await hammer(`noisy-${RUN}`, noisy, 21);
    expect((await admit(`quiet-${RUN}`, `10.1.1.${RUN.length}`)).admit).toBe(true);
  }, 60_000);

  it('does not charge the unknown bucket when the token resolves', async () => {
    // Typeform posts for every one of its customers from a handful of egress
    // addresses. Charging valid traffic to a 20/min IP bucket would throttle our
    // tenants for each other's volume.
    const seeded = await seedTenant('shared-egress');
    const ip = `10.2.0.${RUN.length}`;
    await hammer(seeded.token, ip, 25);
    const [row] = await sql<{ count: number }[]>`
      select count from ingest_rate_counters
      where bucket = ${`unk:${ip}`} and window_start = date_trunc('minute', now())
    `;
    expect(row).toBeUndefined();
    await sql`delete from customers where id = ${seeded.customerId}`;
  }, 60_000);

  it('skips IP buckets entirely when no IP is supplied', async () => {
    // A missing x-forwarded-for must not key every caller onto one shared
    // placeholder bucket, which would make one local invocation throttle
    // production.
    const before = await sql<{ bucket: string }[]>`
      select bucket from ingest_rate_counters where bucket in ('ip:', 'unk:', 'ip:null', 'unk:null')
    `;
    await admit(`no-ip-${RUN}`, null);
    const after = await sql<{ bucket: string }[]>`
      select bucket from ingest_rate_counters where bucket in ('ip:', 'unk:', 'ip:null', 'unk:null')
    `;
    expect(after.length).toBe(before.length);
  });

  it('counts in one-minute windows keyed on date_trunc', async () => {
    const seeded = await seedTenant('window-key');
    await admit(seeded.token, null);
    const rows = await sql<{ window_start: Date; count: number }[]>`
      select window_start, count from ingest_rate_counters
      where bucket = ${`src:${seeded.sourceId}`}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.window_start.getSeconds()).toBe(0);
    expect(rows[0]!.window_start.getMilliseconds()).toBe(0);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('a fresh window starts the count over', async () => {
    const seeded = await seedTenant('window-roll');
    // Backdate a full bucket into the previous minute; this minute must be clear.
    await sql`
      insert into ingest_rate_counters (bucket, window_start, count)
      values (${`src:${seeded.sourceId}`}, date_trunc('minute', now()) - interval '1 minute', 60)
    `;
    expect((await admit(seeded.token, null)).admit).toBe(true);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('charges the counter even when the delivery is over the limit', async () => {
    // The counters commit with transaction 1, separately from the ingest write.
    // If they shared the ingest transaction, a retry storm whose deliveries all
    // deduped would roll its own counters back and abuse would be free.
    const seeded = await seedTenant('charge-on-reject');
    await sql`
      insert into ingest_rate_counters (bucket, window_start, count)
      values (${`src:${seeded.sourceId}`}, date_trunc('minute', now()), 60)
    `;
    await admit(seeded.token, null);
    const [row] = await sql<{ count: number }[]>`
      select count from ingest_rate_counters
      where bucket = ${`src:${seeded.sourceId}`} and window_start = date_trunc('minute', now())
    `;
    expect(row!.count).toBe(61);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('prunes rows older than two hours', async () => {
    // Pruning fires on ~1% of calls, so drive it directly rather than gambling.
    const stale = `stale-${RUN}`;
    await sql`
      insert into ingest_rate_counters (bucket, window_start, count)
      values (${stale}, now() - interval '3 hours', 1)
    `;
    await asResolver(
      (tx) => tx`delete from ingest_rate_counters where window_start < now() - interval '2 hours'`,
    );
    const rows = await sql`select 1 from ingest_rate_counters where bucket = ${stale}`;
    expect(rows).toHaveLength(0);
  });
});
```

The pruning test asserts that `resolver_role` *may* issue that `DELETE` — the
deviation recorded above. It is a privilege assertion in the shape of a
behavioural one; if the grant is missing it throws `permission denied` rather
than failing an expectation.

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run supabase:start        # if not already up; needs Docker
npm run test:db
```

Expected: `resolver-role.test.ts` red throughout — `permission denied to set role
"resolver_role"` on every case, because the role does not exist yet. The other
db suites stay green.

- [ ] **Step 3: Add the Drizzle schema**

Create `packages/db/src/schema/rateCounters.ts`:

```ts
import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Rate-limit counters for the public ingest endpoint.
 *
 * A Postgres table rather than a vendor service: no new dependency, it survives
 * a cold start, and it leaves an audit trail a future "you're being spammed"
 * message can read.
 *
 * Deliberately NOT tenant-scoped, which is why this is the one table in this
 * directory with no `tenantPolicy()` call. The buckets that matter most are
 * charged before a token resolves to a tenant (`unk:<ip>`, `ip:<ip>`), so a
 * customer_id column would be null exactly when it is needed. RLS is still
 * enabled on it in the migration, with `authenticated` and `anon` granted
 * nothing.
 *
 * `bucket` is one of `src:<source_id>`, `unk:<ip>`, or `ip:<ip>`; `windowStart`
 * is `date_trunc('minute', now())`. Rows older than two hours are pruned inside
 * `ingest_admit`, so there is no cron job and no unbounded growth.
 */
export const ingestRateCounters = pgTable(
  'ingest_rate_counters',
  {
    bucket: text('bucket').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.windowStart] })],
);

export type IngestRateCounter = typeof ingestRateCounters.$inferSelect;
```

In `packages/db/src/schema/leads.ts`, add one column to `leadSources`, directly
after `inboundAddress` (line 41):

```ts
    /** When webhookTokenPrevious was demoted. The overlap window is measured
     *  from here, so a rotation cannot leave an old token live forever. A null
     *  value means the window's start is unknown, and ingest_admit fails closed
     *  rather than honouring an unbounded one. */
    tokenRotatedAt: timestamp('token_rotated_at', { withTimezone: true }),
```

In `packages/db/src/schema/index.ts`, after the `./leads` line:

```ts
export * from './rateCounters';
```

- [ ] **Step 4: Generate the migration**

```bash
npm run db:generate -w @missed-lead/db
```

Expected output ends with
`[✓] Your SQL migration file ➜ migrations/0003_webhook_ingest.sql`, and
`0003_webhook_ingest.sql` contains exactly:

```sql
CREATE TABLE "ingest_rate_counters" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ingest_rate_counters_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
ALTER TABLE "lead_sources" ADD COLUMN "token_rotated_at" timestamp with time zone;
```

If drizzle-kit asks for a migration name interactively, pass
`--name webhook_ingest`. If it dies with `ERR_PACKAGE_PATH_NOT_EXPORTED`, Task 2
is not applied — go back and do it.

`migrations/meta/_journal.json` gains an `idx: 3` entry and
`migrations/meta/0003_snapshot.json` appears. Neither is hand-editable:
`db:migrate` reads the journal, and drizzle-kit diffs the snapshot to generate
`0004`. A hand-written file with no journal entry never runs.

**Do not use `--custom`.** `packages/db/README.md` currently recommends it for
raw SQL, but it emits an *empty* file and writes a snapshot identical to `0002` —
so the schema changes above would be invisible to the next `generate`, and `0004`
would try to create `ingest_rate_counters` a second time. Generate normally, then
append the hand-written SQL to the generated file. Step 8 corrects the README.

- [ ] **Step 5: Append the hand-written SQL**

Everything below goes at the end of the *generated* `0003_webhook_ingest.sql`, so
one journal entry covers the whole change. Drizzle emits no `CREATE ROLE`, no
`GRANT`, and no `CREATE FUNCTION` (`PROJECT.md:90`), so this half is authored by
hand.

```sql
--> statement-breakpoint

-- ── resolver_role: the pre-tenant lookup boundary ──────────────────────────
--
-- Resolving a webhook token to a tenant is a chicken-and-egg. ingest_role holds
-- SELECT on lead_sources (0001_ingest_role.sql:58) but its policy filters
-- `customer_id = current_ingest_customer_id()` — the value the lookup is trying
-- to produce. So resolution cannot happen inside withIngestScope.
--
-- The lazy alternative is to query as `postgres`, which DATABASE_URL connects
-- as. That works, but `postgres` owns these tables and ENABLE ROW LEVEL
-- SECURITY exempts the owner, so a bug in the pre-tenant path could read any
-- table in the schema.
--
-- Instead: a second NOBYPASSRLS role that can reach lead_sources and the rate
-- counters and NOTHING else. USING (true) on lead_sources is not a gap — seeing
-- every tenant's tokens IS the lookup. What matters is that the worst a bug here
-- can do is confirm whether a token exists, which the caller already knew.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resolver_role') THEN
    CREATE ROLE resolver_role NOBYPASSRLS NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO resolver_role;
--> statement-breakpoint

GRANT SELECT ON TABLE public.lead_sources TO resolver_role;
--> statement-breakpoint
CREATE POLICY "lead_sources_resolver_lookup" ON public.lead_sources
  AS PERMISSIVE FOR SELECT TO resolver_role
  USING (true);
--> statement-breakpoint

-- The counters are not tenant-scoped: the buckets that matter are charged before
-- a token resolves, so a customer_id would be null exactly when it is needed.
-- RLS is still enabled so the table is not readable by default, and authenticated
-- and anon are granted nothing — it holds no data an owner needs and none an
-- anonymous visitor may see.
ALTER TABLE public.ingest_rate_counters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- DELETE included deliberately: pruning runs inside ingest_admit, which is
-- SECURITY INVOKER, so the DELETE executes with this role's privileges. A role
-- that can already INSERT and UPDATE arbitrary counter rows gains nothing from
-- DELETE on the same table, so granting it is cheaper than a SECURITY DEFINER
-- function whose owner privileges would need their own argument.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ingest_rate_counters TO resolver_role;
--> statement-breakpoint
CREATE POLICY "ingest_rate_counters_resolver" ON public.ingest_rate_counters
  AS PERMISSIVE FOR ALL TO resolver_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- ── Rate accounting ───────────────────────────────────────────────────────
--
-- Returns true when this request is within `p_limit` for the current minute.
-- The row is incremented either way: a rejected request must still be charged,
-- or a caller past the limit gets free retries.
--
-- SECURITY INVOKER, like its caller — a DEFINER function owned by `postgres`
-- would run with the owner's privileges and make the grants above decorative.
CREATE OR REPLACE FUNCTION public.bump_rate_counter(p_bucket text, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_window timestamptz := date_trunc('minute', now());
  v_count  integer;
BEGIN
  INSERT INTO public.ingest_rate_counters AS c (bucket, window_start, count)
  VALUES (p_bucket, v_window, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET count = c.count + 1
  RETURNING c.count INTO v_count;

  RETURN v_count <= p_limit;
END
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.bump_rate_counter(text, integer) TO resolver_role;
--> statement-breakpoint

-- ── ingest_admit: the entire pre-tenant surface, in one statement ─────────
--
-- Token resolution and rate accounting together, so the handler cannot get the
-- order wrong and so the counter increment and the limit check cannot race
-- apart.
--
-- SECURITY INVOKER, deliberately not DEFINER: the privileges in effect are the
-- caller's — resolver_role's — which is what makes the narrow grant list above
-- an enforcement boundary rather than a convention.
CREATE OR REPLACE FUNCTION public.ingest_admit(p_token text, p_ip text)
RETURNS TABLE (
  customer_id uuid,
  source_id   uuid,
  token_state text,
  admit       boolean,
  retry_after integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_source_id   uuid;
  v_state       text := 'unknown';
  v_admit       boolean := true;
  v_retry       integer;
BEGIN
  -- Current token first. A string sitting in both columns (of the same row or
  -- different ones) must resolve as current, never as an expiring previous.
  SELECT s.customer_id, s.id INTO v_customer_id, v_source_id
  FROM public.lead_sources s
  WHERE s.webhook_token = p_token AND s.revoked_at IS NULL
  LIMIT 1;

  IF v_source_id IS NOT NULL THEN
    v_state := 'current';
  ELSE
    -- Previous token, inside the 72-hour overlap. Time-bounded rather than
    -- manual because a manual window never gets closed. A null
    -- token_rotated_at fails closed: the window's start is unknown, and an
    -- unbounded window is what the column exists to prevent.
    SELECT s.customer_id, s.id INTO v_customer_id, v_source_id
    FROM public.lead_sources s
    WHERE s.webhook_token_previous = p_token
      AND s.revoked_at IS NULL
      AND s.token_rotated_at IS NOT NULL
      AND s.token_rotated_at > now() - interval '72 hours'
    LIMIT 1;
    IF v_source_id IS NOT NULL THEN v_state := 'previous'; END IF;
  END IF;

  -- Seconds remaining in this minute. Every bucket shares the window, so one
  -- figure serves whichever limit tripped.
  v_retry := 60 - floor(extract(epoch FROM (now() - date_trunc('minute', now()))))::integer;
  IF v_retry < 1 THEN v_retry := 1; END IF;

  -- Coarse per-IP backstop on EVERY request, including the ones about to be
  -- rejected. 300/min is high enough never to bind on legitimate shared-egress
  -- traffic: Typeform posts for all of its customers from a handful of
  -- addresses, so a tight limit here would throttle our tenants for each
  -- other's volume.
  --
  -- A null p_ip (no x-forwarded-for — a local invocation) skips the IP buckets
  -- rather than keying on a placeholder every caller would share.
  IF p_ip IS NOT NULL AND p_ip <> '' THEN
    IF NOT public.bump_rate_counter('ip:' || p_ip, 300) THEN
      v_admit := false;
    END IF;
  END IF;

  IF v_state = 'unknown' THEN
    -- The scanner defence (PITFALLS.md:7). Charged only when the token does not
    -- resolve, so guessing is what costs quota.
    IF p_ip IS NOT NULL AND p_ip <> '' THEN
      IF NOT public.bump_rate_counter('unk:' || p_ip, 20) THEN
        v_admit := false;
      END IF;
    END IF;
  ELSE
    -- Per-source. A salon gets a handful of leads a day, so 60/min only ever
    -- catches a runaway integration loop.
    IF NOT public.bump_rate_counter('src:' || v_source_id::text, 60) THEN
      v_admit := false;
    END IF;
  END IF;

  -- Housekeeping on roughly 1% of calls. No cron job, no unbounded growth, and
  -- vercel.json's `crons` array stays empty until Phase 4.
  IF random() < 0.01 THEN
    DELETE FROM public.ingest_rate_counters
    WHERE window_start < now() - interval '2 hours';
  END IF;

  RETURN QUERY SELECT
    v_customer_id,
    v_source_id,
    v_state,
    v_admit,
    CASE WHEN v_admit THEN NULL::integer ELSE v_retry END;
END
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.ingest_admit(text, text) TO resolver_role;
--> statement-breakpoint

-- Allow the application role to assume resolver_role for the duration of the
-- lookup transaction. Without membership, SET ROLE fails with "permission
-- denied to set role". This widens nothing: resolver_role is NOLOGIN and
-- NOBYPASSRLS, so the privileges it can exercise are only those granted above.
GRANT resolver_role TO postgres;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT resolver_role TO service_role';
  END IF;
END
$$;
```

Two notes on the SQL, both load-bearing:

- **`SET search_path = ''` means every reference must be schema-qualified**, which
  is why `public.` appears everywhere. This follows
  `current_ingest_customer_id` (`0001_ingest_role.sql:43`). An unpinned
  `search_path` on a function a public endpoint calls is a privilege-escalation
  vector. `pg_catalog` is always implicitly searched, so `now()`, `random()`, and
  `date_trunc()` still resolve unqualified.
- **`bump_rate_counter` is a separate function** rather than three inline upserts,
  because `INSERT … ON CONFLICT DO UPDATE … RETURNING` is what makes the increment
  and the read atomic. A `SELECT`-then-`UPDATE` pair would let two concurrent
  deliveries each read 59 and both be admitted.

- [ ] **Step 6: Apply it and run the tests**

```bash
npm run db:migrate
npm run test:db
```

Expected: `resolver-role.test.ts` fully green, and the four pre-existing db
suites still green.

If `test:db` reports `permission denied to set role "resolver_role"`, the
migration did not run — check that `_journal.json` has the `idx: 3` entry.

- [ ] **Step 7: Prove the isolation tests still bind**

```bash
npm run test:prove-isolation -w @missed-lead/db
```

Expected: all three phases pass. This is not optional after a migration that adds
a role, a policy, and four grants. `PROJECT.md` records the lesson: a green
security test that cannot detect a breach is false confidence, and this migration
is exactly the kind of change that can quietly loosen one.

- [ ] **Step 8: Fix the README's migration instruction**

In `packages/db/README.md`, replace the `## Migrations` body with:

````markdown
```bash
npm run db:generate -w @missed-lead/db     # from schema changes
```

Then append any raw SQL — roles, grants, functions — to the file it generated.
Drizzle emits `CREATE POLICY` but never `GRANT`, `CREATE ROLE`, or
`CREATE FUNCTION`, so those are always hand-written.

**Do not use `--custom`.** It emits an empty SQL file *and* writes a snapshot
identical to the previous one, so any schema change you made becomes invisible to
the next `generate` — which will then try to create the same table twice. One
generated file per migration, hand-written SQL appended to it, one journal entry.

`migrations/meta/_journal.json` and the snapshots are generated. Never hand-edit
them: `migrate` reads the journal, so a hand-written file with no entry never
runs, and `generate` diffs the snapshot to produce the next migration.

Migrations run against `DATABASE_URL_DIRECT`; DDL needs session state a
transaction pooler will not hold.
````

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/schema/rateCounters.ts packages/db/src/schema/leads.ts \
       packages/db/src/schema/index.ts packages/db/migrations/0003_webhook_ingest.sql \
       packages/db/migrations/meta/_journal.json \
       packages/db/migrations/meta/0003_snapshot.json \
       packages/db/src/__tests__/resolver-role.test.ts packages/db/README.md
git commit -m "$(cat <<'EOF'
feat(db): resolver_role and ingest_admit for the pre-tenant lookup

Token resolution cannot run inside withIngestScope: the lead_sources policy
filters on the customer_id the lookup is trying to produce. Running it as
`postgres` would work, but ENABLE ROW LEVEL SECURITY exempts the table owner, so
a bug on the pre-tenant path could read any table in the schema.

So a second NOBYPASSRLS role that reaches lead_sources and the rate counters and
nothing else, and one SECURITY INVOKER function holding the whole pre-tenant
surface. INVOKER is the point: a DEFINER function owned by postgres would run
with the owner's privileges and make the grant list decorative. Most of
resolver-role.test.ts asserts what the role cannot do, plus prosecdef = false.

Rate limits live in a Postgres table -- no new vendor, survives cold starts, and
the counters are the instrument for tuning the limits later. They are charged
whether or not the request is admitted, and commit with the lookup transaction
rather than the ingest write: sharing the ingest transaction would let a retry
storm whose deliveries all deduped roll back its own counters, making abuse free.

ingest_rate_counters is the one table here with no tenantPolicy. The buckets that
matter are charged before a token resolves, so a customer_id would be null
exactly when it is needed. RLS is on; authenticated and anon get nothing.

Also corrects the README: --custom emits an empty file AND a snapshot identical
to the previous one, so schema changes made alongside it go missing from the next
generate.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The sources repository

Everything the provisioning API and the public endpoint need from the database,
in one module. Task 3 built the SQL; this is the typed surface over it.

**Files:**
- Create: `packages/db/src/repo/sources.ts`
- Create: `packages/db/src/__tests__/sources.test.ts`
- Modify: `packages/db/src/repo/index.ts` (one export line)

**Interfaces:**
- Consumes, from Task 3: `ingestRateCounters`, `leadSources.tokenRotatedAt`,
  `public.ingest_admit(text, text)`. From Phase 1: `withIngestScope`,
  `leadEvents`, `leads` (`packages/db/src/repo/ingest.ts`,
  `packages/db/src/schema/leads.ts`).
- Produces, relied on by Tasks 5 and 6:
  ```ts
  export type TokenState = 'current' | 'previous' | 'unknown';

  export interface AdmitResult {
    customerId: string | null;
    sourceId: string | null;
    tokenState: TokenState;
    admit: boolean;
    retryAfter: number | null;
  }

  export function generateWebhookToken(): string;
  export function admitWebhookDelivery(db: Db, token: string, ip: string | null): Promise<AdmitResult>;

  export interface SourceStatus {
    id: string;
    label: string;
    kind: 'webhook' | 'email' | 'csv';
    webhookToken: string | null;
    createdAt: Date;
    revokedAt: Date | null;
    lastEventAt: Date | null;
    eventCount: number;
    leadCount: number;
    previousTokenInUse: boolean;
    lastParseWarningAt: Date | null;
  }

  export function createWebhookSource(db: Db, customerId: string, label: string): Promise<SourceStatus>;
  export function rotateWebhookToken(db: Db, customerId: string, sourceId: string): Promise<SourceStatus | null>;
  export function revokeSource(db: Db, customerId: string, sourceId: string): Promise<boolean>;
  export function listSources(db: Db, customerId: string): Promise<SourceStatus[]>;
  export function getSource(db: Db, customerId: string, sourceId: string): Promise<SourceStatus | null>;
  export function findExistingEvent(tx: Tx, customerId: string, dedupeKey: string): Promise<boolean>;
  export const PREVIOUS_TOKEN_EVENT = 'webhook.previous_token_used';
  ```
  `rotateWebhookToken` and `getSource` return `null` when the id belongs to
  another tenant or does not exist — the two cases are indistinguishable by
  construction, so a handler cannot accidentally turn one into a 403.
  `revokeSource` returns `false` in the same situation.

- [ ] **Step 1: Write the failing test**

Create `packages/db/src/__tests__/sources.test.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../client';
import { buildDedupeKey, recordLeadEvent, upsertLead, withIngestScope } from '../repo/ingest';
import {
  admitWebhookDelivery,
  createWebhookSource,
  generateWebhookToken,
  getSource,
  listSources,
  PREVIOUS_TOKEN_EVENT,
  revokeSource,
  rotateWebhookToken,
} from '../repo/sources';

/**
 * Source provisioning and admission. Requires `npx supabase start`.
 *
 * Tenant scoping on this path is application code, not RLS: these functions run
 * as `postgres`, which owns the tables and is exempt from ENABLE ROW LEVEL
 * SECURITY. So "another tenant's id returns null" is an assertion about the
 * `where customer_id = ...` clause, and it is the only thing standing between two
 * tenants here. Hence a cross-tenant case for every function.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const DB_URL =
  process.env.DATABASE_URL_DIRECT ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RUN = Date.now().toString(36);
const userIds: string[] = [];
let db: Db;
let raw: ReturnType<typeof createDb>['sql'];
let customerId: string;
let otherCustomerId: string;

async function seedCustomer(slug: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${slug}-${RUN}@sources.test`,
    password: 'test-password-1234',
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);
  const [row] = await raw<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${data.user.id}, ${`${slug} Salon`}) returning id
  `;
  return row!.id;
}

beforeAll(async () => {
  const created = createDb(DB_URL);
  db = created.db;
  raw = created.sql;
  customerId = await seedCustomer('owner');
  otherCustomerId = await seedCustomer('rival');
}, 60_000);

afterAll(async () => {
  for (const id of [customerId, otherCustomerId].filter(Boolean)) {
    await raw`delete from customers where id = ${id}`;
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await raw?.end();
});

describe('generateWebhookToken', () => {
  it('is 43 url-safe characters from 32 random bytes', () => {
    const token = generateWebhookToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 500 }, generateWebhookToken));
    expect(tokens.size).toBe(500);
  });
});

describe('createWebhookSource', () => {
  it('returns a source with a live token and empty counters', async () => {
    const source = await createWebhookSource(db, customerId, 'Website form');
    expect(source.label).toBe('Website form');
    expect(source.kind).toBe('webhook');
    expect(source.webhookToken).toHaveLength(43);
    expect(source.revokedAt).toBeNull();
    expect(source.eventCount).toBe(0);
    expect(source.leadCount).toBe(0);
    expect(source.lastEventAt).toBeNull();
    expect(source.previousTokenInUse).toBe(false);
    expect(source.lastParseWarningAt).toBeNull();
  });

  it('stamps the row with the calling tenant, not any other', async () => {
    const source = await createWebhookSource(db, customerId, 'Scoped');
    const [row] = await raw<{ customer_id: string }[]>`
      select customer_id from lead_sources where id = ${source.id}
    `;
    expect(row!.customer_id).toBe(customerId);
  });

  it('lets two tenants each have a source with the same label', async () => {
    const mine = await createWebhookSource(db, customerId, 'Contact form');
    const theirs = await createWebhookSource(db, otherCustomerId, 'Contact form');
    expect(theirs.id).not.toBe(mine.id);
    expect(theirs.webhookToken).not.toBe(mine.webhookToken);
  });
});

describe('rotateWebhookToken', () => {
  it('demotes the current token, issues a new one, and stamps the time', async () => {
    const before = await createWebhookSource(db, customerId, 'Rotating');
    const after = await rotateWebhookToken(db, customerId, before.id);

    expect(after).not.toBeNull();
    expect(after!.webhookToken).toHaveLength(43);
    expect(after!.webhookToken).not.toBe(before.webhookToken);

    const [row] = await raw<{
      webhook_token: string;
      webhook_token_previous: string;
      token_rotated_at: Date | null;
    }[]>`
      select webhook_token, webhook_token_previous, token_rotated_at
      from lead_sources where id = ${before.id}
    `;
    expect(row!.webhook_token).toBe(after!.webhookToken);
    expect(row!.webhook_token_previous).toBe(before.webhookToken);
    expect(row!.token_rotated_at).not.toBeNull();
  });

  it('keeps the old URL working right after a rotation', async () => {
    const before = await createWebhookSource(db, customerId, 'Still working');
    await rotateWebhookToken(db, customerId, before.id);
    const admitted = await admitWebhookDelivery(db, before.webhookToken!, null);
    expect(admitted.tokenState).toBe('previous');
    expect(admitted.customerId).toBe(customerId);
  });

  it('rotating twice inside the window invalidates the original — known limitation', async () => {
    // The column is singular, so the second rotation overwrites the first
    // previous value. Documented rather than engineered around; see the spec.
    const first = await createWebhookSource(db, customerId, 'Double rotate');
    const second = await rotateWebhookToken(db, customerId, first.id);
    await rotateWebhookToken(db, customerId, first.id);

    expect((await admitWebhookDelivery(db, first.webhookToken!, null)).tokenState).toBe('unknown');
    expect((await admitWebhookDelivery(db, second!.webhookToken!, null)).tokenState).toBe('previous');
  });

  it('returns null for another tenant\'s source id and changes nothing', async () => {
    const mine = await createWebhookSource(db, customerId, 'Not yours');
    const result = await rotateWebhookToken(db, otherCustomerId, mine.id);
    expect(result).toBeNull();

    const [row] = await raw<{ webhook_token: string }[]>`
      select webhook_token from lead_sources where id = ${mine.id}
    `;
    expect(row!.webhook_token).toBe(mine.webhookToken);
  });

  it('returns null for an id that does not exist', async () => {
    const result = await rotateWebhookToken(
      db,
      customerId,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(result).toBeNull();
  });
});

describe('revokeSource', () => {
  it('nulls both token columns so the secret ceases to exist', async () => {
    const source = await createWebhookSource(db, customerId, 'To revoke');
    await rotateWebhookToken(db, customerId, source.id);
    expect(await revokeSource(db, customerId, source.id)).toBe(true);

    const [row] = await raw<{
      webhook_token: string | null;
      webhook_token_previous: string | null;
      revoked_at: Date | null;
    }[]>`
      select webhook_token, webhook_token_previous, revoked_at
      from lead_sources where id = ${source.id}
    `;
    // Flagging alone would leave a live secret in the row; a dump would leak it.
    expect(row!.webhook_token).toBeNull();
    expect(row!.webhook_token_previous).toBeNull();
    expect(row!.revoked_at).not.toBeNull();
  });

  it('keeps the row — leads.source_id references it', async () => {
    const source = await createWebhookSource(db, customerId, 'Referenced');
    await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        sourceId: source.id,
        createdAt: new Date(),
        email: `ref-${RUN}@example.com`,
      }),
    );
    await revokeSource(db, customerId, source.id);

    const rows = await raw`select 1 from lead_sources where id = ${source.id}`;
    expect(rows).toHaveLength(1);
  });

  it('makes the token stop resolving', async () => {
    const source = await createWebhookSource(db, customerId, 'Dead token');
    const token = source.webhookToken!;
    await revokeSource(db, customerId, source.id);
    expect((await admitWebhookDelivery(db, token, null)).tokenState).toBe('unknown');
  });

  it('returns false for another tenant\'s source and leaves it live', async () => {
    const mine = await createWebhookSource(db, customerId, 'Theirs to keep');
    expect(await revokeSource(db, otherCustomerId, mine.id)).toBe(false);
    const [row] = await raw<{ revoked_at: Date | null }[]>`
      select revoked_at from lead_sources where id = ${mine.id}
    `;
    expect(row!.revoked_at).toBeNull();
  });

  it('is idempotent', async () => {
    const source = await createWebhookSource(db, customerId, 'Twice revoked');
    expect(await revokeSource(db, customerId, source.id)).toBe(true);
    expect(await revokeSource(db, customerId, source.id)).toBe(true);
  });
});

describe('listSources and getSource — the status contract', () => {
  it('counts events and leads for the source, and reports the last event time', async () => {
    const source = await createWebhookSource(db, customerId, 'Counted');

    const lead = await withIngestScope(db, customerId, (tx) =>
      upsertLead(tx, customerId, {
        sourceId: source.id,
        createdAt: new Date(),
        email: `counted-${RUN}@example.com`,
      }),
    );
    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: 'webhook.received',
        dedupeKey: buildDedupeKey({ sourceId: source.id, providerEventId: `e1-${RUN}` }),
        sourceId: source.id,
        leadId: lead.leadId,
      }),
    );

    const status = await getSource(db, customerId, source.id);
    expect(status!.eventCount).toBe(1);
    expect(status!.leadCount).toBe(1);
    expect(status!.lastEventAt).not.toBeNull();
  });

  it('reports previousTokenInUse only inside the current rotation window', async () => {
    const source = await createWebhookSource(db, customerId, 'Old URL live');
    const rotated = await rotateWebhookToken(db, customerId, source.id);
    expect(rotated!.previousTokenInUse).toBe(false);

    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: PREVIOUS_TOKEN_EVENT,
        dedupeKey: buildDedupeKey({ sourceId: source.id, providerEventId: `prev-${RUN}` }),
        sourceId: source.id,
      }),
    );

    // This flag is the alert PITFALLS.md:12 asks for: the owner's form is still
    // posting to a URL that is about to stop working.
    const status = await getSource(db, customerId, source.id);
    expect(status!.previousTokenInUse).toBe(true);
  });

  it('ignores a previous-token event from before the latest rotation', async () => {
    const source = await createWebhookSource(db, customerId, 'Stale alert');
    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: PREVIOUS_TOKEN_EVENT,
        dedupeKey: buildDedupeKey({ sourceId: source.id, providerEventId: `old-${RUN}` }),
        sourceId: source.id,
        occurredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      }),
    );
    const rotated = await rotateWebhookToken(db, customerId, source.id);
    // A hit from a previous rotation cycle must not light the alert forever.
    expect(rotated!.previousTokenInUse).toBe(false);
  });

  it('surfaces the last parse warning time', async () => {
    const source = await createWebhookSource(db, customerId, 'Warned');
    await withIngestScope(db, customerId, (tx) =>
      recordLeadEvent(tx, customerId, {
        kind: 'webhook.received',
        dedupeKey: buildDedupeKey({ sourceId: source.id, providerEventId: `warn-${RUN}` }),
        sourceId: source.id,
        parseWarnings: ['nothing_extracted'],
      }),
    );
    const status = await getSource(db, customerId, source.id);
    expect(status!.lastParseWarningAt).not.toBeNull();
  });

  it('lists only the calling tenant\'s sources', async () => {
    await createWebhookSource(db, otherCustomerId, 'Rival form');
    const mine = await listSources(db, customerId);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.some((s) => s.label === 'Rival form')).toBe(false);

    const [{ count }] = await raw<{ count: string }[]>`
      select count(*)::text as count from lead_sources where customer_id = ${customerId}
    `;
    expect(mine).toHaveLength(Number(count));
  });

  it('includes revoked sources in the list, so an owner can see what happened', async () => {
    const source = await createWebhookSource(db, customerId, 'Visible after revoke');
    await revokeSource(db, customerId, source.id);
    const listed = (await listSources(db, customerId)).find((s) => s.id === source.id);
    expect(listed).toBeDefined();
    expect(listed!.revokedAt).not.toBeNull();
    expect(listed!.webhookToken).toBeNull();
  });

  it('returns null for another tenant\'s source id', async () => {
    const theirs = await createWebhookSource(db, otherCustomerId, 'Private');
    expect(await getSource(db, customerId, theirs.id)).toBeNull();
  });

  it('returns null for an id that does not exist — same shape as not-yours', async () => {
    expect(await getSource(db, customerId, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('counts a source with no activity as zero rather than omitting it', async () => {
    const source = await createWebhookSource(db, customerId, 'Quiet');
    const status = await getSource(db, customerId, source.id);
    // A LEFT JOIN aggregate that drops rows with no events would hide a source
    // an owner has just created and is waiting to see light up.
    expect(status).not.toBeNull();
    expect(status!.eventCount).toBe(0);
    expect(status!.leadCount).toBe(0);
  });
});

describe('admitWebhookDelivery — the typed wrapper', () => {
  it('maps the SQL row onto camelCase and nulls', async () => {
    const source = await createWebhookSource(db, customerId, 'Admitted');
    const result = await admitWebhookDelivery(db, source.webhookToken!, '11.11.11.11');
    expect(result).toEqual({
      customerId,
      sourceId: source.id,
      tokenState: 'current',
      admit: true,
      retryAfter: null,
    });
  });

  it('returns a fully-null result for an unknown token rather than throwing', async () => {
    const result = await admitWebhookDelivery(db, `nope-${RUN}`, '12.12.12.12');
    expect(result.customerId).toBeNull();
    expect(result.sourceId).toBeNull();
    expect(result.tokenState).toBe('unknown');
  });

  it('surfaces retryAfter as a number when over the limit', async () => {
    const source = await createWebhookSource(db, customerId, 'Limited');
    await raw`
      insert into ingest_rate_counters (bucket, window_start, count)
      values (${`src:${source.id}`}, date_trunc('minute', now()), 60)
    `;
    const result = await admitWebhookDelivery(db, source.webhookToken!, null);
    expect(result.admit).toBe(false);
    expect(typeof result.retryAfter).toBe('number');
    expect(result.retryAfter).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run test:db
```

Expected: `sources.test.ts` fails to import — `Cannot find module '../repo/sources'`.

- [ ] **Step 3: Write `packages/db/src/repo/sources.ts`**

```ts
import { randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { leadEvents, leadSources } from '../schema/leads';

/**
 * Webhook source provisioning, token lifecycle, and the pre-tenant admission
 * wrapper.
 *
 * Token generation lives here rather than in `packages/core` for the same reason
 * `buildDedupeKey` does: it needs `node:crypto`, and core stays
 * dependency-free. That keeps this package Node-only — never import it into a
 * browser bundle.
 *
 * IMPORTANT — tenant scoping on this path is application code, not RLS. These
 * functions run as `postgres`, which owns the tables, and
 * `ENABLE ROW LEVEL SECURITY` exempts the owner. Every query below therefore
 * carries an explicit `customer_id = ...`, exactly as `api/me.ts:22` does. The
 * database is not enforcing it here; the `where` clause is.
 */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** `lead_events.kind` written on a delivery that used the demoted token. */
export const PREVIOUS_TOKEN_EVENT = 'webhook.previous_token_used';

export type TokenState = 'current' | 'previous' | 'unknown';

export interface AdmitResult {
  customerId: string | null;
  sourceId: string | null;
  tokenState: TokenState;
  admit: boolean;
  /** Seconds. Null unless `admit` is false. */
  retryAfter: number | null;
}

/**
 * 32 random bytes, base64url — 43 characters, url-safe with no padding.
 *
 * Stored in plaintext. The honest cost is that a database dump leaks live hook
 * URLs; accepted because the URL must be displayed back to the owner and a hash
 * cannot be, and because the worst outcome from a leaked hook URL is injected
 * junk leads, recoverable by one rotation.
 */
export function generateWebhookToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Resolve a token and charge the rate counters, in one round trip.
 *
 * Runs as `resolver_role` inside its own transaction, which commits *before* the
 * ingest write. That separation is deliberate: if the counters shared the ingest
 * transaction, a retry storm whose deliveries all deduped would roll its own
 * counters back and abuse would be free.
 */
export async function admitWebhookDelivery(
  db: Db,
  token: string,
  ip: string | null,
): Promise<AdmitResult> {
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`set local role resolver_role`);
    return tx.execute<{
      customer_id: string | null;
      source_id: string | null;
      token_state: TokenState;
      admit: boolean;
      retry_after: number | null;
    }>(sql`select * from public.ingest_admit(${token}, ${ip})`);
  });

  const row = rows[0];
  // A set-returning plpgsql function always yields exactly one row here, but a
  // missing row must not become a silent admit.
  if (!row) {
    return { customerId: null, sourceId: null, tokenState: 'unknown', admit: false, retryAfter: 1 };
  }
  return {
    customerId: row.customer_id,
    sourceId: row.source_id,
    tokenState: row.token_state,
    admit: row.admit,
    retryAfter: row.retry_after,
  };
}

export interface SourceStatus {
  id: string;
  label: string;
  kind: 'webhook' | 'email' | 'csv';
  /** Null once revoked. Returned in full otherwise — it is a URL the owner must
   *  copy, not a password. */
  webhookToken: string | null;
  createdAt: Date;
  revokedAt: Date | null;
  lastEventAt: Date | null;
  eventCount: number;
  leadCount: number;
  /** True when the demoted token has been used since the latest rotation. */
  previousTokenInUse: boolean;
  lastParseWarningAt: Date | null;
}

/**
 * Shape of one status row as Postgres returns it.
 *
 * A `type` alias, not an `interface`: `db.execute<T>` constrains `T` to
 * `Record<string, unknown>`, and an interface has no implicit index signature,
 * so an interface here fails with TS2344.
 */
type StatusRow = {
  id: string;
  label: string;
  kind: 'webhook' | 'email' | 'csv';
  webhook_token: string | null;
  created_at: Date;
  revoked_at: Date | null;
  last_event_at: Date | null;
  event_count: string;
  lead_count: string;
  previous_token_in_use: boolean;
  last_parse_warning_at: Date | null;
};

/**
 * One row per source with its live counts.
 *
 * Scalar subqueries rather than joins plus GROUP BY: joining lead_events and
 * leads at once multiplies their rows together, which would report an event
 * count of 12 as 108 the moment a source has both. Each subquery is independent
 * and indexed on `(customer_id, ...)`.
 *
 * `count(*)` comes back as a bigint, which postgres.js hands over as a string —
 * hence the `Number()` in the mapper. Left as-is, `eventCount` would serialize
 * as "12" and the connection card would compare a string to a number.
 */
function statusSelect(customerId: string, sourceId?: string) {
  return sql`
    select
      s.id,
      s.label,
      s.kind,
      s.webhook_token,
      s.created_at,
      s.revoked_at,
      (select max(e.occurred_at) from public.lead_events e
         where e.customer_id = ${customerId} and e.source_id = s.id) as last_event_at,
      (select count(*) from public.lead_events e
         where e.customer_id = ${customerId} and e.source_id = s.id) as event_count,
      (select count(*) from public.leads l
         where l.customer_id = ${customerId} and l.source_id = s.id) as lead_count,
      exists (
        select 1 from public.lead_events e
        where e.customer_id = ${customerId}
          and e.source_id = s.id
          and e.kind = ${PREVIOUS_TOKEN_EVENT}
          -- Only since the latest rotation. Without this bound, one hit would
          -- light the "your old URL is still in use" alert permanently.
          and s.token_rotated_at is not null
          and e.occurred_at >= s.token_rotated_at
      ) as previous_token_in_use,
      (select max(e.occurred_at) from public.lead_events e
         where e.customer_id = ${customerId}
           and e.source_id = s.id
           and jsonb_array_length(e.parse_warnings) > 0) as last_parse_warning_at
    from public.lead_sources s
    where s.customer_id = ${customerId}
      ${sourceId ? sql`and s.id = ${sourceId}` : sql``}
    order by s.created_at desc
  `;
}

function toStatus(row: StatusRow): SourceStatus {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    webhookToken: row.webhook_token,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    lastEventAt: row.last_event_at,
    eventCount: Number(row.event_count),
    leadCount: Number(row.lead_count),
    previousTokenInUse: row.previous_token_in_use,
    lastParseWarningAt: row.last_parse_warning_at,
  };
}

export async function listSources(db: Db, customerId: string): Promise<SourceStatus[]> {
  const rows = await db.execute<StatusRow>(statusSelect(customerId));
  return rows.map(toStatus);
}

/**
 * One source, or null when the id is not this tenant's.
 *
 * Null covers both "does not exist" and "belongs to someone else", and the
 * caller cannot tell them apart — which is the point. `response.ts:14`: "not
 * found" and "not yours" must be indistinguishable, or the API is an enumeration
 * oracle.
 */
export async function getSource(
  db: Db,
  customerId: string,
  sourceId: string,
): Promise<SourceStatus | null> {
  const rows = await db.execute<StatusRow>(statusSelect(customerId, sourceId));
  const row = rows[0];
  return row ? toStatus(row) : null;
}

export async function createWebhookSource(
  db: Db,
  customerId: string,
  label: string,
): Promise<SourceStatus> {
  const [created] = await db
    .insert(leadSources)
    .values({ customerId, kind: 'webhook', label, webhookToken: generateWebhookToken() })
    .returning({ id: leadSources.id });

  // Read back through the same path a GET uses, so create and get can never
  // disagree about the shape they return.
  const status = await getSource(db, customerId, created!.id);
  return status!;
}

/**
 * Rotate: current token becomes previous, a new one is issued, and the moment is
 * stamped.
 *
 * The 72-hour overlap is enforced at lookup time in `ingest_admit` rather than by
 * a sweep, so there is nothing to schedule and nothing to forget.
 *
 * Known limitation, documented rather than engineered around: the previous
 * column is singular, so rotating twice inside 72 hours invalidates the original
 * token immediately.
 */
export async function rotateWebhookToken(
  db: Db,
  customerId: string,
  sourceId: string,
): Promise<SourceStatus | null> {
  const updated = await db
    .update(leadSources)
    .set({
      webhookToken: generateWebhookToken(),
      webhookTokenPrevious: sql`${leadSources.webhookToken}`,
      tokenRotatedAt: new Date(),
    })
    .where(
      and(
        eq(leadSources.id, sourceId),
        eq(leadSources.customerId, customerId),
        isNull(leadSources.revokedAt),
      ),
    )
    .returning({ id: leadSources.id });

  if (!updated[0]) return null;
  return getSource(db, customerId, sourceId);
}

/**
 * Revoke: stamp `revoked_at` and null BOTH token columns, so the secret ceases
 * to exist rather than merely being flagged.
 *
 * Never a hard delete — `leads.source_id` references this row
 * (`schema/leads.ts:72`), and destroying the row would orphan the leads it
 * explains.
 */
export async function revokeSource(
  db: Db,
  customerId: string,
  sourceId: string,
): Promise<boolean> {
  const updated = await db
    .update(leadSources)
    .set({ revokedAt: new Date(), webhookToken: null, webhookTokenPrevious: null })
    .where(and(eq(leadSources.id, sourceId), eq(leadSources.customerId, customerId)))
    .returning({ id: leadSources.id });
  return updated.length > 0;
}

/**
 * Has this exact delivery already been recorded?
 *
 * A cheap read that short-circuits the common retry case before any write, so a
 * redelivery never reaches the rollback path. Takes a `Tx` because it runs
 * inside the ingest transaction as `ingest_role`, which holds SELECT on
 * lead_events.
 */
export async function findExistingEvent(
  tx: Tx,
  customerId: string,
  dedupeKey: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: leadEvents.id })
    .from(leadEvents)
    .where(and(eq(leadEvents.customerId, customerId), eq(leadEvents.dedupeKey, dedupeKey)))
    .limit(1);
  return rows.length > 0;
}
```

Add to `packages/db/src/repo/index.ts`:

```ts
export * from './sources';
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:db
npm run typecheck
```

Expected: `sources.test.ts` green, the five other db suites still green,
typecheck exit 0.

Two failure modes worth naming, because both look like a test bug and are not:

- **`eventCount` is `"1"` instead of `1`.** `count(*)` is a bigint and postgres.js
  returns it as a string. That is what the `Number()` in `toStatus` is for.
- **Counts multiply once a source has both events and leads.** That means the
  scalar subqueries were rewritten as joins. Put them back.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repo/sources.ts packages/db/src/repo/index.ts \
       packages/db/src/__tests__/sources.test.ts
git commit -m "$(cat <<'EOF'
feat(db): source provisioning, token rotation, and the admit wrapper

Tenant scoping on this path is application code, not RLS: these functions run as
`postgres`, which owns the tables and is exempt from ENABLE ROW LEVEL SECURITY.
So every query carries an explicit customer_id, and every function has a
cross-tenant test -- that `where` clause is the only thing between two tenants
here.

Not-yours and not-found both return null. A caller cannot distinguish them, so a
handler cannot accidentally turn one into a 403 and hand out an enumeration
oracle.

Revoke nulls both token columns rather than only stamping revoked_at, so the
secret ceases to exist instead of being flagged while still sitting in the row.
The row itself stays -- leads.source_id references it.

Status counts use scalar subqueries, not joins: joining lead_events and leads at
once multiplies their rows, which would report 12 events as 108 the moment a
source has both.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The public ingest endpoint

**Files:**
- Create: `api/_lib/ingest.ts`
- Create: `api/hook/[token].ts`
- Create: `api/__tests__/hook.test.ts`

**Interfaces:**
- Consumes: `extractLead`, `isEmptyExtraction`, `ExtractedLead` (Task 1);
  `admitWebhookDelivery`, `findExistingEvent`, `PREVIOUS_TOKEN_EVENT` (Task 4);
  `withIngestScope`, `buildDedupeKey`, `upsertLead`, `recordLeadEvent` (Phase 1);
  `json`, `problem`, `methodNotAllowed` (`api/_lib/response.ts`); `db`
  (`api/_lib/db.ts`).
- Produces, relied on by Phase 3's email path:
  ```ts
  export type IngestOutcome =
    | { kind: 'created'; leadId: string }
    | { kind: 'deduped' }
    | { kind: 'unparsed' };

  export function clientIp(req: Request): string | null;
  export function parseBody(req: Request): Promise<{ ok: true; payload: unknown } | { ok: false }>;
  export function ingestDelivery(input: {
    customerId: string;
    sourceId: string;
    payload: unknown;
    tokenState: TokenState;
    now?: Date;
  }): Promise<IngestOutcome>;
  ```

- [ ] **Step 1: Write the failing test**

Create `api/__tests__/hook.test.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The public ingest endpoint, end to end. Requires `npx supabase start`.
 *
 * Handlers are invoked directly with real `Request` objects rather than through
 * `vercel dev`, following api/__tests__/endpoints.test.ts, so this runs in CI
 * without the Vercel runtime. The token is read from the URL path, which is what
 * Vercel's [token] segment resolves to — so a direct invocation and a real
 * deployment take the same code path.
 */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB_URL = process.env.DATABASE_URL_DIRECT!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(DB_URL, { prepare: false, max: 2 });
const RUN = Date.now().toString(36);

/** Imported lazily so env vars are set before module init. */
let hookHandler: (req: Request) => Promise<Response>;

const userIds: string[] = [];
let customerId: string;
let otherCustomerId: string;
let sourceId: string;
let token: string;

async function seedTenant(slug: string): Promise<{ customerId: string; sourceId: string; token: string }> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${slug}-${RUN}@hook.test`,
    password: 'test-password-1234',
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);

  const [customer] = await sql<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${data.user.id}, ${`${slug} Salon`}) returning id
  `;
  const tok = `hooktok-${slug}-${RUN}`;
  const [source] = await sql<{ id: string }[]>`
    insert into lead_sources (customer_id, kind, label, webhook_token)
    values (${customer!.id}, 'webhook', 'Website form', ${tok}) returning id
  `;
  return { customerId: customer!.id, sourceId: source!.id, token: tok };
}

beforeAll(async () => {
  ({ default: hookHandler } = await import('../hook/[token]'));
  const mine = await seedTenant('owner');
  customerId = mine.customerId;
  sourceId = mine.sourceId;
  token = mine.token;
  ({ customerId: otherCustomerId } = await seedTenant('rival'));
}, 60_000);

afterAll(async () => {
  for (const id of [customerId, otherCustomerId].filter(Boolean)) {
    await sql`delete from customers where id = ${id}`;
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await sql`delete from ingest_rate_counters where bucket like ${`%${RUN}%`}`;
  await sql.end();
});

/** A POST shaped the way a form tool sends one. */
function post(
  tok: string,
  body: unknown,
  init: { contentType?: string; ip?: string; raw?: string } = {},
): Request {
  const headers: Record<string, string> = {
    'content-type': init.contentType ?? 'application/json',
  };
  if (init.ip) headers['x-forwarded-for'] = init.ip;
  return new Request(`https://example.test/api/hook/${tok}`, {
    method: 'POST',
    headers,
    body: init.raw ?? JSON.stringify(body),
  });
}

const typeform = (eventId: string) => ({
  event_id: eventId,
  form_response: {
    submitted_at: new Date().toISOString(),
    answers: [
      { field: { ref: 'full_name' }, type: 'text', text: 'Priya Raman' },
      { field: { ref: 'email' }, type: 'email', email: `priya-${eventId}@example.com` },
      { field: { ref: 'phone' }, type: 'phone_number', phone_number: '+1 (555) 010-2030' },
      { field: { ref: 'message' }, type: 'text', text: 'Balayage on Friday?' },
    ],
  },
});

describe('POST /api/hook/[token] — the happy path', () => {
  it('creates a lead from a Typeform-shaped payload', async () => {
    const res = await hookHandler(post(token, typeform(`evt-${RUN}-1`), { ip: '20.0.0.1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, deduped: false });

    const [lead] = await sql<{
      customer_name: string;
      email: string;
      phone: string;
      notes: string;
      source_id: string;
      status: string;
      estimated_value: number;
    }[]>`
      select customer_name, email, phone, notes, source_id, status, estimated_value
      from leads where customer_id = ${customerId} and email = ${`priya-evt-${RUN}-1@example.com`}
    `;
    expect(lead!.customer_name).toBe('Priya Raman');
    expect(lead!.phone).toBe('5550102030');
    expect(lead!.notes).toBe('Balayage on Friday?');
    expect(lead!.source_id).toBe(sourceId);
    expect(lead!.status).toBe('new');
    // estimatedValue is never extracted from a payload — the column default
    // stands, because guessing a dollar figure writes into the headline number.
    expect(lead!.estimated_value).toBe(25000);
  });

  it('stores the raw payload on the event, always', async () => {
    const payload = typeform(`evt-${RUN}-raw`);
    await hookHandler(post(token, payload, { ip: '20.0.0.2' }));
    const [event] = await sql<{ raw_payload: unknown; kind: string; lead_id: string | null }[]>`
      select raw_payload, kind, lead_id from lead_events
      where customer_id = ${customerId} and raw_payload->>'event_id' = ${`evt-${RUN}-raw`}
    `;
    // An owner debugging a misconfigured form needs to see what we received.
    expect(event!.raw_payload).toEqual(payload);
    expect(event!.lead_id).not.toBeNull();
  });

  it('writes the lead before the event, carrying the lead id', async () => {
    // ingest_role has no UPDATE on lead_events (0001_ingest_role.sql:81), so an
    // event cannot be inserted first and backfilled. The order is fixed.
    await hookHandler(post(token, typeform(`evt-${RUN}-order`), { ip: '20.0.0.3' }));
    const [row] = await sql<{ lead_id: string | null }[]>`
      select lead_id from lead_events
      where customer_id = ${customerId} and raw_payload->>'event_id' = ${`evt-${RUN}-order`}
    `;
    expect(row!.lead_id).not.toBeNull();
  });

  it('uses the payload timestamp when it is inside the trust window', async () => {
    const when = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await hookHandler(
      post(
        token,
        { id: `ts-${RUN}`, email: `ts-${RUN}@example.com`, submitted_at: when },
        { ip: '20.0.0.4' },
      ),
    );
    const [lead] = await sql<{ created_at: Date }[]>`
      select created_at from leads where email = ${`ts-${RUN}@example.com`}
    `;
    expect(lead!.created_at.toISOString()).toBe(when);
  });

  it('falls back to receipt time and warns when the timestamp is out of window', async () => {
    // leads.created_at drives every leak rule. An epoch-seconds value read as
    // milliseconds lands in 1970, making the lead instantly and maximally leaked.
    await hookHandler(
      post(
        token,
        { id: `epoch-${RUN}`, email: `epoch-${RUN}@example.com`, created_at: 1787000000 },
        { ip: '20.0.0.5' },
      ),
    );
    const [lead] = await sql<{ created_at: Date }[]>`
      select created_at from leads where email = ${`epoch-${RUN}@example.com`}
    `;
    expect(lead!.created_at.getUTCFullYear()).toBeGreaterThan(2020);

    const [event] = await sql<{ parse_warnings: string[] }[]>`
      select parse_warnings from lead_events
      where customer_id = ${customerId} and raw_payload->>'id' = ${`epoch-${RUN}`}
    `;
    expect(event!.parse_warnings).toContain('timestamp_out_of_window');
  });
});

describe('POST /api/hook/[token] — idempotency', () => {
  it('an identical redelivery returns deduped and writes nothing new', async () => {
    const payload = typeform(`evt-${RUN}-retry`);
    const first = await hookHandler(post(token, payload, { ip: '21.0.0.1' }));
    await expect(first.json()).resolves.toEqual({ ok: true, deduped: false });

    const second = await hookHandler(post(token, payload, { ip: '21.0.0.1' }));
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ ok: true, deduped: true });

    const [{ count }] = await sql<{ count: string }[]>`
      select count(*)::text as count from lead_events
      where customer_id = ${customerId} and raw_payload->>'event_id' = ${`evt-${RUN}-retry`}
    `;
    expect(count).toBe('1');
    const [leads] = await sql<{ count: string }[]>`
      select count(*)::text as count from leads
      where customer_id = ${customerId} and email = ${`priya-evt-${RUN}-retry@example.com`}
    `;
    expect(leads!.count).toBe('1');
  });

  it('dedupes on the payload hash when the provider sends no event id', async () => {
    const payload = { name: 'No Id Nancy', email: `noid-${RUN}@example.com` };
    await hookHandler(post(token, payload, { ip: '21.0.0.2' }));
    const again = await hookHandler(post(token, payload, { ip: '21.0.0.2' }));
    await expect(again.json()).resolves.toEqual({ ok: true, deduped: true });
  });

  it('key order in the payload does not defeat dedupe', async () => {
    const email = `order-${RUN}@example.com`;
    await hookHandler(post(token, { name: 'Ordered', email }, { ip: '21.0.0.3' }));
    const reordered = await hookHandler(post(token, { email, name: 'Ordered' }, { ip: '21.0.0.3' }));
    // buildDedupeKey canonicalizes, so re-serialization by a proxy is not a new
    // delivery.
    await expect(reordered.json()).resolves.toEqual({ ok: true, deduped: true });
  });

  it('the same payload to two tenants is two leads, not a dedupe', async () => {
    const theirs = await seedTenant('third');
    const payload = { id: `shared-${RUN}`, email: `shared-${RUN}@example.com`, name: 'Shared' };
    await hookHandler(post(token, payload, { ip: '21.0.0.4' }));
    const other = await hookHandler(post(theirs.token, payload, { ip: '21.0.0.4' }));
    await expect(other.json()).resolves.toEqual({ ok: true, deduped: false });
    await sql`delete from customers where id = ${theirs.customerId}`;
  });
});

describe('POST /api/hook/[token] — rejection', () => {
  it('404s an unknown token', async () => {
    const res = await hookHandler(post(`no-such-${RUN}`, { email: 'x@example.com' }, { ip: '22.0.0.1' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('404s a revoked token and writes no event', async () => {
    const seeded = await seedTenant('revoked');
    await sql`
      update lead_sources set revoked_at = now(), webhook_token = null
      where id = ${seeded.sourceId}
    `;
    const res = await hookHandler(post(seeded.token, { email: 'x@example.com' }, { ip: '22.0.0.2' }));
    expect(res.status).toBe(404);
    const events = await sql`select 1 from lead_events where customer_id = ${seeded.customerId}`;
    expect(events).toHaveLength(0);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('404s an expired previous token', async () => {
    const seeded = await seedTenant('expired');
    await sql`
      update lead_sources
      set webhook_token = ${`${seeded.token}-new`},
          webhook_token_previous = ${seeded.token},
          token_rotated_at = now() - interval '73 hours'
      where id = ${seeded.sourceId}
    `;
    const res = await hookHandler(post(seeded.token, { email: 'x@example.com' }, { ip: '22.0.0.3' }));
    expect(res.status).toBe(404);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('never echoes the token back in an error body', async () => {
    const guess = `guessed-${RUN}`;
    const res = await hookHandler(post(guess, { email: 'x@example.com' }, { ip: '22.0.0.4' }));
    const body = await res.text();
    expect(body).not.toContain(guess);
  });

  it('405s a GET with an Allow header', async () => {
    const res = await hookHandler(new Request(`https://example.test/api/hook/${token}`));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('400s an unparseable JSON body and writes no event', async () => {
    const before = await sql<{ count: string }[]>`
      select count(*)::text as count from lead_events where customer_id = ${customerId}
    `;
    const res = await hookHandler(post(token, null, { ip: '22.0.0.5', raw: '{"name": ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_body');

    // A body we cannot parse has no dedupe key, so a malformed-body loop would
    // fill the audit log with unbounded rows.
    const after = await sql<{ count: string }[]>`
      select count(*)::text as count from lead_events where customer_id = ${customerId}
    `;
    expect(after[0]!.count).toBe(before[0]!.count);
  });

  it('400s an unsupported content type', async () => {
    const res = await hookHandler(
      post(token, null, { ip: '22.0.0.6', contentType: 'application/xml', raw: '<lead/>' }),
    );
    expect(res.status).toBe(400);
  });

  it('a 400 still consumes rate quota — admit happens before the body is read', async () => {
    // Otherwise a flood of malformed bodies is unlimited.
    const seeded = await seedTenant('malformed-quota');
    await hookHandler(post(seeded.token, null, { ip: '22.0.0.7', raw: 'not json' }));
    const [row] = await sql<{ count: number }[]>`
      select count from ingest_rate_counters
      where bucket = ${`src:${seeded.sourceId}`} and window_start = date_trunc('minute', now())
    `;
    expect(row!.count).toBe(1);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('429s with retry-after once over the per-source limit', async () => {
    const seeded = await seedTenant('rate-limited');
    await sql`
      insert into ingest_rate_counters (bucket, window_start, count)
      values (${`src:${seeded.sourceId}`}, date_trunc('minute', now()), 60)
    `;
    const res = await hookHandler(
      post(seeded.token, { email: `rl-${RUN}@example.com` }, { ip: '22.0.0.8' }),
    );
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('rate_limited');
    const retryAfter = Number(res.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);

    // A spam flood must not become an audit-log flood.
    const events = await sql`select 1 from lead_events where customer_id = ${seeded.customerId}`;
    expect(events).toHaveLength(0);
    await sql`delete from customers where id = ${seeded.customerId}`;
  });
});

describe('POST /api/hook/[token] — form-encoded bodies', () => {
  it('accepts application/x-www-form-urlencoded flattened to one level', async () => {
    // Several form tools post this by default. Rejecting them would fail in the
    // field for a reason the owner could never diagnose.
    const res = await hookHandler(
      post(token, null, {
        ip: '23.0.0.1',
        contentType: 'application/x-www-form-urlencoded',
        raw: new URLSearchParams({
          name: 'Form Encoded Fran',
          email: `fran-${RUN}@example.com`,
          phone: '(555) 246-8100',
          message: 'Sent as a form post',
        }).toString(),
      }),
    );
    expect(res.status).toBe(200);
    const [lead] = await sql<{ customer_name: string; phone: string; notes: string }[]>`
      select customer_name, phone, notes from leads where email = ${`fran-${RUN}@example.com`}
    `;
    expect(lead!.customer_name).toBe('Form Encoded Fran');
    expect(lead!.phone).toBe('5552468100');
    expect(lead!.notes).toBe('Sent as a form post');
  });

  it('accepts a charset parameter on the content type', async () => {
    const res = await hookHandler(
      post(token, null, {
        ip: '23.0.0.2',
        contentType: 'application/json; charset=utf-8',
        raw: JSON.stringify({ email: `charset-${RUN}@example.com` }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('400s an empty form body', async () => {
    const res = await hookHandler(
      post(token, null, {
        ip: '23.0.0.3',
        contentType: 'application/x-www-form-urlencoded',
        raw: '',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/hook/[token] — nothing usable in the payload', () => {
  it('stores the event with a warning and no lead, and still returns 200', async () => {
    const res = await hookHandler(post(token, { hello: 'world' }, { ip: '24.0.0.1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, parsed: false });

    const [event] = await sql<{ parse_warnings: string[]; lead_id: string | null }[]>`
      select parse_warnings, lead_id from lead_events
      where customer_id = ${customerId} and raw_payload->>'hello' = 'world'
    `;
    // Never a rejection: an owner debugging a misconfigured form needs to see
    // that something arrived.
    expect(event!.parse_warnings).toContain('nothing_extracted');
    expect(event!.lead_id).toBeNull();
  });

  it('refuses the business\'s own address and creates no lead from it', async () => {
    const res = await hookHandler(
      post(
        token,
        { id: `biz-${RUN}`, from: 'hello@sunsetsalon.com', subject: 'New website enquiry' },
        { ip: '24.0.0.2' },
      ),
    );
    await expect(res.json()).resolves.toEqual({ ok: true, parsed: false });

    // The corruption this prevents: that address is identical on every
    // submission, so one identity row would swallow the whole dataset.
    const identities = await sql`
      select 1 from lead_identities
      where customer_id = ${customerId} and value_normalized = 'hello@sunsetsalon.com'
    `;
    expect(identities).toHaveLength(0);
  });

  it('records a phone-refused warning without blocking a lead that has a name', async () => {
    const res = await hookHandler(
      post(
        token,
        { id: `ref-${RUN}`, name: 'Reference Rita', reference: '4155550199' },
        { ip: '24.0.0.3' },
      ),
    );
    await expect(res.json()).resolves.toEqual({ ok: true, deduped: false });

    const [lead] = await sql<{ phone: string | null }[]>`
      select phone from leads where customer_id = ${customerId} and customer_name = 'Reference Rita'
    `;
    expect(lead!.phone).toBeNull();

    const [event] = await sql<{ parse_warnings: string[] }[]>`
      select parse_warnings from lead_events
      where customer_id = ${customerId} and raw_payload->>'id' = ${`ref-${RUN}`}
    `;
    expect(event!.parse_warnings).toContain('phone_rejected_unformatted');
  });
});

describe('POST /api/hook/[token] — the rotation overlap', () => {
  it('ingests through a previous token AND records the alert event', async () => {
    const seeded = await seedTenant('rotated');
    await sql`
      update lead_sources
      set webhook_token = ${`${seeded.token}-new`},
          webhook_token_previous = ${seeded.token},
          token_rotated_at = now() - interval '1 hour'
      where id = ${seeded.sourceId}
    `;

    const res = await hookHandler(
      post(seeded.token, { id: `rot-${RUN}`, email: `rot-${RUN}@example.com`, name: 'Rota' }, { ip: '25.0.0.1' }),
    );
    // A rotation must not silently drop real leads.
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, deduped: false });

    const leads = await sql`
      select 1 from leads where customer_id = ${seeded.customerId} and email = ${`rot-${RUN}@example.com`}
    `;
    expect(leads).toHaveLength(1);

    // This event is what lets the status endpoint tell the owner their old URL
    // is still in use — the alert PITFALLS.md:12 asks for.
    const alerts = await sql`
      select 1 from lead_events
      where customer_id = ${seeded.customerId} and kind = 'webhook.previous_token_used'
    `;
    expect(alerts).toHaveLength(1);

    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('records the alert once per delivery, not once per retry', async () => {
    const seeded = await seedTenant('rotated-retry');
    await sql`
      update lead_sources
      set webhook_token = ${`${seeded.token}-new`},
          webhook_token_previous = ${seeded.token},
          token_rotated_at = now() - interval '1 hour'
      where id = ${seeded.sourceId}
    `;
    const payload = { id: `rot2-${RUN}`, email: `rot2-${RUN}@example.com` };
    await hookHandler(post(seeded.token, payload, { ip: '25.0.0.2' }));
    await hookHandler(post(seeded.token, payload, { ip: '25.0.0.2' }));

    const [{ count }] = await sql<{ count: string }[]>`
      select count(*)::text as count from lead_events
      where customer_id = ${seeded.customerId} and kind = 'webhook.previous_token_used'
    `;
    expect(count).toBe('1');
    await sql`delete from customers where id = ${seeded.customerId}`;
  });

  it('writes no alert event on a current token', async () => {
    await hookHandler(post(token, typeform(`evt-${RUN}-noalert`), { ip: '25.0.0.3' }));
    const alerts = await sql`
      select 1 from lead_events
      where customer_id = ${customerId} and kind = 'webhook.previous_token_used'
    `;
    expect(alerts).toHaveLength(0);
  });
});

describe('POST /api/hook/[token] — tenant isolation', () => {
  it('writes into the token\'s tenant and nowhere else', async () => {
    const email = `iso-${RUN}@example.com`;
    await hookHandler(post(token, { id: `iso-${RUN}`, email, name: 'Isolated' }, { ip: '26.0.0.1' }));

    const [row] = await sql<{ customer_id: string }[]>`
      select customer_id from leads where email = ${email}
    `;
    expect(row!.customer_id).toBe(customerId);
    expect(row!.customer_id).not.toBe(otherCustomerId);

    const theirs = await sql`
      select 1 from leads where customer_id = ${otherCustomerId} and email = ${email}
    `;
    expect(theirs).toHaveLength(0);
  });

  it('the same email for two tenants is two different people', async () => {
    const theirs = await seedTenant('fourth');
    const email = `both-${RUN}@example.com`;
    await hookHandler(post(token, { id: `b1-${RUN}`, email }, { ip: '26.0.0.2' }));
    await hookHandler(post(theirs.token, { id: `b2-${RUN}`, email }, { ip: '26.0.0.2' }));

    const rows = await sql<{ customer_id: string }[]>`
      select customer_id from leads where email = ${email} order by customer_id
    `;
    expect(rows).toHaveLength(2);
    await sql`delete from customers where id = ${theirs.customerId}`;
  });

  it('THE DOUBLE-COUNT GUARD: the same person twice is one lead', async () => {
    const email = `merge-${RUN}@example.com`;
    await hookHandler(post(token, { id: `m1-${RUN}`, email, name: 'Merged Mo' }, { ip: '26.0.0.3' }));
    await hookHandler(
      post(token, { id: `m2-${RUN}`, email: email.toUpperCase(), phone: '555-777-8888' }, { ip: '26.0.0.3' }),
    );

    const rows = await sql<{ id: string; phone: string | null }[]>`
      select id, phone from leads where customer_id = ${customerId} and lower(email) = ${email}
    `;
    // Two leads would count this person's lost revenue twice, corrupting the one
    // number the product reports.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.phone).toBe('5557778888');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run test:api
```

Expected: the whole file fails in `beforeAll` — `Cannot find module '../hook/[token]'`.

- [ ] **Step 3: Write `api/_lib/ingest.ts`**

The orchestration lives here rather than in the route file so Phase 3's email
path reuses it unchanged.

```ts
import { extractLead, isEmptyExtraction } from '@missed-lead/core';
import {
  buildDedupeKey,
  findExistingEvent,
  PREVIOUS_TOKEN_EVENT,
  recordLeadEvent,
  type TokenState,
  upsertLead,
  withIngestScope,
} from '@missed-lead/db';
import { db } from './db';

/**
 * Shared ingest orchestration: extract → write, inside one tenant-scoped
 * transaction. Admission has already happened by the time anything here runs.
 *
 * Phase 3's email path calls `ingestDelivery` with a parsed message instead of a
 * webhook body, which is why this is not inline in the route file.
 */

export type IngestOutcome =
  | { kind: 'created'; leadId: string }
  | { kind: 'deduped' }
  | { kind: 'unparsed' };

/**
 * The caller's IP, from Vercel's `x-forwarded-for`.
 *
 * First entry only: the platform appends the real peer address, and a client
 * cannot forge one in a way that reaches us unchanged. Null when the header is
 * absent (a local test invocation), which makes `ingest_admit` skip the IP
 * buckets rather than key every caller onto one shared placeholder.
 */
export function clientIp(req: Request): string | null {
  const header = req.headers.get('x-forwarded-for');
  if (!header) return null;
  const first = header.split(',')[0]?.trim();
  return first || null;
}

/**
 * Read the body as JSON, or as a form post flattened to one level.
 *
 * Form-encoded is accepted because several form tools send it by default;
 * rejecting them would fail in the field for a reason the owner could never
 * diagnose. Anything else, or a body that will not parse, is a 400 — and
 * deliberately writes no event, because a request we cannot parse has no dedupe
 * key and a malformed-body loop would fill the audit log.
 */
export async function parseBody(
  req: Request,
): Promise<{ ok: true; payload: unknown } | { ok: false }> {
  // Strip any `; charset=utf-8` parameter before comparing.
  const type = (req.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  const raw = await req.text();
  if (!raw) return { ok: false };

  if (type === 'application/json') {
    try {
      return { ok: true, payload: JSON.parse(raw) };
    } catch {
      return { ok: false };
    }
  }

  if (type === 'application/x-www-form-urlencoded') {
    const params = new URLSearchParams(raw);
    const flat = Object.fromEntries(params);
    if (Object.keys(flat).length === 0) return { ok: false };
    return { ok: true, payload: flat };
  }

  return { ok: false };
}

/**
 * Extract the payload and write it, or report that there was nothing to write.
 *
 * Write order is fixed by privilege: `ingest_role` holds only SELECT and INSERT
 * on lead_events (`0001_ingest_role.sql:81`), no UPDATE, so an event cannot be
 * inserted first and have its lead_id backfilled. Lead, then event.
 *
 * On a repeat delivery the whole transaction is rolled back rather than letting
 * the redundant upsert commit. Harmless today, since mergeLeadFields is monotonic
 * and idempotent — but committing it would make correctness depend on that
 * property holding forever.
 */
export async function ingestDelivery(input: {
  customerId: string;
  sourceId: string;
  payload: unknown;
  tokenState: TokenState;
  now?: Date;
}): Promise<IngestOutcome> {
  const receivedAt = input.now ?? new Date();
  const extracted = extractLead(input.payload, receivedAt);
  const dedupeKey = buildDedupeKey({
    sourceId: input.sourceId,
    providerEventId: extracted.providerEventId,
    payload: input.payload,
  });

  /** Thrown to roll transaction 2 back on a repeat delivery. */
  class Deduped extends Error {}

  try {
    return await withIngestScope(db(), input.customerId, async (tx) => {
      // Cheap read first: the common retry case short-circuits before any write
      // and never reaches the rollback path.
      if (await findExistingEvent(tx, input.customerId, dedupeKey)) throw new Deduped();

      const warnings = extracted.warnings;

      if (isEmptyExtraction(extracted)) {
        // raw_payload is stored regardless. Never a rejection — an owner
        // debugging a misconfigured form needs to see that we received
        // something.
        await recordLeadEvent(tx, input.customerId, {
          kind: 'webhook.received',
          dedupeKey,
          sourceId: input.sourceId,
          rawPayload: input.payload,
          parseWarnings: warnings,
          occurredAt: receivedAt,
        });
        if (input.tokenState === 'previous') {
          await recordPreviousTokenUse(tx, input.customerId, input.sourceId, dedupeKey, receivedAt);
        }
        return { kind: 'unparsed' as const };
      }

      const lead = await upsertLead(tx, input.customerId, {
        sourceId: input.sourceId,
        externalLeadId: extracted.providerEventId,
        // Out-of-window timestamps fall back to receipt time; the warning is
        // already on the event.
        createdAt: extracted.occurredAt ?? receivedAt,
        ...(extracted.customerName ? { customerName: extracted.customerName } : {}),
        email: extracted.email,
        phone: extracted.phone,
        source: 'Webhook',
        ...(extracted.notes ? { notes: extracted.notes } : {}),
      });

      const recorded = await recordLeadEvent(tx, input.customerId, {
        kind: 'webhook.received',
        dedupeKey,
        leadId: lead.leadId,
        sourceId: input.sourceId,
        rawPayload: input.payload,
        parseWarnings: warnings,
        occurredAt: receivedAt,
      });

      // Two concurrent retries: the SELECT above can miss, and the unique
      // constraint on (customer_id, dedupe_key) resolves it here rather than by
      // timing.
      if (!recorded.recorded) throw new Deduped();

      if (input.tokenState === 'previous') {
        await recordPreviousTokenUse(tx, input.customerId, input.sourceId, dedupeKey, receivedAt);
      }

      return { kind: 'created' as const, leadId: lead.leadId };
    });
  } catch (error) {
    if (error instanceof Deduped) return { kind: 'deduped' };
    throw error;
  }
}

/**
 * Note that a delivery arrived on the demoted token.
 *
 * This row is what lets the status endpoint tell an owner "your old URL is still
 * being used" — the alert `PITFALLS.md:12` asks for. Its dedupe key is derived
 * from the delivery's, so a retry does not log the alert twice.
 */
async function recordPreviousTokenUse(
  tx: Parameters<Parameters<typeof withIngestScope>[2]>[0],
  customerId: string,
  sourceId: string,
  dedupeKey: string,
  occurredAt: Date,
): Promise<void> {
  await recordLeadEvent(tx, customerId, {
    kind: PREVIOUS_TOKEN_EVENT,
    dedupeKey: `${PREVIOUS_TOKEN_EVENT}:${dedupeKey}`,
    sourceId,
    occurredAt,
  });
}
```

- [ ] **Step 4: Let `problem()` carry headers**

The 429 needs a `retry-after` header, and `problem()` currently takes none. One
optional parameter in `api/_lib/response.ts`, defaulted so all existing callers
are unaffected:

```ts
export function problem(
  status: number,
  code: string,
  message?: string,
  headers: Record<string, string> = {},
): Response {
  return json({ error: { code, message: message ?? code } }, status, headers);
}
```

Without this the handler cannot emit `retry-after` without bypassing the shared
helpers, and the terse-body guarantee lives in that helper.

- [ ] **Step 5: Write `api/hook/[token].ts`**

Thin by design. Admission, then parse, then write — nothing else.

```ts
import { admitWebhookDelivery } from '@missed-lead/db';
import { db } from '../_lib/db';
import { clientIp, ingestDelivery, parseBody } from '../_lib/ingest';
import { json, methodNotAllowed, problem } from '../_lib/response';

/**
 * The public, unauthenticated ingest endpoint.
 *
 * A salon owner pastes this URL into their form tool; there is no JWT and no
 * account credential in the form tool. The token in the path is the only secret.
 *
 * Order is admit-then-parse, deliberately: the rate counter is charged before the
 * body is read, so a flood of malformed bodies is limited exactly like any other
 * traffic. A 400 therefore still consumes quota, which is correct.
 */

/**
 * The token from the path.
 *
 * Vercel resolves `[token]` from the last path segment, so reading it from the
 * URL means a direct test invocation and a real deployment take the same code
 * path — no dependence on a framework-injected `query` object that a `Request`
 * does not carry.
 */
function tokenFrom(req: Request): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? '');
}

export async function POST(req: Request): Promise<Response> {
  const token = tokenFrom(req);
  if (!token) return problem(404, 'not_found');

  const admitted = await admitWebhookDelivery(db(), token, clientIp(req));

  // Rate limit first, and write nothing: a spam flood must not become an
  // audit-log flood.
  if (!admitted.admit) {
    return problem(429, 'rate_limited', undefined, {
      'retry-after': String(admitted.retryAfter ?? 60),
    });
  }

  // 404 rather than a silent 200. It tells a scanner nothing it did not already
  // know — the token was its own guess — and it appears in the form tool's own
  // delivery log, which is the only way an owner ever discovers they pasted the
  // URL wrong. A silent 200 makes a permanently broken integration look healthy
  // forever.
  if (admitted.tokenState === 'unknown' || !admitted.customerId || !admitted.sourceId) {
    return problem(404, 'not_found');
  }

  const body = await parseBody(req);
  if (!body.ok) return problem(400, 'invalid_body');

  const outcome = await ingestDelivery({
    customerId: admitted.customerId,
    sourceId: admitted.sourceId,
    payload: body.payload,
    tokenState: admitted.tokenState,
  });

  if (outcome.kind === 'unparsed') return json({ ok: true, parsed: false });
  return json({ ok: true, deduped: outcome.kind === 'deduped' });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed(['POST']);
  return POST(req);
}
```

`vercel.json` needs no change: the SPA rewrite already excludes `/api/` via the
negative lookahead `/((?!api/).*)`, so this route resolves.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm run test:api
npm run typecheck
```

Expected: `hook.test.ts` green, `endpoints.test.ts` still green, typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add api/_lib/ingest.ts api/_lib/response.ts api/hook/ api/__tests__/hook.test.ts
git commit -m "$(cat <<'EOF'
feat(api): public webhook ingest endpoint

Admit, then parse, then write. Admission comes first so the rate counter is
charged before the body is read -- otherwise a flood of malformed bodies is
unlimited. A 400 therefore still consumes quota, which is correct.

Unknown tokens are 404, not a silent 200. It tells a scanner nothing it did not
already know, and it shows up in the form tool's own delivery log -- the only
mechanism by which an owner discovers they pasted the URL wrong. A silent 200
makes a permanently broken integration look healthy forever.

A repeat delivery rolls transaction 2 back rather than letting the redundant
upsert commit. That is harmless today because mergeLeadFields is monotonic, but
committing it would make correctness depend on that property holding forever.
A cheap SELECT on the dedupe key short-circuits the common retry before any
write; two concurrent retries still resolve on the unique constraint.

Orchestration lives in api/_lib/ingest.ts, not the route file, because Phase 3's
email path reuses it with a parsed message in place of a webhook body.

Form-encoded bodies are accepted alongside JSON: several form tools send them by
default, and rejecting them would fail in the field for a reason the owner could
never diagnose.

problem() gains an optional headers argument so the 429 can carry retry-after
without bypassing the helper that guarantees terse bodies.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: The provisioning API

**Files:**
- Create: `api/_lib/sources.ts`
- Create: `api/sources.ts`
- Create: `api/sources/[id].ts`
- Create: `api/sources/[id]/rotate.ts`
- Create: `api/__tests__/sources.test.ts`
- Modify: `.env.example` (add `PUBLIC_APP_URL`)
- Modify: `api/vitest.config.ts` — nothing, it already globs `__tests__/**`. Listed
  so nobody goes looking for a registration step that does not exist.

**Interfaces:**
- Consumes: `listSources`, `getSource`, `createWebhookSource`,
  `rotateWebhookToken`, `revokeSource`, `SourceStatus` (Task 4);
  `resolveCustomer` (`api/_lib/auth.ts`); `json`, `problem`, `methodNotAllowed`.
- Produces: the JSON contract Phase 2b's connection card consumes.
  ```ts
  export interface SourceResponse {
    id: string;
    label: string;
    kind: 'webhook' | 'email' | 'csv';
    webhookUrl: string | null;   // null once revoked
    createdAt: string;           // ISO
    revokedAt: string | null;
    lastEventAt: string | null;
    eventCount: number;
    leadCount: number;
    previousTokenInUse: boolean;
    lastParseWarningAt: string | null;
  }

  export function webhookUrlFor(token: string | null): string | null;
  export function toResponse(status: SourceStatus): SourceResponse;
  export function readLabel(body: unknown): string | null;
  export function sourceIdFrom(req: Request, offsetFromEnd?: number): string;
  export function isUuid(value: string): boolean;
  ```

- [ ] **Step 1: Write the failing test**

Create `api/__tests__/sources.test.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The authenticated provisioning API. Requires `npx supabase start`.
 *
 * These handlers run as `postgres`, which owns the tables, so RLS does not
 * constrain them — tenant scoping is the explicit `where customer_id` inside the
 * repository. Every route therefore gets a cross-tenant case, and every one of
 * those asserts **404, never 403**: "not found" and "not yours" must be
 * indistinguishable from outside, or the API is an enumeration oracle
 * (`response.ts:14`).
 */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB_URL = process.env.DATABASE_URL_DIRECT!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(DB_URL, { prepare: false, max: 2 });
const RUN = Date.now().toString(36);

let listHandler: (req: Request) => Promise<Response>;
let oneHandler: (req: Request) => Promise<Response>;
let rotateHandler: (req: Request) => Promise<Response>;
let hookHandler: (req: Request) => Promise<Response>;

const userIds: string[] = [];
let customerId: string;
let otherCustomerId: string;
let ownerToken: string;
let otherToken: string;

async function signUp(slug: string): Promise<{ userId: string; token: string }> {
  const email = `${slug}-${RUN}@provision.test`;
  const password = 'test-password-1234';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  return { userId: data.user.id, token: session.session!.access_token };
}

beforeAll(async () => {
  // PUBLIC_APP_URL must be set before the modules initialise: webhookUrlFor
  // throws without it rather than emitting a relative URL an owner cannot paste.
  process.env.PUBLIC_APP_URL ??= 'https://app.test';

  ({ default: listHandler } = await import('../sources'));
  ({ default: oneHandler } = await import('../sources/[id]'));
  ({ default: rotateHandler } = await import('../sources/[id]/rotate'));
  ({ default: hookHandler } = await import('../hook/[token]'));

  const owner = await signUp('owner');
  ownerToken = owner.token;
  const [mine] = await sql<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${owner.userId}, 'Sunset Salon') returning id
  `;
  customerId = mine!.id;

  const other = await signUp('rival');
  otherToken = other.token;
  const [theirs] = await sql<{ id: string }[]>`
    insert into customers (auth_user_id, business_name)
    values (${other.userId}, 'Rival Salon') returning id
  `;
  otherCustomerId = theirs!.id;
}, 60_000);

afterAll(async () => {
  for (const id of [customerId, otherCustomerId].filter(Boolean)) {
    await sql`delete from customers where id = ${id}`;
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await sql`delete from ingest_rate_counters where bucket like ${`%${RUN}%`}`;
  await sql.end();
});

const authed = (path: string, token: string, init: RequestInit = {}) =>
  new Request(`https://example.test${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });

/** Create a source through the API and return its parsed body. */
async function create(token: string, label: string) {
  const res = await listHandler(
    authed('/api/sources', token, { method: 'POST', body: JSON.stringify({ label }) }),
  );
  expect(res.status).toBe(201);
  return res.json() as Promise<{ id: string; label: string; webhookUrl: string }>;
}

describe('POST /api/sources', () => {
  it('creates a webhook source and returns a pasteable URL', async () => {
    const body = await create(ownerToken, 'Website form');
    expect(body.label).toBe('Website form');
    expect(body.webhookUrl).toMatch(/^https:\/\/app\.test\/api\/hook\/[A-Za-z0-9_-]{43}$/);
  });

  it('returns the whole status shape the connection card consumes', async () => {
    const body = (await create(ownerToken, 'Full shape')) as unknown as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        'createdAt',
        'eventCount',
        'id',
        'kind',
        'label',
        'lastEventAt',
        'lastParseWarningAt',
        'leadCount',
        'previousTokenInUse',
        'revokedAt',
        'webhookUrl',
      ].sort(),
    );
    // Never the raw column — a caller must not have to build the URL itself.
    expect(body.webhookToken).toBeUndefined();
    expect(body.eventCount).toBe(0);
    expect(body.previousTokenInUse).toBe(false);
  });

  it('serializes timestamps as ISO strings, not Date objects', async () => {
    const body = (await create(ownerToken, 'Timestamps')) as unknown as Record<string, unknown>;
    expect(typeof body.createdAt).toBe('string');
    expect(new Date(body.createdAt as string).getUTCFullYear()).toBeGreaterThan(2020);
    expect(body.revokedAt).toBeNull();
  });

  it('the returned URL actually ingests', async () => {
    // The end-to-end claim of the whole phase: paste this URL, leads arrive.
    const body = await create(ownerToken, 'Live URL');
    const res = await hookHandler(
      new Request(body.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '30.0.0.1' },
        body: JSON.stringify({ id: `live-${RUN}`, email: `live-${RUN}@example.com`, name: 'Live Lead' }),
      }),
    );
    expect(res.status).toBe(200);
    const [lead] = await sql<{ customer_id: string }[]>`
      select customer_id from leads where email = ${`live-${RUN}@example.com`}
    `;
    expect(lead!.customer_id).toBe(customerId);
  });

  it.each([
    ['no label', {}],
    ['empty label', { label: '' }],
    ['whitespace label', { label: '   ' }],
    ['non-string label', { label: 42 }],
    ['over-long label', { label: 'x'.repeat(121) }],
  ])('400s on %s', async (_case, body) => {
    const res = await listHandler(
      authed('/api/sources', ownerToken, { method: 'POST', body: JSON.stringify(body) }),
    );
    expect(res.status).toBe(400);
  });

  it('400s an unparseable body', async () => {
    const res = await listHandler(
      authed('/api/sources', ownerToken, { method: 'POST', body: '{"label": ' }),
    );
    expect(res.status).toBe(400);
  });

  it('400s a kind this phase does not support', async () => {
    // Email sources are Phase 3. Silently creating a webhook instead would hand
    // the owner a URL when they asked for an address.
    const res = await listHandler(
      authed('/api/sources', ownerToken, {
        method: 'POST',
        body: JSON.stringify({ label: 'Inbox', kind: 'email' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('unsupported_kind');
  });

  it('stamps the row with the token holder\'s tenant', async () => {
    const body = await create(otherToken, 'Rival form');
    const [row] = await sql<{ customer_id: string }[]>`
      select customer_id from lead_sources where id = ${body.id}
    `;
    expect(row!.customer_id).toBe(otherCustomerId);
  });
});

describe('GET /api/sources', () => {
  it('lists only the caller\'s sources', async () => {
    await create(otherToken, 'Definitely theirs');
    const res = await listHandler(authed('/api/sources', ownerToken));
    expect(res.status).toBe(200);
    const { sources } = await res.json();
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.some((s: { label: string }) => s.label === 'Definitely theirs')).toBe(false);
  });

  it('returns an empty array for a tenant with no sources, not a 404', async () => {
    const fresh = await signUp('empty');
    const [row] = await sql<{ id: string }[]>`
      insert into customers (auth_user_id, business_name)
      values (${fresh.userId}, 'Empty Salon') returning id
    `;
    const res = await listHandler(authed('/api/sources', fresh.token));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sources: [] });
    await sql`delete from customers where id = ${row!.id}`;
  });

  it('405s an unsupported method with an Allow header', async () => {
    const res = await listHandler(authed('/api/sources', ownerToken, { method: 'PUT' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, POST');
  });
});

describe('GET /api/sources/[id]', () => {
  it('returns one source with live counts', async () => {
    const created = await create(ownerToken, 'Counted');
    await hookHandler(
      new Request(created.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '31.0.0.1' },
        body: JSON.stringify({ id: `c-${RUN}`, email: `c-${RUN}@example.com` }),
      }),
    );

    const res = await oneHandler(authed(`/api/sources/${created.id}`, ownerToken));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.eventCount).toBe(1);
    expect(body.leadCount).toBe(1);
    expect(body.lastEventAt).not.toBeNull();
  });

  it('reports previousTokenInUse after a delivery on the old URL', async () => {
    const created = await create(ownerToken, 'Old URL live');
    const oldUrl = created.webhookUrl;
    await rotateHandler(
      authed(`/api/sources/${created.id}/rotate`, ownerToken, { method: 'POST' }),
    );
    await hookHandler(
      new Request(oldUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '31.0.0.2' },
        body: JSON.stringify({ id: `old-${RUN}`, email: `old-${RUN}@example.com` }),
      }),
    );

    const res = await oneHandler(authed(`/api/sources/${created.id}`, ownerToken));
    const body = await res.json();
    // This is the whole point of the status endpoint: the owner's form is still
    // posting to a URL that stops working in under 72 hours.
    expect(body.previousTokenInUse).toBe(true);
  });

  it('404s another tenant\'s source id — never 403', async () => {
    const theirs = await create(otherToken, 'Private');
    const res = await oneHandler(authed(`/api/sources/${theirs.id}`, ownerToken));
    // 403 would confirm the id exists, which is the enumeration oracle
    // response.ts:14 exists to prevent.
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('404s a well-formed id that does not exist, with the same body', async () => {
    const missing = await oneHandler(
      authed('/api/sources/00000000-0000-0000-0000-000000000000', ownerToken),
    );
    const theirs = await create(otherToken, 'Indistinguishable');
    const notMine = await oneHandler(authed(`/api/sources/${theirs.id}`, ownerToken));

    expect(missing.status).toBe(notMine.status);
    expect(await missing.text()).toBe(await notMine.text());
  });

  it('404s a malformed id rather than surfacing a database error', async () => {
    // A non-uuid reaches Postgres as `invalid input syntax for type uuid`, which
    // is a 500 and leaks the column type.
    const res = await oneHandler(authed('/api/sources/not-a-uuid', ownerToken));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/sources/[id]', () => {
  it('revokes, nulls the URL, and kills the token', async () => {
    const created = await create(ownerToken, 'To revoke');
    const url = created.webhookUrl;

    const res = await oneHandler(
      authed(`/api/sources/${created.id}`, ownerToken, { method: 'DELETE' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revokedAt).not.toBeNull();
    expect(body.webhookUrl).toBeNull();

    const posted = await hookHandler(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '32.0.0.1' },
        body: JSON.stringify({ email: `dead-${RUN}@example.com` }),
      }),
    );
    expect(posted.status).toBe(404);
  });

  it('404s another tenant\'s source and leaves it live', async () => {
    const theirs = await create(otherToken, 'Not yours to kill');
    const res = await oneHandler(
      authed(`/api/sources/${theirs.id}`, ownerToken, { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);

    const [row] = await sql<{ revoked_at: Date | null }[]>`
      select revoked_at from lead_sources where id = ${theirs.id}
    `;
    expect(row!.revoked_at).toBeNull();
  });

  it('405s an unsupported method', async () => {
    const created = await create(ownerToken, 'Method check');
    const res = await oneHandler(
      authed(`/api/sources/${created.id}`, ownerToken, { method: 'PATCH' }),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, DELETE');
  });
});

describe('POST /api/sources/[id]/rotate', () => {
  it('returns a new URL and keeps the old one working', async () => {
    const created = await create(ownerToken, 'Rotating');
    const res = await rotateHandler(
      authed(`/api/sources/${created.id}/rotate`, ownerToken, { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.webhookUrl).not.toBe(created.webhookUrl);
    expect(body.webhookUrl).toMatch(/^https:\/\/app\.test\/api\/hook\/[A-Za-z0-9_-]{43}$/);

    for (const url of [body.webhookUrl, created.webhookUrl]) {
      const posted = await hookHandler(
        new Request(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': '33.0.0.1' },
          body: JSON.stringify({ id: `rot-${RUN}-${url.slice(-6)}`, email: `rot-${url.slice(-6)}@example.com` }),
        }),
      );
      expect(posted.status).toBe(200);
    }
  });

  it('404s another tenant\'s source and does not rotate it', async () => {
    const theirs = await create(otherToken, 'Leave mine alone');
    const res = await rotateHandler(
      authed(`/api/sources/${theirs.id}/rotate`, ownerToken, { method: 'POST' }),
    );
    expect(res.status).toBe(404);

    const still = await oneHandler(authed(`/api/sources/${theirs.id}`, otherToken));
    expect((await still.json()).webhookUrl).toBe(theirs.webhookUrl);
  });

  it('404s a revoked source — there is nothing left to rotate', async () => {
    const created = await create(ownerToken, 'Revoked then rotated');
    await oneHandler(authed(`/api/sources/${created.id}`, ownerToken, { method: 'DELETE' }));
    const res = await rotateHandler(
      authed(`/api/sources/${created.id}/rotate`, ownerToken, { method: 'POST' }),
    );
    expect(res.status).toBe(404);
  });

  it('405s a GET', async () => {
    const created = await create(ownerToken, 'Rotate method');
    const res = await rotateHandler(authed(`/api/sources/${created.id}/rotate`, ownerToken));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
});

describe('auth on every provisioning route', () => {
  /** The five routes, and which handler serves each. */
  const ROUTES: Array<[string, string, string]> = [
    ['list', '/api/sources', 'GET'],
    ['create', '/api/sources', 'POST'],
    ['get one', '/api/sources/00000000-0000-0000-0000-000000000000', 'GET'],
    ['revoke', '/api/sources/00000000-0000-0000-0000-000000000000', 'DELETE'],
    ['rotate', '/api/sources/00000000-0000-0000-0000-000000000000/rotate', 'POST'],
  ];

  const handlerFor = (path: string) =>
    path.endsWith('/rotate') ? rotateHandler : path === '/api/sources' ? listHandler : oneHandler;

  it.each(ROUTES)('%s 401s with no Authorization header', async (_name, path, method) => {
    const res = await handlerFor(path)(
      new Request(`https://example.test${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({ label: 'x' }) } : {}),
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('missing_token');
  });

  it.each(ROUTES)('%s 401s on a garbage token', async (_name, path, method) => {
    const res = await handlerFor(path)(
      authed(path, 'garbage.garbage.garbage', {
        method,
        ...(method === 'POST' ? { body: JSON.stringify({ label: 'x' }) } : {}),
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('invalid_token');
  });

  it.each(ROUTES)('%s rejects auth BEFORE touching the database', async (_name, path, method) => {
    // Order matters: a route that resolved the id first would 404 an unauthorized
    // caller, telling them the id does not exist. Auth failures must win.
    const res = await handlerFor(path)(
      authed(path, 'garbage.garbage.garbage', {
        method,
        ...(method === 'POST' ? { body: JSON.stringify({ label: 'x' }) } : {}),
      }),
    );
    expect(res.status).not.toBe(404);
  });

  it('403s a valid token whose user has no customer row, and creates nothing', async () => {
    const orphan = await signUp('orphan');
    const res = await listHandler(
      authed('/api/sources', orphan.token, {
        method: 'POST',
        body: JSON.stringify({ label: 'Should not exist' }),
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('no_customer');

    const rows = await sql`select 1 from lead_sources where label = 'Should not exist'`;
    expect(rows).toHaveLength(0);
  });

  it('never echoes a token into an error body', async () => {
    const res = await listHandler(authed('/api/sources', 'garbage.garbage.garbage'));
    expect(await res.text()).not.toContain('garbage');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run test:api
```

Expected: the file fails in `beforeAll` — `Cannot find module '../sources'`.

- [ ] **Step 3: Write `api/_lib/sources.ts`**

```ts
import type { SourceStatus } from '@missed-lead/db';

/**
 * Shared shaping for the three provisioning routes.
 *
 * Exists so the URL is built in exactly one place. Three route files each
 * assembling it from PUBLIC_APP_URL is three chances to hand a customer a broken
 * URL, and the failure is silent — the owner pastes it, nothing arrives, and
 * nothing in our logs says why.
 */

/** The wire shape. This is the contract Phase 2b's connection card consumes. */
export interface SourceResponse {
  id: string;
  label: string;
  kind: 'webhook' | 'email' | 'csv';
  /** Null once revoked. */
  webhookUrl: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastEventAt: string | null;
  eventCount: number;
  leadCount: number;
  previousTokenInUse: boolean;
  lastParseWarningAt: string | null;
}

/**
 * Build the public hook URL from `PUBLIC_APP_URL`.
 *
 * Deliberately NOT from the inbound request's `host` header: a proxied or spoofed
 * host would produce a URL pointing somewhere else, and the owner would paste it
 * into their form tool without ever knowing.
 *
 * Throws when the env var is missing rather than emitting a relative URL, because
 * a relative URL looks plausible in a JSON response and fails only later, in the
 * form tool, where nobody is watching.
 */
export function webhookUrlFor(token: string | null): string | null {
  if (!token) return null;
  const base = process.env.PUBLIC_APP_URL;
  if (!base) throw new Error('PUBLIC_APP_URL is not set — refusing to build a webhook URL.');
  return `${base.replace(/\/+$/, '')}/api/hook/${token}`;
}

/**
 * Map a repository row onto the wire shape.
 *
 * The raw `webhookToken` is never returned — only the URL built from it. The
 * token itself is returned in full inside that URL, which is correct: it is
 * something the owner must copy, not a password.
 *
 * Dates become ISO strings explicitly. `JSON.stringify` would do the same thing
 * by accident; doing it here makes the contract the type says it is.
 */
export function toResponse(status: SourceStatus): SourceResponse {
  return {
    id: status.id,
    label: status.label,
    kind: status.kind,
    webhookUrl: webhookUrlFor(status.webhookToken),
    createdAt: status.createdAt.toISOString(),
    revokedAt: status.revokedAt?.toISOString() ?? null,
    lastEventAt: status.lastEventAt?.toISOString() ?? null,
    eventCount: status.eventCount,
    leadCount: status.leadCount,
    previousTokenInUse: status.previousTokenInUse,
    lastParseWarningAt: status.lastParseWarningAt?.toISOString() ?? null,
  };
}

const MAX_LABEL = 120;

/** A trimmed, non-empty, bounded label, or null when the body does not have one. */
export function readLabel(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = (body as Record<string, unknown>).label;
  if (typeof raw !== 'string') return null;
  const label = raw.trim();
  if (!label || label.length > MAX_LABEL) return null;
  return label;
}

/**
 * A path segment, counted from the end.
 *
 * `offsetFromEnd = 0` is the last segment (`/api/sources/<id>`), `1` is the one
 * before it (`/api/sources/<id>/rotate`). Read from the URL rather than a
 * framework-injected `query` object, so a direct test invocation and a real
 * deployment take the same code path.
 */
export function sourceIdFrom(req: Request, offsetFromEnd = 0): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1 - offsetFromEnd] ?? '');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guard before the id reaches Postgres.
 *
 * Without it a non-uuid raises `invalid input syntax for type uuid` — a 500 that
 * also leaks the column type. A malformed id is a 404, same as any other id that
 * is not this tenant's.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
```

- [ ] **Step 4: Write the three route files**

`api/sources.ts` — list and create:

```ts
import { createWebhookSource, listSources } from '@missed-lead/db';
import { resolveCustomer } from './_lib/auth';
import { db } from './_lib/db';
import { json, methodNotAllowed, problem } from './_lib/response';
import { readLabel, toResponse } from './_lib/sources';

/**
 * The tenant's sources. Follows api/me.ts: named method exports plus a `default`
 * handler that returns methodNotAllowed on a mismatch.
 */

export async function GET(req: Request): Promise<Response> {
  const auth = await resolveCustomer(req);
  if (!auth.ok) return problem(auth.status, auth.code);

  const sources = await listSources(db(), auth.customerId);
  return json({ sources: sources.map(toResponse) });
}

export async function POST(req: Request): Promise<Response> {
  const auth = await resolveCustomer(req);
  if (!auth.ok) return problem(auth.status, auth.code);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return problem(400, 'invalid_body');
  }

  const label = readLabel(body);
  if (!label) return problem(400, 'invalid_label');

  // Email sources are Phase 3. Silently creating a webhook instead would hand the
  // owner a URL when they asked for an address.
  const kind = (body as Record<string, unknown>).kind;
  if (kind !== undefined && kind !== 'webhook') return problem(400, 'unsupported_kind');

  const created = await createWebhookSource(db(), auth.customerId, label);
  return json(toResponse(created), 201);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') return GET(req);
  if (req.method === 'POST') return POST(req);
  return methodNotAllowed(['GET', 'POST']);
}
```

`api/sources/[id].ts` — get and revoke:

```ts
import { getSource, revokeSource } from '@missed-lead/db';
import { resolveCustomer } from '../_lib/auth';
import { db } from '../_lib/db';
import { json, methodNotAllowed, problem } from '../_lib/response';
import { isUuid, sourceIdFrom, toResponse } from '../_lib/sources';

/**
 * One source: read its live status, or revoke it.
 *
 * Auth is resolved before the id is looked at, in both methods. The other order
 * would 404 an unauthorized caller, which tells them the id does not exist.
 *
 * Another tenant's id is 404, never 403 — "not found" and "not yours" must be
 * indistinguishable from outside (`response.ts:14`).
 */

export async function GET(req: Request): Promise<Response> {
  const auth = await resolveCustomer(req);
  if (!auth.ok) return problem(auth.status, auth.code);

  const id = sourceIdFrom(req);
  if (!isUuid(id)) return problem(404, 'not_found');

  const source = await getSource(db(), auth.customerId, id);
  if (!source) return problem(404, 'not_found');
  return json(toResponse(source));
}

export async function DELETE(req: Request): Promise<Response> {
  const auth = await resolveCustomer(req);
  if (!auth.ok) return problem(auth.status, auth.code);

  const id = sourceIdFrom(req);
  if (!isUuid(id)) return problem(404, 'not_found');

  if (!(await revokeSource(db(), auth.customerId, id))) return problem(404, 'not_found');

  // Read back so the owner sees the revoked state rather than having to refetch.
  const source = await getSource(db(), auth.customerId, id);
  return json(toResponse(source!));
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') return GET(req);
  if (req.method === 'DELETE') return DELETE(req);
  return methodNotAllowed(['GET', 'DELETE']);
}
```

`api/sources/[id]/rotate.ts`:

```ts
import { rotateWebhookToken } from '@missed-lead/db';
import { resolveCustomer } from '../../_lib/auth';
import { db } from '../../_lib/db';
import { json, methodNotAllowed, problem } from '../../_lib/response';
import { isUuid, sourceIdFrom, toResponse } from '../../_lib/sources';

/**
 * Issue a new token, keeping the old one alive for 72 hours.
 *
 * A separate route rather than a PATCH on the source, because rotating is an
 * action with a side effect the caller must see the result of — the new URL —
 * not a field update.
 *
 * The id is the second-to-last path segment here, since `/rotate` is last.
 */

export async function POST(req: Request): Promise<Response> {
  const auth = await resolveCustomer(req);
  if (!auth.ok) return problem(auth.status, auth.code);

  const id = sourceIdFrom(req, 1);
  if (!isUuid(id)) return problem(404, 'not_found');

  // Null covers not-yours, not-found, and already-revoked. A revoked source has
  // no token to rotate, and resurrecting one would hand out a live URL for a
  // source the owner deliberately killed.
  const rotated = await rotateWebhookToken(db(), auth.customerId, id);
  if (!rotated) return problem(404, 'not_found');
  return json(toResponse(rotated));
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed(['POST']);
  return POST(req);
}
```

- [ ] **Step 5: Add `PUBLIC_APP_URL` to `.env.example`**

In the server-only block, after `SUPABASE_JWKS_URL`:

```bash
# Base URL the webhook URLs handed to customers are built from. NOT derived from
# the request's host header — a proxied or spoofed host would produce a URL
# pointing somewhere else, and the owner would paste it in without knowing.
PUBLIC_APP_URL=http://127.0.0.1:5173
```

Then add the same line to your own `.env`, or `test:api` fails on the missing
value — deliberately, rather than emitting a URL that cannot work.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm run test:api
npm run typecheck
```

Expected: `sources.test.ts` green, `hook.test.ts` and `endpoints.test.ts` still
green, typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add api/_lib/sources.ts api/sources.ts api/sources/ \
       api/__tests__/sources.test.ts .env.example
git commit -m "$(cat <<'EOF'
feat(api): source provisioning, rotation, and live status

Five routes over the Task 4 repository, following api/me.ts: named method
exports plus a default handler that returns methodNotAllowed.

Another tenant's source id is 404, never 403, on every route -- 403 would confirm
the id exists. A test asserts the 404 body for not-yours is byte-identical to the
one for does-not-exist. A malformed id is also 404: without the uuid guard it
reaches Postgres as `invalid input syntax for type uuid`, which is a 500 that
leaks the column type.

Auth resolves before the id is read, and a test per route asserts an
unauthorized caller never gets a 404 -- the other order would tell them whether
the id exists.

webhookUrl is built from PUBLIC_APP_URL in one shared place, never from the
request's host header: a proxied or spoofed host would produce a URL pointing
somewhere else and the owner would paste it in without knowing. A missing env var
throws rather than emitting a relative URL, which looks plausible in JSON and
fails later in the form tool where nobody is watching.

The status payload is the contract Phase 2b's connection card consumes, so a test
pins its exact key set -- including that the raw token column never appears.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Manual verification and phase close-out

The suites prove the pieces. This proves the sentence the phase exists to
deliver: paste one URL into a form tool and leads arrive, deduplicated.

**Files:**
- Modify: `.planning/STATE.md`
- Modify: `.planning/PROJECT.md`

**Interfaces:** none. Documentation only.

- [ ] **Step 1: Walk the whole lifecycle by hand**

Everything below runs against local Supabase. Get a real access token first —
`resolveCustomer` verifies signatures against the JWKS, so a hand-made JWT will
not do.

```bash
# 1. A real session for a tenant that exists.
export SUPABASE_URL=http://127.0.0.1:54321
export ANON_KEY="$(grep VITE_SUPABASE_ANON_KEY .env | cut -d= -f2-)"
export APP=http://127.0.0.1:5173

TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H 'content-type: application/json' \
  -d '{"email":"you@example.test","password":"test-password-1234"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

# If that 400s, the user does not exist yet. Create one and give it a customer row:
#   npx supabase --help  # (or use the Studio UI at http://127.0.0.1:54323)
# then: insert into customers (auth_user_id, business_name) values ('<uid>', 'Test Salon');
```

Start the app so the API routes are served: `npm run dev` in another terminal.

```bash
# 2. Create a source. Copy the webhookUrl out of the response.
curl -s -X POST "$APP/api/sources" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"label":"Website form"}' | python3 -m json.tool

export HOOK='<paste webhookUrl here>'
export SOURCE_ID='<paste id here>'

# 3. POST a Typeform-shaped payload. Expect {"ok":true,"deduped":false}.
curl -s -X POST "$HOOK" -H 'content-type: application/json' -d '{
  "event_id": "manual-001",
  "form_response": {
    "submitted_at": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "answers": [
      {"field":{"ref":"full_name"},"type":"text","text":"Priya Raman"},
      {"field":{"ref":"email"},"type":"email","email":"priya@example.com"},
      {"field":{"ref":"phone"},"type":"phone_number","phone_number":"+1 (555) 010-2030"},
      {"field":{"ref":"message"},"type":"text","text":"Balayage on Friday?"}
    ]
  }
}'

# 4. Confirm it landed. Expect eventCount 1, leadCount 1, lastEventAt set.
curl -s "$APP/api/sources/$SOURCE_ID" -H "authorization: Bearer $TOKEN" | python3 -m json.tool

# 5. Replay the exact same POST. Expect {"ok":true,"deduped":true} and the counts
#    from step 4 unchanged — a retry must not become a second lead.
```

```bash
# 6. Rotate. Keep both URLs.
export OLD_HOOK="$HOOK"
curl -s -X POST "$APP/api/sources/$SOURCE_ID/rotate" \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool
export HOOK='<paste the NEW webhookUrl>'

# 7. POST to the OLD URL. Expect 200 — a rotation must not silently drop leads.
curl -s -X POST "$OLD_HOOK" -H 'content-type: application/json' \
  -d '{"id":"manual-002","email":"dana@example.com","name":"Dana Whitfield"}'

# 8. Check status again. previousTokenInUse must now be true — this is the alert
#    telling the owner their form is still posting to a URL that stops working.
curl -s "$APP/api/sources/$SOURCE_ID" -H "authorization: Bearer $TOKEN" | python3 -m json.tool

# 9. Revoke. webhookUrl comes back null.
curl -s -X DELETE "$APP/api/sources/$SOURCE_ID" \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool

# 10. POST to the new URL. Expect 404 {"error":{"code":"not_found"}}.
curl -s -i -X POST "$HOOK" -H 'content-type: application/json' \
  -d '{"email":"toolate@example.com"}' | head -1
```

Two more worth doing by hand, because they are the ones a suite can pass while
the real thing is broken:

```bash
# 11. Form-encoded, the way several tools post by default. Expect 200.
curl -s -X POST "$HOOK2" -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'name=Form Fran' --data-urlencode 'email=fran@example.com' \
  --data-urlencode 'phone=(555) 246-8100'

# 12. A garbage token. Expect 404, and confirm the response body does not contain
#     the token you guessed.
curl -s -X POST "$APP/api/hook/definitely-not-a-real-token" \
  -H 'content-type: application/json' -d '{"email":"x@example.com"}'
```

(Step 11 needs a live source; create a second one and export its URL as `HOOK2`.)

- [ ] **Step 2: Run everything, including the negative control**

```bash
npm run test:all
npm run test:prove-isolation -w @missed-lead/db
npm run typecheck
```

All green, or the phase is not done. `test:prove-isolation` is not optional: this
phase added a role, three policies, and six grants, and it is exactly the kind of
change that can quietly loosen tenant isolation while every test stays green.

- [ ] **Step 3: Update `.planning/STATE.md`**

Replace the "Current Position", "Phase 1 outcome", and "Next phase" sections:

```markdown
## Current Position

Phase: 2 of 6 — Webhook ingest — **complete**
Plan: `docs/superpowers/plans/2026-08-25-webhook-ingest.md`
Spec: `docs/superpowers/specs/2026-08-25-webhook-ingest-design.md`
Status: Ready to start Phase 2b (connection card) or Phase 3 (email ingest)
Last activity: 2026-08-28 — Phase 2 delivered and verified

## Phase 2 outcome

A salon owner pastes one URL into their form tool and their leads arrive,
deduplicated, with no credentials in the form tool. Backend and provisioning API
only, as scoped — no UI.

- **`POST /api/hook/<token>`** — public, unauthenticated, JSON or form-encoded
- **`resolver_role`** — second `NOBYPASSRLS` role for the pre-tenant lookup, so
  that phase is DB-enforced rather than a convention
- **`ingest_admit`** — one `SECURITY INVOKER` function holding token resolution
  and rate accounting; `prosecdef = false` asserted by test
- **Rate limiting in Postgres** — three buckets, one-minute windows, self-pruning
- **72-hour rotation overlap**, enforced at lookup time, with a
  `webhook.previous_token_used` event so the owner can see the old URL in use
- **Five provisioning routes** — list, create, get, revoke, rotate
- **Generic extraction** for every provider, refusing to guess: an address found
  only in a business-shaped key and a bare digit run are both rejected with a
  warning rather than merged wrongly
- **Negative control still passes** — `npm run test:prove-isolation -w @missed-lead/db`

Commits: Task 1 through Task 7 on `main`.

## Next phase

**Phase 2b — the connection card**, or **Phase 3 — email ingest**, in either
order. 2b needs Supabase sign-in in the client, which still does not exist; it
consumes `GET /api/sources/<id>` as built. Phase 3 reuses
`api/_lib/ingest.ts` and `packages/core/src/extract.ts` unchanged, supplying a
parsed message in place of a webhook body.
```

Also update the front-matter counters: `completed_phases: 2`, `total_plans: 2`,
`completed_plans: 2`, `percent: 33`, and `last_updated` / `last_activity` to
today.

The "What runs where" table gains no new rows but its counts change — update them
from the actual output of `npm run test:all`.

- [ ] **Step 4: Update `.planning/PROJECT.md`**

Three edits.

**In "Current Milestone", mark Phase 2 done:**

```markdown
- ~~Backend service + multi-tenant database (Vercel serverless)~~ ✅ Phase 1
- ~~Webhook ingestion endpoint (unique URL per customer)~~ ✅ Phase 2
- Email-forwarding ingestion (unique inbound inbox → parse → normalize) ← Phase 3
```

**In "Validated (do not re-research)", add:**

```markdown
**Phase 2 (2026-08-28):**
- Public webhook ingest at `POST /api/hook/<token>`, JSON and form-encoded
- `resolver_role` + `ingest_admit` — the pre-tenant lookup as a DB-enforced
  boundary, not a convention
- Rate limiting in Postgres: three buckets, one-minute windows, self-pruning
- Token rotation with a 72-hour overlap enforced at lookup time
- Provisioning API: list, create, get, revoke, rotate, with live status
- Provider-agnostic extraction (`packages/core/src/extract.ts`), no adapters
```

**In "Key Decisions", add these seven:**

```markdown
- **2026-08-28 — `resolver_role` for the pre-tenant lookup, not `postgres`.**
  Resolving a token to a tenant cannot run inside `withIngestScope`: the
  `lead_sources` policy filters on the `customer_id` the lookup is trying to
  produce. Running it as `postgres` would work, but `ENABLE ROW LEVEL SECURITY`
  exempts the table owner, so a bug there could read any table. A second
  `NOBYPASSRLS` role with grants on `lead_sources` and the rate counters and
  nothing else makes the worst case "confirm whether a token exists".
- **2026-08-28 — `ingest_admit` is `SECURITY INVOKER`.** A `DEFINER` function
  owned by `postgres` would execute with the owner's privileges and make the
  narrow grant list decorative. `prosecdef = false` is asserted by test, because
  a future `CREATE OR REPLACE` could flip it silently.
- **2026-08-28 — rate counters commit outside the ingest transaction.** If they
  shared it, a retry storm whose deliveries all deduped would roll its own
  counters back and abuse would be free.
- **2026-08-28 — extraction refuses rather than guesses.** An email found only
  under `from`/`reply_to`/`owner` is the business's own address, identical on
  every submission, and would collapse the whole dataset onto one identity. A
  bare 10-digit run is as likely an order id as a phone, and a wrong phone merges
  two unrelated humans. Both are dropped with a `parse_warning`. `mergeLeadFields`
  is monotonic, so a bad merge cannot be undone once revenue is attributed.
- **2026-08-28 — `estimatedValue` is never extracted from a payload.** Guessing a
  dollar figure out of arbitrary JSON writes straight into the headline number.
  A per-source average ticket is a settings decision, not a parsing one.
- **2026-08-28 — unknown tokens return 404, not a silent 200.** It tells a
  scanner nothing it did not already know, and it appears in the form tool's own
  delivery log — the only way an owner discovers they pasted the URL wrong. A
  silent 200 makes a permanently broken integration look healthy forever.
- **2026-08-28 — `FORCE ROW LEVEL SECURITY` stays off, deviating from the Phase 1
  plan.** `phase-1-foundation.md` §B said force would be applied; migration 0000
  only ever used `ENABLE`. Leaving it: `ENABLE` exempts the owner, which is what
  the pre-tenant lookup, the provisioning handlers, and test seeding all depend
  on. `ingest_role` and `resolver_role` are not owners and are already fully
  subject to policy, and the negative control proves the policies bind for them.
  Revisit if provisioning ever moves off the owner role.
```

**In "Lessons worth remembering", add two:**

```markdown
- **`drizzle-kit generate` needs the schema to be CJS-resolvable.** drizzle-kit
  `require()`s the schema file. Making `packages/core` ESM-only broke every
  `generate` with `ERR_PACKAGE_PATH_NOT_EXPORTED`, and nobody noticed for four
  commits because no migration was generated in between. A `default` condition in
  the `exports` map plus `.js` extensions on relative specifiers fixes it. Run
  `db:generate` after touching package exports, even when no schema changed.
- **`--custom` writes a snapshot identical to the previous one.** So a schema
  change made in the same commit becomes invisible to the next `generate`, which
  then tries to create the same table twice. Generate normally and append raw SQL
  to the file it produced.
```

- [ ] **Step 5: Commit**

```bash
git add .planning/STATE.md .planning/PROJECT.md
git commit -m "$(cat <<'EOF'
docs(planning): close out Phase 2

Records the seven decisions worth carrying forward, most of which are about
refusing to guess: extraction drops an ambiguous email or phone rather than
merging wrongly, because mergeLeadFields is monotonic and a bad merge cannot be
undone once revenue has been attributed to it.

Logs the FORCE ROW LEVEL SECURITY deviation explicitly. phase-1-foundation.md §B
said force would be applied and migration 0000 only ever used ENABLE. Keeping it
off, because ENABLE exempts the table owner and the pre-tenant lookup, the
provisioning handlers, and test seeding all depend on that.

Also two lessons that cost time this phase: drizzle-kit require()s the schema, so
an ESM-only core silently broke every `generate`; and --custom writes a snapshot
identical to the previous one, which makes a same-commit schema change invisible
to the next generate.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

Recorded so an executor knows what was checked and what was not.

**Verified by running the tools, not by reading:**

- The extractor in Task 1 was written out in full and run against Task 1's test
  file: 58 assertions, all passing, under `strict` + `noUncheckedIndexedAccess`.
  Four bugs were found and fixed that way, each of which would have failed in a
  non-obvious place:
  - Typeform's `{field: {ref}, type: 'email', email: ...}` shape needs `field.ref`
    read as the label and `record[record.type]` as the value; without it the
    Typeform fixture extracted nothing.
  - An ISO timestamp reduces to a 17-digit run and contains dashes, so it passed
    both `normalizePhone` and the formatting check — every payload with a
    `submitted_at` produced an invented phone number. Hence `DATE_SHAPED`.
  - Name keys have to be matched as substrings (`q3_fullName`) but with
    `form_name` and `business_name` excluded, so a fixed alternation list does not
    work.
  - `EVENT_ID_KEY` must be an exact-match list. As a substring pattern it caught
    `form_id`, which is stable across submissions, so the second real lead would
    look like a retry of the first and be discarded.
- `sources.ts` from Task 4 typechecks against the installed drizzle-orm 0.45.2.
  `StatusRow` must be a `type`, not an `interface` — `db.execute<T>` constrains `T`
  to `Record<string, unknown>` and an interface has no implicit index signature
  (TS2344).
- `api/_lib/ingest.ts`, `api/hook/[token].ts`, `api/_lib/sources.ts`, and all
  three route files typecheck against the real `api/tsconfig.json` settings.
  That is how the `problem()` signature change in Task 5 Step 4 was found.
- `drizzle-kit generate` was run in a scratch copy of `packages/db`. It failed as
  described, and the two-part fix in Task 2 was confirmed to make it succeed. The
  exact SQL in Task 3 Step 4 is its real output, and `--custom` was confirmed to
  emit an empty file plus a duplicate snapshot.
- `generateWebhookToken` was run: 43 characters, `/^[A-Za-z0-9_-]+$/`.
- Path parsing for `/api/hook/<token>`, `/api/sources/<id>`, and
  `/api/sources/<id>/rotate` was checked against real `Request` objects, which is
  where the `offsetFromEnd` parameter comes from.
- `customers.auth_user_id` has a real FK to `auth.users`
  (`0000_initial_multitenant_schema.sql:101`), so every test seed creates an auth
  user first. An earlier draft used `gen_random_uuid()` and would have failed in
  `beforeAll`.

**Not verified, because Docker was unavailable in this environment:**

- No SQL in Task 3 has been executed. The plpgsql is written against the shape of
  `0001_ingest_role.sql` and `0002_grants.sql`, but syntax errors are possible and
  will surface on the first `db:migrate`.
- Every assertion in `resolver-role.test.ts`, `sources.test.ts`, `hook.test.ts`,
  and `api/__tests__/sources.test.ts` is unrun. Expect to adjust exact error
  message matchers — `/permission denied/i` in particular — against what Postgres
  actually says.
- The counts in Task 7's STATE.md edit are placeholders. Fill them from real
  output.

**Spec coverage.** Every section of
`docs/superpowers/specs/2026-08-25-webhook-ingest-design.md` maps to a task:
architecture and `resolver_role` → 3; rate limiting → 3; tokens, rotation,
revocation → 3 and 4; payload extraction and its two corruption cases → 1;
idempotency and write ordering → 5; the response contract → 5; the provisioning
API and status payload → 6; schema changes → 3; testing → the test step of every
task; manual verification → 7. The spec's Files table lists
`packages/core/src/__tests__/extract.test.ts`; this plan puts it beside its source
instead, and says why under Deviations.

**One thing the spec does not mention and this plan adds:** the
`webhook.previous_token_used` event needs its own dedupe key, or a retry through
the old URL logs the alert twice. `${PREVIOUS_TOKEN_EVENT}:${dedupeKey}` derives
it from the delivery's, and a test asserts the count stays at one across a retry.
