import { getDb, type Db } from '@missed-lead/db';

/**
 * Database handle for a function invocation.
 *
 * `getDb` caches at module scope, so a warm invocation reuses the connection
 * instead of opening a new one per request — the classic way to exhaust a
 * Postgres connection limit from serverless.
 */
export function db(): Db {
  return getDb();
}
