/**
 * Contact normalization for identity dedupe.
 *
 * The problem this exists to solve: the same human can reach a business through
 * a web form AND a forwarded email. Without a canonical form for their contact
 * details they become two leads, and their lost revenue is counted twice —
 * corrupting the single figure the product reports.
 *
 * Pure string functions, no dependencies. The hashing used for webhook
 * idempotency lives in the db package instead, since it needs node:crypto.
 */

export type ContactKind = 'email' | 'phone';

export interface ClassifiedContact {
  kind: ContactKind;
  /** As supplied, trimmed. Kept for display — never match on this. */
  raw: string;
  /** Canonical form. Two records match iff their normalized values are equal. */
  normalized: string;
}

/** One @, a non-empty local part, and a dotted domain. No spaces anywhere. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lowercase and trim. Deliberately nothing cleverer: stripping Gmail dots or
 * plus-tags would merge addresses that can belong to different people, and a
 * bad merge cannot be undone once revenue has been attributed.
 */
export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim();
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * Reduce to digits so every spelling of one number collides.
 *
 * 11 digits starting with 1 is treated as NANP-with-country-code and the 1 is
 * dropped, so "+1 555 123 4567" and "555-123-4567" match. Longer numbers keep
 * all their digits — truncating to the last 10 would merge distinct
 * international numbers, which is worse than failing to merge.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

/**
 * Split the polymorphic `Lead.contact` field into a typed identity.
 *
 * Email wins when a value contains both, because an address identifies a person
 * more precisely than a shared business line.
 *
 * Returns null for free text ("ask for Bob"), which parseLeadsCSV accepts. A
 * null result means the lead is still stored — it simply has no identity to
 * dedupe on, and will never be merged with another record.
 */
export function classifyContact(raw: string): ClassifiedContact | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const emailToken = trimmed.split(/\s+/).find((token) => EMAIL_RE.test(token));
  if (emailToken) {
    return { kind: 'email', raw: trimmed, normalized: emailToken.toLowerCase() };
  }

  const phone = normalizePhone(trimmed);
  if (phone) return { kind: 'phone', raw: trimmed, normalized: phone };

  return null;
}
