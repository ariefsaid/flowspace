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

### 2. drizzle-kit owns migrations (not Supabase migrations) — **DECISION FLAGGED (OQ-B)**
- **Chosen:** `drizzle-kit generate` emits SQL migrations under `drizzle/` from the Drizzle schema; they are the
  single source of truth for application tables (`organizations`, `app_users`), applied with `drizzle-kit migrate`
  in dev/CI and against prod.
- **Why over `supabase migration`:** the schema already lives in TypeScript (Drizzle), so one tool authoring both
  schema and migration keeps types and DDL in lockstep and avoids drift between a `.sql` file and the TS model.
  `supabase/migrations/*` is **still used**, but only for **Supabase-owned concerns** that are not application
  tables: RLS policies, the `app_users ↔ auth.users` FK, Storage buckets, and Realtime publication. This split —
  *drizzle-kit owns app DDL, supabase migrations own platform wiring* — is the cleanest seam and keeps the app
  schema portable off Supabase if ever needed.
- **Trade-off accepted:** two migration directories. Mitigated by a clear ownership rule (app tables → drizzle;
  RLS/Storage/auth-linkage/realtime → supabase) and a single `pnpm db:migrate` script that runs both in order.
- Migrations stay **reversible** (each `drizzle/*.sql` has a paired down step documented in the plan; RLS/policy
  migrations include `drop policy` down steps). This satisfies the charter's reversible-migration rule.

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
- `package.json` db scripts change: `db:generate`→`drizzle-kit generate`, `db:migrate`→ run drizzle + supabase
  migrations, `db:deploy`→`drizzle-kit migrate` + `supabase db push` for policies, `db:seed` unchanged (tsx), new
  `db:studio`→`drizzle-kit studio`. Supabase local stack via `supabase start`/`supabase stop`.
- ADR-0010's "throwaway Postgres (Docker/Neon)" becomes "**Supabase CLI local stack**" for integration + e2e; the
  pyramid (many unit, few integration, ~few e2e) and one-owning-layer rule are unchanged.
- Portability retained: Drizzle emits standard Postgres SQL; the app schema can move off Supabase. Supabase-only
  coupling is confined to `supabase/migrations/*` (RLS/Storage/Realtime) and the auth linkage.
