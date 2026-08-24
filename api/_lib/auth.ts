import { eq } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { customers } from '@missed-lead/db';
import { db } from './db';

/**
 * Turn a Supabase access token into the tenant it belongs to.
 *
 * Verification is local, against the project's JWKS, rather than calling the
 * auth server per request. `createRemoteJWKSet` caches the key set and refetches
 * only on rotation, so this costs no network round-trip in the warm path.
 */

export interface ResolvedCustomer {
  ok: true;
  userId: string;
  customerId: string;
  token: string;
}

export interface AuthFailure {
  ok: false;
  status: 401 | 403 | 500;
  code: 'missing_token' | 'invalid_token' | 'no_customer' | 'auth_misconfigured';
}

export type AuthResult = ResolvedCustomer | AuthFailure;

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function keySet(): ReturnType<typeof createRemoteJWKSet> | undefined {
  if (jwks) return jwks;
  const url = process.env.SUPABASE_JWKS_URL;
  if (!url) return undefined;
  jwks = createRemoteJWKSet(new URL(url));
  return jwks;
}

function bearer(req: Request): string | undefined {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return undefined;
  return token.trim() || undefined;
}

/**
 * Verify the token, then map its subject to a customer.
 *
 * A valid token with no matching customer row is 403 `no_customer`, never an
 * implicit "create one". Provisioning a tenant is a deliberate act; minting one
 * from any presented token is how cross-tenant bugs start.
 */
export async function resolveCustomer(req: Request): Promise<AuthResult> {
  const token = bearer(req);
  if (!token) return { ok: false, status: 401, code: 'missing_token' };

  const keys = keySet();
  if (!keys) return { ok: false, status: 500, code: 'auth_misconfigured' };

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keys));
  } catch {
    // Never surface the underlying reason — expired vs malformed vs wrong
    // signature are all just "invalid" to a caller.
    return { ok: false, status: 401, code: 'invalid_token' };
  }

  const userId = payload.sub;
  if (!userId) return { ok: false, status: 401, code: 'invalid_token' };

  const [row] = await db()
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.authUserId, userId))
    .limit(1);

  if (!row) return { ok: false, status: 403, code: 'no_customer' };
  return { ok: true, userId, customerId: row.id, token };
}
