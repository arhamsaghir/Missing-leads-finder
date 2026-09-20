# Verified: Drizzle + Supabase RLS API surface

> Verified 2026-08-24 against the **installed packages** (`drizzle-orm@0.45.2`,
> `drizzle-kit@0.31.10`), not docs or memory. This closes Step 1 of
> `phases/phase-1-foundation.md`, which blocked the schema work.

## Pinned versions

`drizzle-orm@0.45.2` · `drizzle-kit@0.31.10` — current stable per `npm view`.

**Do not use `1.0.0-beta.x`.** A v1 beta exists and the docs site banners it, but 0.45.2
is stable and its RLS surface is confirmed below. Pin exactly.

## `pgPolicy` — confirmed

From `drizzle-orm/pg-core/policies.d.ts`:

```ts
export interface PgPolicyConfig {
  as?: 'permissive' | 'restrictive';
  for?: 'all' | 'select' | 'insert' | 'update' | 'delete';
  to?: PgPolicyToOption;
  using?: SQL;
  withCheck?: SQL;
}
export function pgPolicy(name: string, config?: PgPolicyConfig): PgPolicy;

export type PgPolicyToOption =
  | 'public' | 'current_role' | 'current_user' | 'session_user'
  | (string & {}) | PgPolicyToOption[] | PgRole;
```

`to` accepts a `PgRole` object directly, so the imported role constants below can be passed
without stringifying.

## `.enableRLS()` — confirmed

`drizzle-orm/pg-core/table.d.ts:22`:

```ts
enableRLS: () => Omit<PgTableWithColumns<T>, 'enableRLS'>;
```

Chained off `pgTable(...)`. Note: defining any `pgPolicy` on a table enables RLS
implicitly; `.enableRLS()` is for tables that need RLS **with no policies** — which is
exactly right for tables only the service role should ever touch.

## `drizzle-orm/supabase` — confirmed, exports everything needed

From `drizzle-orm/supabase/rls.d.ts` (re-exported by `supabase/index.d.ts`):

| Export | Type |
|---|---|
| `anonRole` | `PgRole` |
| `authenticatedRole` | `PgRole` |
| `serviceRole` | `PgRole` |
| `postgresRole` | `PgRole` |
| `supabaseAuthAdminRole` | `PgRole` |
| `authUid` | `SQL<unknown>` |
| `authUsers` | `PgTable` — `auth.users` (`id` uuid PK, `email`, `phone`, `emailConfirmedAt`, `phoneConfirmedAt`, `lastSignInAt`, `createdAt`, `updatedAt`) |
| `realtimeMessages`, `realtimeTopic` | unused here |

**`authUsers` is a real win** — `customers.auth_user_id` can reference it as a typed
Drizzle FK instead of hand-written SQL against `auth.users`.

## `crudPolicy` is Neon-only — plan corrected

`crudPolicy` exists **only** under `drizzle-orm/neon/rls`. There is no Supabase
equivalent. Write each policy explicitly with `pgPolicy`. This was an open question in the
plan; the answer is "not available."

## `drizzle.config.ts` roles — confirmed

From `drizzle-kit/index.d.mts:131-137`:

```ts
entities?: {
  roles?: boolean | {
    provider?: 'supabase' | 'neon' | (string & {});
    exclude?: string[];
    include?: string[];
  };
};
```

Set `entities: { roles: { provider: 'supabase' } }` so drizzle-kit treats Supabase's
built-in roles as pre-existing and does not emit `DROP ROLE` statements for them.

## Consequences for Step 3

1. Policies are hand-written with `pgPolicy` — no `crudPolicy` shortcut.
2. `to: authenticatedRole` for tenant policies; the custom `ingest_role` needs
   `pgRole('ingest_role')` declared, or a raw SQL migration if role creation needs
   attributes drizzle-kit can't express.
3. `authUid` is a prebuilt `SQL` fragment. The plan's `(select auth.uid())` performance
   wrapping still needs verifying — check whether `authUid` already renders wrapped, and
   if not use `sql\`(select auth.uid())\`` directly.
4. `customers.authUserId` → `authUsers.id` as a typed FK with `onDelete: 'cascade'`.
5. `entities.roles.provider = 'supabase'` goes in the config from the first migration.
