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

import { normalizeEmail, normalizePhone } from './normalize.js';

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
 *
 * Matched as a *segment*, deliberately looser than the plan's anchored version:
 * anchoring let `from_email`, `sender_email` and `_replyto` walk straight past
 * the guard, and because those keys contain `mail` the EMAIL_KEY_HINT below
 * actively promoted them ahead of a real `customer_email` in the same payload.
 */
const BUSINESS_EMAIL_KEY = /(^|[_-])(from|sender|owner|account|admin|to|reply[_-]?to)([_-]|$)/i;
const EMAIL_KEY_HINT = /mail/i;
const PHONE_KEY_HINT = /phone|tel|mobile|cell/i;
const NOTES_KEY = /message|comment|note|enquir|inquir|detail|descript/i;
const EVENT_ID_KEY = /^(id|event_id|submission_id|response_id|form_response_id)$/i;
const TIMESTAMP_KEY = /^(created_at|submitted_at|timestamp|occurred_at|received_at|date|submission_date)$/i;

/** Parents whose `id` is stable across every delivery. `flatten` keeps only the
 *  final path segment, so `{user: {id}}` and `{form: {id}}` both arrive as a
 *  bare `id` and match EVENT_ID_KEY exactly — the same corruption the flat
 *  `form_id`/`user_id` exclusion prevents, one level down. A stable id makes
 *  buildDedupeKey treat every later real lead as a retry of the first and
 *  silently discard it (`packages/db/src/repo/ingest.ts:59-61`). */
const STABLE_ID_PARENT = /^(form|user|account|organi[sz]ation)$/i;

/** Any key mentioning a name, minus the ones that name something other than a
 *  person. `form_name` is the form's title and `business_name` is the salon —
 *  either would put the wrong string on every lead. Matched as substrings
 *  because providers prefix keys (Jotform sends `q3_fullName`). */
const NAME_KEY = /name/i;
const NAME_KEY_EXCLUDE =
  /(form|business|company|brand|file|host|event|organi[sz]ation|user|account|domain|page)[_-]?name/i;
const FIRST_NAME_KEY = /(first[_-]?name|given[_-]?name|fname)$/i;
/** `lname` needs a boundary: keys are lowercased before matching, so an
 *  unbounded suffix reads `fullName` — and Jotform's `q3_fullName` — as a
 *  surname and joins it to the first name, yielding 'Marcus Marcus Webb'. */
const LAST_NAME_KEY = /(last[_-]?name|family[_-]?name|surname|(^|[_-])lname)$/i;
/** Keys that explicitly announce a person's full name. Top preference. */
const FULL_NAME_KEY = /full[_-]?name|^name$|customer[_-]?name/i;
/** Name-ish keys that are never the customer's name, even when nothing else is
 *  present. These are what made exclusion-based inference a defect: a
 *  `middle_name` returned 'Q' and a `pet_name` returned 'Biscuit'. Everything
 *  else name-ish is allowed through as a ranked fallback, because
 *  `contact_name`, `client_name`, `your_name`, `attendee_name` and friends are
 *  the common real-world spellings and dropping them turns a name-only payload
 *  into an empty extraction — contradicting "a name alone IS a lead". */
const NOT_A_FULL_NAME = /middle[_-]?name|pet[_-]?name|nick[_-]?name/i;
/** A name needs at least one non-digit character, or an id under a name-ish key
 *  becomes the customer. Booleans are rejected by type, not by pattern —
 *  `name_verified: true` stringifies to 'true', which is indistinguishable from
 *  a legitimate string once flattened, and as a customerName it defeats
 *  isEmptyExtraction and creates an un-dedupable junk row. */
const NAME_HAS_NON_DIGIT = /\D/;

/** Starts with a country-code `+`, or carries a grouping mark. Either way a
 *  human wrote this intending a phone number. */
const PHONE_FORMATTING = /^\+|[\s.\-()]/;
/** Only the characters a phone number is written with. Grouping marks alone are
 *  not evidence: `ORD-1234-5678-90` and `10,000,000.00` both reduce to ten
 *  digits and both look "formatted". Letters and commas disqualify a value, on
 *  the key-hinted path too — letters never belong in a phone number, and
 *  checking only the unhinted path would mean any future hint widening reopened
 *  the order-id hole. */
const PHONE_CHARS = /^\+?[\d\s.\-()]+$/;
/** A leading `+` is explicit country-code evidence, and exempts a value from the
 *  length rule below. `normalize.ts:37-44` deliberately keeps every digit of a
 *  longer number rather than truncating, so refusing `+44 7911 123456`
 *  contradicts the layer underneath. */
const COUNTRY_CODE_PREFIX = /^\+/;
/** Without a `+`, an unhinted candidate must be the right *length* for a number,
 *  so a long punctuated reference cannot pass on formatting alone. A key-hinted
 *  value keeps normalizePhone's looser rule, which preserves international
 *  numbers. */
const NANP_DIGIT_COUNT = /^\d{10,11}$/;

/** ISO-ish date or a clock time. `2026-08-27T09:15:00.000Z` reduces to 17
 *  digits, which normalizePhone happily accepts and the `-` makes look
 *  formatted — so timestamps must be excluded explicitly. */
const DATE_SHAPED = /^\d{4}-\d{2}-\d{2}|\d{2}:\d{2}/;

interface Candidate {
  /** The final path segment, lowercased. Providers prefix keys (`q4_email`),
   *  so hints are matched as substrings, not equality. */
  key: string;
  /** The enclosing object's own key, lowercased. Only `pickEventId` uses it:
   *  a bare `id` means different things under `form` than under `form_response`. */
  parent: string;
  value: string;
  /** True when the source JSON value was a boolean. `String(true)` is
   *  indistinguishable from the text 'true' after flattening. */
  wasBoolean: boolean;
}

/**
 * Canonical form of a key: lowercased, with runs of whitespace collapsed to `_`.
 *
 * Label-shaped fields become the key of their sibling value, and a label keeps
 * its spaces — `Full Name`, `First Name`, `Sender Email`. No pattern here
 * tolerates a space, so without this `Full Name` extracts no name and
 * `Sender Email` walks past BUSINESS_EMAIL_KEY, whose `[_-]` boundary cannot
 * reach a space.
 */
function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
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

  const walk = (node: unknown, key: string, parent: string, depth: number): void => {
    if (depth > MAX_DEPTH || node === null || node === undefined) return;

    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
      const value = String(node).trim();
      if (value) out.push({ key, parent, value, wasBoolean: typeof node === 'boolean' });
      return;
    }
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      // An array is not a naming level: its items keep the array's own key, so
      // `parent` passes through untouched.
      for (const item of node) walk(item, key, parent, depth + 1);
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
      walk(valueish, normalizeKey(labelish), key, depth + 1);
      const consumed = new Set(['label', 'question', 'title', 'field', 'type', 'value', 'answer', 'text']);
      if (typeof record.type === 'string') consumed.add(record.type);
      for (const [k, v] of Object.entries(record)) {
        if (consumed.has(k)) continue;
        walk(v, normalizeKey(k), key, depth + 1);
      }
      return;
    }

    for (const [k, v] of Object.entries(record)) walk(v, normalizeKey(k), key, depth + 1);
  };

  walk(payload, '', '', 0);
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
 *
 * Tighter than the plan's version in three ways, because formatting alone is not
 * evidence: a value must contain no letters or commas (PHONE_CHARS) on *either*
 * path, and on the unhinted path it must also reduce to exactly 10 or 11 digits
 * unless it carries a leading `+`. Without the first two, `ORD-1234-5678-90` and
 * `10,000,000.00` each yielded a phone; without the `+` exemption,
 * `+44 7911 123456` was refused even though normalize.ts protects it.
 */
function pickPhone(candidates: Candidate[]): { phone: string | null; refused: boolean } {
  let refused = false;
  // A timestamp reduces to a long digit run and contains dashes, so it passes
  // both normalizePhone and the formatting check. Exclude it up front — by key as
  // well as by shape, since a bare epoch-seconds value is neither DATE_SHAPED nor
  // distinguishable from a NANP number, and warning about it would report a
  // refused phone on a payload that has no phone field at all.
  const plausible = candidates.filter(
    (c) =>
      !TIMESTAMP_KEY.test(c.key) &&
      !DATE_SHAPED.test(c.value) &&
      normalizePhone(c.value) !== null,
  );

  // PHONE_CHARS gates both paths, but as a *refusal* rather than a pre-filter:
  // filtering letters out silently would drop the phone_rejected_unformatted
  // warning, and a refused order id must still be reported.
  const hinted = plausible.find((c) => PHONE_KEY_HINT.test(c.key) && PHONE_CHARS.test(c.value));
  if (hinted) return { phone: normalizePhone(hinted.value), refused: false };

  for (const c of plausible) {
    if (
      PHONE_CHARS.test(c.value) &&
      PHONE_FORMATTING.test(c.value) &&
      (COUNTRY_CODE_PREFIX.test(c.value) || NANP_DIGIT_COUNT.test(c.value.replace(/\D/g, '')))
    ) {
      return { phone: normalizePhone(c.value), refused: false };
    }
    // Phone-shaped digits without enough evidence to use them: letters or a
    // comma, no formatting at all, or the wrong number of digits with no
    // country code.
    refused = true;
  }
  return { phone: null, refused };
}

/**
 * The customer's name, or null.
 *
 * Ranked, not a single gate. An explicit full-name key wins; failing that, any
 * remaining name-ish candidate that is neither the first-name nor the last-name
 * pick and is not on the NOT_A_FULL_NAME list. The plan's single
 * FULL_NAME_KEY gate was too narrow — it dropped `contact_name`, `client_name`,
 * `your_name` and every other real spelling, turning a name-only payload into an
 * empty extraction. Pure exclusion was too wide — it returned a `middle_name` or
 * a `pet_name`.
 *
 * A candidate must also be text rather than a boolean or a bare id
 * (`name_verified: true` became the customerName 'true', defeating
 * isEmptyExtraction).
 */
function pickName(candidates: Candidate[]): string | null {
  const named = candidates.filter(
    (c) =>
      NAME_KEY.test(c.key) &&
      !NAME_KEY_EXCLUDE.test(c.key) &&
      !c.wasBoolean &&
      NAME_HAS_NON_DIGIT.test(c.value),
  );

  const first = named.find((c) => FIRST_NAME_KEY.test(c.key));
  const last = named.find((c) => LAST_NAME_KEY.test(c.key));
  // A full name beats first+last, which beats either alone.
  const full =
    named.find((c) => FULL_NAME_KEY.test(c.key)) ??
    named.find((c) => c !== first && c !== last && !NOT_A_FULL_NAME.test(c.key));
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
 *
 * The parent check is the same rule one level down, and is a divergence from the
 * plan: `flatten` keeps only the final segment, so `{user: {id: 'u_99'}}` arrives
 * as a bare `id` and slipped past the exact-match list entirely. It applies to a
 * bare `id` only — `form.submission_id` names the submission, not the form, and
 * rejecting it would push buildDedupeKey onto hashing the canonical payload,
 * where a re-serialized redelivery no longer dedupes.
 */
function pickEventId(candidates: Candidate[]): string | null {
  const found = candidates.find(
    (c) =>
      EVENT_ID_KEY.test(c.key) && !(c.key === 'id' && STABLE_ID_PARENT.test(c.parent)),
  );
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
