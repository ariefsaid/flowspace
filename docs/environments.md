# Environments (binding)

## Registry
| Env | Database | Purpose | Who deploys |
|---|---|---|---|
| **local** | Local Postgres (Docker) **or** a Neon dev branch | day-to-day dev + unit/integration tests | anyone |
| **preview** | Neon preview branch (per PR, optional) | review apps | CI / Vercel |
| **prod** | Neon **main** branch | production | owner-approved only |

## Rules
- **Test on a throwaway DB.** Run `pnpm db:migrate` against your local/branch DB. Never run an untested migration
  against prod.
- **Migrations are reversible.** Every schema change is a Prisma migration committed under `prisma/migrations/`.
  Apply to prod with `pnpm db:deploy` (runs `prisma migrate deploy`) — never `db push` to prod, never hand-edit a
  cloud schema.
- **Secrets never in the repo.** `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, and any provider keys live in the
  host's env/secret store (Vercel/Neon dashboards or a local `.env` that is gitignored). `.env.example` is the only
  env file committed, and it holds **placeholders only**.
- **Neon specifics.** Use the **pooled** connection string for `DATABASE_URL` (serverless/Edge runtime) and the
  **direct** connection for `DIRECT_URL` (Prisma migrations). Prefer a Neon **branch** per environment so prod data
  is never touched by dev/test.
- **Prod is owner-gated.** Production deploys and any irreversible infra change require explicit owner approval
  (per the charter). The Director never deploys prod autonomously.

## Local Postgres (Docker) quickstart
```bash
docker run --name flowspace-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
# .env: DATABASE_URL="postgresql://postgres:postgres@localhost:5432/flowspace?schema=public"
#       DIRECT_URL="postgresql://postgres:postgres@localhost:5432/flowspace?schema=public"
pnpm db:migrate
```
