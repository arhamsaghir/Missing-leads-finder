import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

/**
 * Migrations use the DIRECT connection, not the pooled one — DDL needs session
 * state that Supavisor's transaction mode will not hold.
 *
 * `entities.roles.provider: 'supabase'` tells drizzle-kit that Supabase's
 * built-in roles (anon, authenticated, service_role, ...) already exist and are
 * not ours to manage, so it does not emit DROP ROLE for them.
 *
 * drizzle-kit runs from packages/db and does not inherit the repo-root .env the
 * way the test scripts do (they `source ../../.env`). Load it here so
 * `npm run db:migrate` works from a clean checkout without exporting anything.
 * process.loadEnvFile does not overwrite variables already in the environment,
 * so an explicit `DATABASE_URL_DIRECT=... npm run db:migrate` still wins.
 */
const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
try {
  process.loadEnvFile(rootEnv);
} catch {
  // No root .env (e.g. CI provides env directly) — fall through to process.env.
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? '',
  },
  entities: {
    roles: {
      provider: 'supabase',
    },
  },
  verbose: true,
  strict: true,
});
