# ADRs — status index

Architecture Decision Records. Numbered; the canonical status lives in the first lines of each file and is
mirrored in the table below. New ADRs append the next free number (do **not** reuse a retired number).

| # | Decision | Status | Notes |
|---|----------|--------|-------|
| [0001](0001-stack-nextjs-prisma-neon.md) | Stack: Next.js + Prisma + Postgres (Neon) | **Superseded (backend) by ADR-0013** | Frontend stack (Next.js 15 / React 19 / Tailwind) still stands; body kept as history. |
| [0002](0002-white-label-brand-seam.md) | White-label brand seam | **Accepted** | |
| [0003](0003-auth-nextauth-credentials.md) | Auth: NextAuth/Auth.js v5 Credentials | **Superseded by ADR-0014** | Body kept as history (Supabase Auth replaces it). |
| [0004](0004-server-side-authz-middleware.md) | Server-side authz: middleware route-gate | **Accepted — Revised by ADR-0014 §3** | Route-gate decision preserved; session source → Supabase `getUser()`. |
| 0005–0009 | — | *(absent on `main`)* | Numbers unused on this branch. |
| [0010](0010-test-strategy-pyramid.md) | Test strategy: the pyramid | **Accepted** | Revised 2026-06-16 (I-005): integration/e2e DB = Supabase CLI local stack. |
| 0011 | *(not on `main`)* | *(lives on `feat/cafe-domain`)* | Cafe discount eligibility — lands with the cafe rebuild. |
| 0012 | *(not on `main`)* | *(lives on `feat/cafe-domain`)* | Order-code generation — lands with the cafe rebuild. |
| [0013](0013-backend-platform-supabase.md) | Backend platform: Supabase + Drizzle + Supabase Auth | **Accepted** | Supersedes ADR-0001 (backend). |
| [0014](0014-auth-supabase.md) | Auth: Supabase Auth (server-authoritative) | **Accepted** | Supersedes ADR-0003; revises ADR-0004 §3 + ADR-0010's test-DB. |
| [0015](0015-drizzle-rls-on-supabase.md) | Data layer: Drizzle + ordered Supabase migrations; RLS backstop | **Accepted** | §2 revised (I-005 CI fix): `supabase/migrations/` is the single DDL source; drizzle-kit is not the DDL authority. |

> **Gaps:** 0005–0009 are absent on `main` (numbers unused). **0011** and **0012** exist only on the shelved
> `feat/cafe-domain` branch and land with the cafe rebuild — do not cite them as if present on `main`.
