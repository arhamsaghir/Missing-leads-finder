import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: { sql: postgres.Sql; db: Db } | undefined;

/**
 * Connection for serverless functions.
 *
 * Held at module scope so warm invocations reuse it. `prepare: false` is
 * required when talking to Supabase through Supavisor in transaction mode —
 * prepared statements are not shared across pooled sessions and will error.
 *
 * DATABASE_URL should be the *pooled* connection string. Migrations need the
 * direct one (DATABASE_URL_DIRECT), since DDL requires session state a
 * transaction pooler will not hold.
 */
export function getDb(connectionString = process.env.DATABASE_URL): Db {
  if (cached) return cached.db;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — refusing to connect to an unknown database.');
  }
  const sql = postgres(connectionString, { prepare: false, max: 1 });
  const db = drizzle(sql, { schema });
  cached = { sql, db };
  return db;
}

/** Fresh connection with no module-level caching — for tests and migrations. */
export function createDb(connectionString: string): { sql: postgres.Sql; db: Db } {
  const sql = postgres(connectionString, { prepare: false, max: 1 });
  return { sql, db: drizzle(sql, { schema }) };
}
