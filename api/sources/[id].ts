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
