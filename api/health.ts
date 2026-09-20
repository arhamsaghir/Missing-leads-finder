import { sql } from 'drizzle-orm';
import { db } from './_lib/db';
import { json, methodNotAllowed, problem } from './_lib/response';

/**
 * Liveness plus a real database round-trip.
 *
 * Reaching the database matters: a function that boots but cannot connect is
 * the failure this endpoint exists to catch.
 */
export async function GET(): Promise<Response> {
  try {
    await db().execute(sql`select 1`);
    return json({ ok: true, database: 'reachable' });
  } catch {
    return problem(503, 'database_unreachable');
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed(['GET']);
  return GET();
}
