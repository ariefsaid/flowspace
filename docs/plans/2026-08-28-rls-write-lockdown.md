# Plan — RLS write lockdown · I-046 · 2026-08-28

Spec: `docs/specs/0011-rls-write-lockdown.spec.md`. Migration: **0011** (renumber-check at release — I-041's
0010 merges first). Security/money path — Director verifies + a money-tier review. No ADR (an addendum note on
ADR-0015 records the convention). Small issue: ~4 tasks.

## Design

A single `REVOKE` migration on the 12 existing business tables (keep `SELECT`), an integration test that proves
a MEMBER-scoped `authenticated` connection can no longer write any of them (and still reads its own org), and a
one-line convention addendum so the wave's new tables ship SELECT-only. Zero application-code change: every write
already flows through the service-role connection, which these grants don't touch.

## Tasks

### 1. Red exploit test — AC-1000, AC-1001, AC-1002, AC-1003
Create `lib/db/rls-write-lockdown.int.test.ts`. Reuse the exact scoped-connection pattern from
`lib/db/rls.int.test.ts` (`rootSql.begin` → `SET LOCAL ROLE authenticated` → `SET LOCAL "request.jwt.claims"`).
Seed one org A + one MEMBER + one `membership_tier_config` row via `rootSql` (service role). Then, inside a
scoped tx:
- **AC-1000**: `UPDATE membership_tier_config SET cafe_discount_pct = 100` → expect the promise to **reject**
  (postgres `42501` permission denied); re-read via `rootSql` shows the original value.
- **AC-1001**: `UPDATE app_users SET membership_tier = 'GOLD' WHERE id = <self>` → reject; tier unchanged.
- **AC-1002**: parametrize over the 12-table array; for each, an `INSERT`/`UPDATE`/`DELETE` attempt rejects
  (a single representative `UPDATE ... WHERE false` per table is enough to trigger the grant check before any
  row match — assert `42501`).
- **AC-1003**: `SELECT` on `app_users`/`membership_tier_config` inside the scoped tx still returns org-A rows.

Helper: wrap the "expect this scoped write to be denied" in a small `expectDenied(sql)` that resolves to the
caught error code so the 12-table loop stays terse.

Verify (RED, before the migration): `pnpm test:int -- lib/db/rls-write-lockdown.int.test.ts` — writes currently
SUCCEED, so AC-1000..1002 fail. Confirm that failure, then task 2.

### 2. Migration 0011 — the REVOKE
Create `supabase/migrations/0011_rls_write_lockdown.sql`:
```sql
-- I-046 / spec 0011: revoke client write DML on every business table. The
-- authenticated role keeps SELECT (client reads + Realtime); ALL writes go
-- through the server's service-role connection (not subject to these grants).
-- Closes the Data-API write-bypass (member self-upgrade / org discount tamper).
REVOKE INSERT, UPDATE, DELETE ON TABLE "app_users"      FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE "organizations"  FROM authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cafe_menu_items','cafe_orders','cafe_order_items',
    'time_credit_packages','facilities','bookings','print_jobs','transactions',
    'membership_tier_config','org_print_pricing'
  ] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE %I FROM authenticated', t);
  END LOOP;
END $$;
```
Verify: `pnpm exec supabase db reset` (applies 0000..0011 clean), then
`pnpm test:int -- lib/db/rls-write-lockdown.int.test.ts` (now GREEN).

### 3. Regression sweep — AC-1004 + no read regression
Run the existing integration suite to prove server-side writes and client reads are unaffected:
`pnpm exec supabase db reset && pnpm db:seed:supabase && pnpm test:int`. All existing repo int-tests
(service-role writes) and `rls.int.test.ts` (scoped reads) must stay green. If any existing test wrote through a
non-service connection, that's a latent bug this surfaces — fix by routing it through `rootDb`/service role, and
note it in the report.

### 4. Convention addendum — NFR-1000
Append a short "Write-grant convention (I-046)" note to `docs/adr/0015-drizzle-rls-on-supabase.md`: new business
tables `GRANT SELECT ... TO authenticated` only; never write DML; keep the `org_id` RLS policy as the read
backstop. This is the target the I-040/I-043/I-044 new-table migrations must adopt at their review/rebase.
Verify: none (doc). Commit with the migration.

## Full gate
`pnpm typecheck && pnpm lint:ci && pnpm exec supabase db reset && pnpm db:seed:supabase && pnpm test:unit &&
pnpm test:int && pnpm build`. Coverage: the migration has no changed *lines of TS*; the int test file is the
proof artifact. ≥80% gate N/A (no changed app code) — note this in the PR.

## Traceability

| AC | Owning test | Layer |
|---|---|---|
| AC-1000 | `lib/db/rls-write-lockdown.int.test.ts` — `AC-1000` | Integration |
| AC-1001 | `lib/db/rls-write-lockdown.int.test.ts` — `AC-1001` | Integration |
| AC-1002 | `lib/db/rls-write-lockdown.int.test.ts` — `AC-1002` | Integration |
| AC-1003 | `lib/db/rls-write-lockdown.int.test.ts` — `AC-1003` | Integration |
| AC-1004 | existing repo int-tests (service-role writes stay green) + `AC-1004` guard | Integration |
