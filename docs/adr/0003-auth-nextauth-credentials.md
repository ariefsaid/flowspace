# ADR-0003 — Auth: NextAuth/Auth.js v5 Credentials + JWT session shape

- Status: **Superseded by [ADR-0014](0014-auth-supabase.md)** (Supabase Auth; the full NextAuth body below is kept as history)
- Date: 2026-06-15
- Issue: I-004 (auth + data foundation)

## Context
The replica is currently frontend-first: login/signup are client stubs that `router.push("/dashboard")`
unconditionally, and there is no real session, no identity, and no server-trusted role/tenant (see
`OBS-010`/`OBS-011`). We need real authentication and an identity the server can trust for authorization
(`OBS-122`/`OBS-131` — the client-only admin guard is a security defect). The stack is already committed to
**NextAuth/Auth.js v5** (ADR-0001, `next-auth@5.0.0-beta.*` is in `package.json`). The original product uses
email + password (no OAuth observed in recon). Out of scope this issue: password reset/email, OAuth, magic links.

## Decision
1. **Provider:** a single **Credentials** provider (email + password). No DB adapter is needed for Credentials —
   we own the user table (`AppUser`) and verify the password ourselves, then return a user object that seeds the JWT.
2. **Password hashing:** **bcrypt** via the pure-JS **`bcryptjs`** package (no native build; works in the Node
   runtime used by the auth route and the seed). Cost factor **10**. (`argon2` was considered but pulls a native
   addon and complicates CI/serverless; bcrypt at cost 10 is the pragmatic, widely-audited default. Revisit if a
   threat model demands argon2id.)
3. **Session strategy:** **JWT** (`session.strategy = "jwt"`), not database sessions. The JWT is the seam that
   carries identity to the Edge middleware without a DB round-trip on every request.
4. **Session shape (the contract every consumer depends on):**
   - `jwt` callback: on sign-in, copy `user.id → token.sub`, `user.role → token.role`, `user.orgId → token.orgId`.
   - `session` callback: expose `session.user.id`, `session.user.role` (`Role`), `session.user.orgId` (`string`).
   - Module augmentation in `types/next-auth.d.ts` adds `id`/`role`/`orgId` to `Session["user"]` and `User`, and
     `role`/`orgId` to the JWT, so the shape is type-checked end-to-end.
5. **`authorize()`** loads the user by email via the repository seam (`lib/db/users.ts → findByEmail`), rejects
   archived users (`archivedAt != null`) and bad passwords by returning `null` (NextAuth surfaces
   `CredentialsSignin`), and on success returns `{ id, email, name, role, orgId }`.
6. **Split config (Edge-safe).** `lib/auth.config.ts` holds the Edge-safe pieces (callbacks, pages, the
   `authorized` route matcher) with **no Prisma/bcrypt imports** so it can run in the middleware (Edge) runtime.
   `lib/auth.ts` spreads that config and adds the Credentials provider (which imports Prisma + bcrypt) and runs in
   the Node runtime. This is the documented Auth.js v5 pattern for using middleware without bundling Prisma into Edge.
7. **Single org for signup.** Signup creates a `MEMBER` in the single seeded organization (resolved server-side by
   the org slug from env / the one seeded org). The client never sends `orgId`.

## Consequences
- The JWT shape (`id`/`role`/`orgId`) is a hard contract: middleware authz, `lib/db` org-scoping, and `can()` all
  read it. Changing it is a breaking change — it lives in one augmentation file and one set of callbacks.
- Credentials provider means **no NextAuth Prisma adapter** and no `Account`/`Session`/`VerificationToken` tables
  this issue — less schema surface now; if we later add OAuth we add the adapter + those tables (a future ADR).
- `bcryptjs` is pure-JS (slightly slower than native bcrypt) — acceptable at login frequency; the cost is bounded.
- The Edge/Node split is mandatory: importing Prisma into the middleware bundle breaks the Edge build. Tasks
  enforce the split.
