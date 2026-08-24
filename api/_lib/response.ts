/** JSON response helpers. Kept tiny and shared so error shapes stay consistent. */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

/**
 * Error response. `code` is a stable machine-readable string; `message` is for
 * humans reading logs.
 *
 * Deliberately terse: never echo back tokens, SQL, or which tenant a resource
 * belongs to. "Not found" and "not yours" must be indistinguishable from
 * outside, or the API becomes an enumeration oracle.
 */
export function problem(status: number, code: string, message?: string): Response {
  return json({ error: { code, message: message ?? code } }, status);
}

export function methodNotAllowed(allowed: string[]): Response {
  return json({ error: { code: 'method_not_allowed' } }, 405, { allow: allowed.join(', ') });
}
