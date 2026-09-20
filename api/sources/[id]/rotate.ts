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
