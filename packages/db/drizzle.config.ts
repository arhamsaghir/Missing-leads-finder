import { defineConfig } from 'drizzle-kit';

/**
 * Migrations use the DIRECT connection, not the pooled one — DDL needs session
 * state that Supavisor's transaction mode will not hold.
 *
 * `entities.roles.provider: 'supabase'` tells drizzle-kit that Supabase's
 * built-in roles (anon, authenticated, service_role, ...) already exist and are
 * not ours to manage, so it does not emit DROP ROLE for them.
 */
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
