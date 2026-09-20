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
