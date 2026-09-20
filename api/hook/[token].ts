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
