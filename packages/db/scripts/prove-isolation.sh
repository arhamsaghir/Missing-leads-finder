#!/usr/bin/env bash
# Prove the tenant-isolation suite can actually fail.
#
# A green security test that cannot detect a breach is worse than no test — it
# is false confidence. This loosens leads_tenant_isolation to `using (true)`,
# asserts the suite goes RED, then restores the policy and asserts it goes GREEN
# again.
#
# Run after any change to policies, grants, or the isolation suite.
set -uo pipefail
cd "$(dirname "$0")/.."

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_project-9}"
TENANT_PREDICATE="customer_id in (select id from public.customers where auth_user_id = (select auth.uid()))"

psql_do() { docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "$1"; }

restore() {
  psql_do "alter policy leads_tenant_isolation on public.leads
             using ($TENANT_PREDICATE) with check ($TENANT_PREDICATE);"
}
# Restore even if we're interrupted — never leave the DB wide open.
trap restore EXIT INT TERM

set -a; [ -f ../../.env ] && . ../../.env; set +a

echo "1/3 baseline — expecting PASS"
npx vitest run --silent >/dev/null 2>&1 || { echo "FAIL: suite is red before we broke anything."; exit 1; }
echo "     ok"

echo "2/3 loosening leads_tenant_isolation to using(true) — expecting FAIL"
psql_do "alter policy leads_tenant_isolation on public.leads using (true) with check (true);"
if npx vitest run --silent >/dev/null 2>&1; then
  echo "FAIL: suite still passed with isolation disabled. The tests do not detect a leak."
  exit 1
fi
echo "     ok — suite correctly went red"

echo "3/3 restoring policy — expecting PASS"
restore
trap - EXIT INT TERM
npx vitest run --silent >/dev/null 2>&1 || { echo "FAIL: suite still red after restore."; exit 1; }
echo "     ok"

echo
echo "Isolation tests verified: they pass when isolation holds and fail when it does not."
