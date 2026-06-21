# ADR-0015 — Data layer: Drizzle ORM + drizzle-kit migrations on Supabase, RLS as backstop

- Status: Accepted
- Date: 2026-06-16
- Issue: I-005 (backend re-platform)
- Implements the data-layer half of [ADR-0013](0013-backend-platform-supabase.md). Supersedes the **ORM + migration
  tool** half of [ADR-0001](0001-stack-nextjs-prisma-neon.md) (Prisma/Neon). Revises the **test-DB** assumption of
  [ADR-0010](0010-test-strategy-pyramid.md): the throwaway Postgres is now the **Supabase CLI local stack**.

## Context
ADR-0013 adopted Supabase Postgres and Drizzle ORM behind the existing `lib/db/*` repository seam. Two real
sub-decisions remain: (a) **which migration tool** owns the schema, and (b) **what role RLS plays** given the
server is authoritative. Both are settled here so the rest of I-005 has no open ORM questions.

## Decision

### 1. Drizzle ORM behind the unchanged `lib/db/*` repository seam
- `lib/db/users.ts` is reimplemented on Drizzle with the **same exported function signatures** (`findByEmail`,
  `findById(orgId, id)`, `listByOrg(orgId)`, `createMember({...})`) and the same `org_id`-scoped `WHERE` clauses,
  so every caller (server actions, session resolver) is untouched. The returned row type is `AppUser` inferred from
  the Drizzle table (`InferSelectModel`) instead of `@prisma/client`.
- The `Role` / `MembershipTier` enums move from `@prisma/client` to a **single hand-authored source of truth**
  `lib/db/enums.ts` (string-literal unions + value arrays). Every `import type { Role } from "@prisma/client"`
  across the app (`route-policy.ts`, `policy.ts`, `authorize.ts`/its successor, `login/page.tsx`,
  `types/next-auth.d.ts` successor) re-points to `@/lib/db/enums`. This removes the last Prisma type dependency.
- A Drizzle client singleton (`lib/db/client.ts`) replaces the Prisma singleton, using `postgres-js` against
  `DATABASE_URL` (the Supabase pooled connection). Repositories import `db` from there as before.

### 2. DDL authority: a single ordered `supabase/migrations/` stream (drizzle-kit is the query-layer tool, **not** the DDL authority)

> **Revision (2026-06-16, I-005 CI fix):** the app DDL (`organizations`, `app_users`, enums) is **consolidated into
> `supabase/migrations/0000_app_schema.sql`** — the single, ordered source of truth that a fresh `supabase start`
> applies cleanly in one pass. `drizzle-orm` remains the **query layer** (`lib/db/schema.ts`); `drizzle-kit` is **no
> longer the DDL authority**. (The committed `drizzle/` snapshot was removed 2026-06-21 — it had gone stale (only
> `0000_init`, predating cafe/bookings/print/transactions) and a partial snapshot misleads more than none; `pnpm
> dz:generate` regenerates it on demand for inspection, and it is not run in CI.) This un-does
> the two-directory split below: a single ordered `supabase/migrations/` stream owns all DDL + platform wiring,
> which is what a fresh `supabase start` actually applies. The `*.down.sql` pairs were removed from the apply path
> (moved to `supabase/migrations/_down/`) because the Supabase CLI has no down-migration concept and applied them
> as forward migrations on a fresh stack (CI failure I-005).
> **Original §2 intent (superseded — kept for history).** The working assumption was that `drizzle-kit generate`/
> `migrate` would own app-table DDL from the Drizzle schema, with `supabase/migrations/*` reserved for
> Supabase-platform concerns (RLS/Storage/auth-link/Realtime), accepting **two migration directories** and a
> combined script that ran both. That split was **reversed** by the CI fix above: a fresh `supabase start` must
> apply one ordered stream, so app DDL moved into `supabase/migrations/`. (The `drizzle/` snapshot was later deleted — see the revision note above.)

> **Migrations are NOT reversible in the down-migration sense.** The Supabase CLI has no `down` concept; migrations
> are forward-only and re-applied fresh via `supabase db reset`. The `supabase/migrations/_down/*.sql` files are
> documentation only — they are not applied. (This corrects the original §2's "reversible / paired down step" claim.)

### 3. RLS as a defense-in-depth backstop (server stays authoritative)
- Per ADR-0013 the server is the gate. We still add RLS on `app_users` (and it becomes the default for future
  business tables) enforcing `org_id = current_org()` where `current_org()` reads the `org_id` JWT claim
  (`auth.jwt() ->> 'org_id'`). This is **isolation + defense-in-depth**, matching the glossary's tenancy model
  (location under one operator, not adversarial multi-tenant).
- **The server connects as a privileged role** (service/owner) for repository work and scopes `org_id` in SQL
  itself — RLS does not replace the repository's `WHERE org_id = …`. The RLS proof exercises a **scoped**
  connection (claim set to org A) and asserts org B's row is invisible — proving the backstop without making it the
  primary mechanism.
- We keep this **lean per ADR-0010**: exactly one RLS integration proof, not a policy-per-column test matrix.

## Consequences
- `prisma/` (schema, migrations, seed, client) and the `@prisma/client` + `prisma` + `bcryptjs` (auth path)
  dependencies are deleted at the end of I-005's cutover. `bcryptjs` may remain only if any non-auth code uses it
  (it does not — it is auth-only), so it is removed.
- `package.json` db scripts (actual, post-I-005): `sb:start`/`sb:stop` (Supabase CLI local stack),
  `db:seed`/`db:seed:supabase` (`tsx scripts/seed-supabase.ts`), and `dz:generate`/`dz:migrate`/`dz:studio` (drizzle-kit
  query-layer tooling — **not** the DDL authority). The original §2 conjectured a set of `db:*` migration/deploy/studio
  script renames that were **never added** — corrected here.
- ADR-0010's "throwaway Postgres" becomes the **Supabase CLI local stack** for integration + e2e; the
  pyramid (many unit, few integration, ~few e2e) and one-owning-layer rule is unchanged.
- Portability retained: Drizzle emits standard Postgres SQL; the app schema can move off Supabase. Supabase-only
  coupling is confined to `supabase/migrations/*` (RLS/Storage/Realtime) and the auth linkage.
