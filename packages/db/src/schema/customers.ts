import { sql } from 'drizzle-orm';
import { pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authenticatedRole, authUsers } from 'drizzle-orm/supabase';

/**
 * The tenant. One row per business using the product.
 *
 * `authUserId` is a separate column rather than reusing the auth user's id as
 * the primary key. Today it is 1:1 (solo-owner product — team roles are
 * explicitly out of scope), but this shape lets several users share one
 * customer later without migrating the customer_id FK on every other table.
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authUserId: uuid('auth_user_id')
      .notNull()
      .unique()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    businessName: text('business_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    // Owners see and edit only their own row. Insert is deliberately excluded:
    // provisioning goes through the service role, so a stray token cannot mint
    // a tenant.
    pgPolicy('customers_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`auth_user_id = (select auth.uid())`,
    }),
    pgPolicy('customers_update_own', {
      for: 'update',
      to: authenticatedRole,
      using: sql`auth_user_id = (select auth.uid())`,
      withCheck: sql`auth_user_id = (select auth.uid())`,
    }),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
