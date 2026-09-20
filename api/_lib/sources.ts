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
  const trimmed = base.replace(/\/+$/, '');
  return trimmed + '/api/hook/' + token;
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
