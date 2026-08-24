import { sql } from 'drizzle-orm';
import { pgPolicy } from 'drizzle-orm/pg-core';
import { authenticatedRole } from 'drizzle-orm/supabase';

/**
 * Rows of this table belong to the signed-in user's customer.
 *
 * Written as an inline subquery rather than a `security definer` helper
 * function so there is no migration-ordering dependency (the function would
 * have to exist before any policy referencing it) and no unpinned `search_path`
 * to get wrong. `(select auth.uid())` is wrapped so Postgres evaluates it once
 * as an InitPlan instead of per row.
 */
export const ownedByCurrentCustomer = () =>
  sql`customer_id in (select id from public.customers where auth_user_id = (select auth.uid()))`;

/**
 * Standard tenant isolation: the signed-in owner may do anything to their own
 * rows and cannot see anyone else's. `withCheck` matters as much as `using` —
 * without it a tenant could write a row stamped with someone else's
 * customer_id.
 *
 * Ingest paths have no `auth.uid()` (a form tool POSTs to a secret URL), so
 * they are handled separately — see migrations for the ingest role.
 */
export function tenantPolicy(name: string) {
  return pgPolicy(name, {
    for: 'all',
    to: authenticatedRole,
    using: ownedByCurrentCustomer(),
    withCheck: ownedByCurrentCustomer(),
  });
}
