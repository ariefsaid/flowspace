# Spec 0011 — RLS write lockdown (revoke client write DML) · I-046

- Status: Draft (I-046; security — MONEY/PRIVILEGE path). Owner-approved to run ahead of the other parity
  merges (2026-08-28). Director-authored.
- Source: Luna money-review finding on I-041 (verified reachable + safe by the Director). Not an I-041
  regression — pre-existing since migration 0002.
- Depends on: ADR-0015 (Drizzle/RLS on Supabase — "server is the authoritative gate, RLS is defense-in-depth").
  This spec makes the schema actually match ADR-0015's stated model.

## Problem (verified)

Every business table runs `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` plus a policy
`FOR ALL TO authenticated USING (org_id = current_org())`. The browser ships the anon key +
`NEXT_PUBLIC_SUPABASE_URL` (required for Supabase Auth + Realtime). So any logged-in MEMBER can call the
Supabase Data API (PostgREST) directly with their own JWT and write any row **in their own org**, bypassing
the server-side ADMIN gate entirely. Confirmed exploits:
- `supabase.from('membership_tier_config').update({ cafe_discount_pct: 100 })` → org-wide 100% discounts
  (passes RLS org check + the 0–100 CHECK).
- `supabase.from('app_users').update({ membership_tier: 'GOLD' }).eq('id', self)` → self-upgrade; the
  server re-resolves tier from this row, so server pricing then honors GOLD.

The Director verified **no client code writes via the Data API** (all writes go through server actions on the
service-role connection, which bypasses RLS). So revoking client write DML is safe and breaks nothing.

## Affected tables (12, complete)

`app_users`, `organizations` (0002) · `cafe_menu_items`, `cafe_orders`, `cafe_order_items` (0005) ·
`time_credit_packages`, `facilities`, `bookings`, `print_jobs`, `transactions` (0006) ·
`membership_tier_config`, `org_print_pricing` (0008).

## Requirements (EARS)

- **FR-1000** (ubiquitous) — The `authenticated` role shall hold **`SELECT` only** on every business table;
  `INSERT`, `UPDATE`, `DELETE` shall be revoked. Reads (client RSC hydration is server-side; client-direct
  reads + Realtime subscriptions) continue to work.
- **FR-1001** (ubiquitous) — All writes shall occur through the server (service-role / postgres connection,
  which is not subject to these grants). No server action, repository, seed, or migration behavior changes.
- **FR-1002** (event-driven) — When a request authenticated as a MEMBER attempts INSERT/UPDATE/DELETE on any
  business table via the `authenticated` role, the database shall reject it (permission denied), regardless of
  the row's `org_id`.
- **NFR-1000** (convention, binding on the wave) — Every NEW business table (I-040/I-043/I-044 and beyond)
  shall `GRANT SELECT ... TO authenticated` only — never write DML — and keep the `org_id` RLS policy as the
  read backstop. Recorded in `docs/adr/0015-*` addendum note + this spec; reviewers enforce it.

## Acceptance criteria (owning layer)

- **AC-1000** (integration) — Given the migration applied, when the `authenticated` role (JWT scoped to org A)
  attempts `UPDATE membership_tier_config SET cafe_discount_pct = 100`, then it is rejected (permission denied)
  and the row is unchanged.
- **AC-1001** (integration) — Given the same role, when it attempts `UPDATE app_users SET membership_tier =
  'GOLD'` on its own row, then it is rejected and the tier is unchanged (the self-upgrade exploit is closed).
- **AC-1002** (integration) — Given the same role, when it attempts INSERT/UPDATE/DELETE on each of the 12
  business tables, then every attempt is rejected. (Parametrized over the table list.)
- **AC-1003** (integration) — Given the same role, when it `SELECT`s its own org's rows, then reads still
  succeed and remain org-scoped (the existing RLS backstop, e.g. AC-021, still passes — no regression).
- **AC-1004** (integration) — Given the service-role/postgres connection, when a server repository writes any
  business table, then the write still succeeds (server authority intact; existing repo int-tests stay green).

## Migration / schema delta

One ordered migration (claims **0011**; release-time renumber-check — I-041's `0010` lands first). For each of
the 12 tables: `REVOKE INSERT, UPDATE, DELETE ON TABLE <t> FROM authenticated;` (idempotent; `SELECT` grant and
all RLS policies untouched). Use the same `FOREACH t IN ARRAY ARRAY[...]` DO-block style as 0006/0008 for the
domain tables, plus explicit statements for `app_users`/`organizations`. No Drizzle schema change (grants aren't
modeled in `lib/db/schema.ts`).

## Out of scope

The pricing-change **audit log** (separate money-path repudiation follow-up). Column-level grants. Any change to
RLS *policies* (they stay as the read backstop). Row-level write authorization nuance (server already owns it).
