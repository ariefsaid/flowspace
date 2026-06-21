# Environments (binding) — Supabase (post-I-005, ADR-0013)

## Registry
| Env | Backend | Purpose | Who deploys |
|---|---|---|---|
| **local** | Supabase CLI local stack (Docker) | dev + unit/integration/e2e tests | anyone |
| **preview** | (deferred) Supabase preview/branch per PR | review apps | CI / Vercel |
| **prod** | A Supabase project — **cloud vs self-host + Indonesia data-residency deferred + owner-gated** | production | owner-approved only |

## Rules
- **DB of record = `supabase/migrations/`** — one ordered source. Applies every `.sql` in filename order; the
  full set on `main` is `0000`–`0007`:
  `0000_app_schema.sql` (enums + `organizations` + `app_users`) ·
  `0001_auth_link.sql` (FK to `auth.users` + `current_org()`) ·
  `0002_rls_app_users.sql` / `0004_rls_organizations.sql` (RLS) ·
  `0003_storage_bucket.sql` (storage bucket) ·
  `0005_cafe_domain.sql` (cafe tables + RLS + Realtime) ·
  `0006_domain_verticals.sql` (bookings/packages/print/transactions) ·
  `0007_print_storage.sql` (print-storage bucket widen).
  The Supabase CLI applies **every `.sql` in `supabase/migrations/` in filename order** at init — so down-migrations live
  in `supabase/migrations/_down/` (the CLI has no down concept), never in the applied dir.
- **`drizzle-orm` is the query layer** (`lib/db/schema.ts` mirrors the SQL); drizzle-kit is NOT the DDL authority.
- **Fresh apply is the contract.** `pnpm exec supabase db reset` re-applies all migrations on an empty DB — this is
  exactly what CI does, so it's the load-bearing local check before a push. Never assume a pre-seeded stack.
- **Local quickstart:**
  ```bash
  pnpm sb:start                 # Supabase CLI local stack (API 64321 / DB 64322 for this project)
  pnpm exec supabase db reset   # fresh apply of all migrations
  pnpm db:seed:supabase         # org + admin/member/barista (Supabase Auth users + app_users rows)
  pnpm dev                      # http://localhost:3000
  ```
  Tests: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:64322/postgres pnpm test:int` · `pnpm e2e` (seed first).
  > Ports are 64321/64322 (not the 54321 default) to avoid clashing with other local Supabase projects on this host.
- **Secrets** (`SUPABASE_SERVICE_ROLE_KEY`, DB url, anon key) live in env / the host secret store — **never committed**.
  The **service-role key is server-only** — never `NEXT_PUBLIC_*`, never in a client/edge bundle. `.env.example` is the
  only env file in the repo (placeholders only; local stack uses the well-known Supabase demo keys).
- **`app_metadata` (role/org_id) is admin-API-only** — never client-writable; prod GoTrue must have no hook copying
  `user_metadata`→`app_metadata` (the edge gate + RLS trust this claim). See ADR-0014.
- **Prod is owner-gated.** Production deploy + the cloud-vs-self-host decision require explicit owner approval.

## CI (.github/workflows/ci.yml)
- `quality` job: install · typecheck · lint:ci · test:unit · build (no DB).
- `integration-and-e2e` job: `supabase start` (provisions the full schema from `supabase/migrations/`) · `pnpm test:int`
  · `pnpm db:seed:supabase` · build · `pnpm e2e`.
