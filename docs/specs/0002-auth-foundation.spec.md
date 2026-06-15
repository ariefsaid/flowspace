# Spec 0002 — Auth + data foundation

- Status: Draft (for I-004)
- Depends on / supersedes recon: `OBS-010`, `OBS-011`, `OBS-020`, `OBS-122`, `OBS-131` (spec 0001).
- Source of behavior: the live product's auth flow (recon) for `OBS-*`; net-new server-side authz hardening as `FR-*`.
- Purpose: turn the frontend-first replica into an authenticated app with a real data seam, and **close the
  server-side authorization gap** (`OBS-122`/`OBS-131`): members can currently reach `/admin/*` and `/barista`
  guarded only by a client redirect.

> **Masking note (ADR-0002).** Membership-tier names are white-labeled. This spec uses the masked enum
> `{ REGULAR, PREMIUM, GOLD }`. The current `lib/mock/*` leaks client-identifying tier codes (`PERADI_RBA`,
> `PERADI_SUARA`, `PERADI_DPC`) — see Open Question OQ-3; those mocks are FE-only and out of this issue's data scope,
> but must be masked before any are committed to a brand-visible surface.

## Scope
**In:** `Organization` + `AppUser` Prisma models + first reversible migration + dev seed; NextAuth v5 Credentials
auth (`lib/auth.ts`, `app/api/auth/[...nextauth]`); login/signup wired to real auth; server-side route authz
(middleware); `lib/db/users.ts` repository (org-scoped); `lib/auth/policy.ts` `can()` (UX-only).
**Out (follow-up issues):** booking/cafe/print/transaction tables and wiring those pages to live data; password
reset & email; OAuth; admin user-management writes; Postgres RLS.

## Roles (server-trusted)
`Role = { MEMBER, ADMIN, BARISTA }`. Role lives on `AppUser.role` and is carried in the JWT/session (ADR-0003).

---

## Functional requirements (EARS)

### Authentication
- **FR-001** (event-driven) — *When* a visitor submits the login form with an email and password that match a
  non-archived `AppUser` in the org, the system *shall* establish an authenticated session carrying that user's
  `id`, `role`, and `orgId`. (Realizes `OBS-010`.)
- **FR-002** (event-driven) — *When* a visitor submits login credentials that do not match any non-archived user
  (unknown email or wrong password), the system *shall* reject the attempt without creating a session and *shall*
  return the visitor to `/login` with a generic error (no user-enumeration: same message for unknown-email and
  wrong-password).
- **FR-003** (event-driven) — *When* authentication succeeds, the system *shall* route the user by role:
  `ADMIN → /admin`, `BARISTA → /barista`, `MEMBER → /dashboard` (or to the original `callbackUrl` if it is a path
  the user's role may access). (Realizes/generalizes `OBS-011`.)
- **FR-004** (event-driven) — *When* a visitor submits the signup form with a name, a unique email, and a password
  (≥6 chars, matching its confirmation), the system *shall* create a new `AppUser` with `role = MEMBER` in the
  single seeded organization, hash the password (bcrypt), and then sign the user in (→ `/dashboard`).
- **FR-005** (event-driven, conditional) — *When* signup is submitted with an email that already exists in the org,
  the system *shall not* create a user and *shall* return a generic "email already registered" error.
- **NFR-001** (ubiquitous) — Passwords *shall* be stored only as a bcrypt hash (cost ≥10); the plaintext password
  *shall never* be persisted, logged, or returned by any repository read.

### Server-side authorization (the security fix — FR-010..FR-014 realize the OBS-122/131 fix)
- **FR-010** (state-driven) — *While* a request targets a protected path and carries **no** valid session, the
  system *shall* redirect to `/login?callbackUrl=<path>` **before** rendering the route (no protected content/data
  served pre-redirect).
- **FR-011** (state-driven, conditional) — *While* an authenticated user whose `role` is **not** `ADMIN` requests
  `/admin` or any `/admin/*` path, the system *shall* deny server-side and redirect to the user's role home
  (never render admin content). (Closes `OBS-131`.)
- **FR-012** (state-driven, conditional) — *While* an authenticated user whose `role` is **neither** `BARISTA`
  **nor** `ADMIN` requests `/barista`, the system *shall* deny server-side and redirect to the user's role home.
  (Closes `OBS-122` — `/barista` is currently un-gated.)
- **FR-013** (state-driven) — *While* any authenticated user (any role) requests a member path
  (`/dashboard`, `/booking`, `/cafe`, `/print`, `/keycard`, `/topup`, `/history`), the system *shall* allow it.
- **FR-014** (ubiquitous) — Public paths (`/`, `/login`, `/signup`, `/cafe/guest`, `/api/auth/*`, static assets)
  *shall* be reachable without a session.
- **OBS-122 / OBS-131 (carried forward):** the existing client nav/redirect remains as UX only; it is **not** the
  authorization boundary (FR-010..FR-013 are).

### Data seam & tenancy
- **FR-020** (ubiquitous) — Every `AppUser` read exposed by `lib/db/users.ts` *shall* be scoped to the caller's
  `orgId` (resolved server-side from the session); the client *shall never* supply `orgId`.
- **FR-021** (ubiquitous) — The schema *shall* finalize `AppUser` with: `id`, `orgId` (FK→Organization),
  `email` (unique), `name`, `passwordHash`, `role` (enum), `membershipTier` (enum, default `REGULAR`),
  `timeCredits` (default 0), `printBalance` (default 0), `createdAt`, `updatedAt`, `archivedAt` (nullable, for
  soft-archive over hard-delete). camelCase fields `@map` to snake_case; `@@index([orgId])`. Migration reversible.
- **FR-022** (ubiquitous) — A dev seed *shall* create one organization and three users so the existing UI renders
  against real rows: an **admin**, a **member** "Budi" (`membershipTier = PREMIUM`, `timeCredits = 139`,
  `printBalance = 68` — matching the mock the dashboard already renders, `OBS-056`), and a **barista**.

### `can()` policy (UX-only)
- **FR-030** (ubiquitous) — `can(action, entity, ctx)` in `lib/auth/policy.ts` *shall* be a pure UX helper for
  showing/hiding affordances; it *shall not* be the authorization boundary (server middleware + org-scoped repo are).
  `can("access", "admin", { role })` is true iff `role === ADMIN`; `can("access", "barista", { role })` is true iff
  `role ∈ {ADMIN, BARISTA}`.

---

## Acceptance criteria (Given/When/Then)

### Login & routing
- **AC-001** — Login success seeds a session by role.
  Given a non-archived `MEMBER` "budi@…" with a known password,
  When they submit valid credentials at `/login`,
  Then a session is established whose `user.role = MEMBER`, `user.orgId` is the seeded org, and they land on `/dashboard`.
  (FR-001, FR-003)
- **AC-002** — Admin login routes to `/admin`.
  Given a non-archived `ADMIN`,
  When they log in with valid credentials,
  Then their session `user.role = ADMIN` and they land on `/admin`. (FR-001, FR-003; realizes `OBS-011`.)
- **AC-003** — Bad credentials are rejected (no enumeration).
  Given any email,
  When the password is wrong (or the email is unknown),
  Then no session is created, the user stays on `/login`, and the error is the **same generic message** for both
  unknown-email and wrong-password. (FR-002)

### Signup
- **AC-004** — Signup creates a MEMBER and signs in.
  Given an email not yet registered in the org,
  When a visitor submits signup (name, email, password ≥6 = confirmation),
  Then a new `AppUser` exists with `role = MEMBER`, `orgId` = the seeded org, a bcrypt `passwordHash` (never the
  plaintext), and the visitor is signed in → `/dashboard`. (FR-004, NFR-001)
- **AC-005** — Duplicate-email signup is rejected.
  Given an email already registered,
  When signup is submitted with that email,
  Then no second user is created and a generic "email already registered" error is shown. (FR-005)

### Server-side authorization (the key security ACs)
- **AC-010** — **Member is blocked server-side from `/admin`.**
  Given an authenticated `MEMBER`,
  When they navigate to `/admin` (and to a sub-path `/admin/users`),
  Then the server denies before rendering and redirects them to `/dashboard`; **no admin content or data is served**.
  (FR-011; closes `OBS-131`.)
- **AC-011** — **Member is blocked server-side from `/barista`.**
  Given an authenticated `MEMBER`,
  When they navigate to `/barista`,
  Then the server denies before rendering and redirects them to `/dashboard`. (FR-012; closes `OBS-122`.)
- **AC-012** — Admin reaches `/admin`.
  Given an authenticated `ADMIN`,
  When they navigate to `/admin`,
  Then the admin dashboard renders (no redirect). (FR-011 inverse)
- **AC-013** — Barista reaches `/barista`; admin may too.
  Given an authenticated `BARISTA` (and separately an `ADMIN`),
  When they navigate to `/barista`,
  Then the KDS renders (no redirect). (FR-012 inverse)
- **AC-014** — Unauthenticated visitor is redirected to login.
  Given no session,
  When a visitor requests `/dashboard` (a protected path),
  Then they are redirected to `/login?callbackUrl=/dashboard` and no protected content is served. (FR-010)
- **AC-015** — Public paths stay open.
  Given no session,
  When a visitor requests `/`, `/login`, `/signup`, or `/cafe/guest`,
  Then the page renders without redirect. (FR-014)

### Session shape & tenancy
- **AC-020** — Session carries role + orgId.
  Given a signed-in user,
  When the session/JWT callbacks run,
  Then `session.user.id`, `session.user.role`, and `session.user.orgId` are populated from the `AppUser`. (FR-001)
- **AC-021** — User reads are `org_id`-scoped.
  Given two organizations each with a user of the same email-domain,
  When `lib/db/users.ts` reads users for org A's context,
  Then only org A's rows are returned; org B's rows are never returned even by id lookup outside the scope. (FR-020)
- **AC-022** — `can()` is correct and UX-only.
  Given a `role`,
  When `can("access","admin",{role})` / `can("access","barista",{role})` is evaluated,
  Then it is true exactly for `ADMIN` / for `{ADMIN,BARISTA}` respectively, and the module documents that it is not
  the security boundary. (FR-030)
- **AC-023** — Passwords are never persisted in plaintext.
  Given a created/seeded user,
  When the row is inspected,
  Then `passwordHash` is a bcrypt hash and there is no plaintext-password column or field anywhere. (NFR-001)

---

## Traceability (owning layer per ADR-0010 — full table in the plan)
| AC | Owning layer | Why |
|----|--------------|-----|
| AC-001, AC-002 | E2E (Playwright) | real login form → session → role redirect across the stack |
| AC-003, AC-005 | E2E (Playwright) | real form error path |
| AC-004 | Integration (Prisma) | user-creation + hash contract owned at the data layer; e2e references it |
| AC-010, AC-011, AC-012, AC-013, AC-014, AC-015 | E2E (Playwright) | middleware request→redirect is only honestly provable end-to-end |
| AC-020 | Unit (Vitest) | jwt/session callback pure logic |
| AC-021 | Integration (Prisma) | org_id scoping against a real test DB |
| AC-022 | Unit (Vitest) | pure `can()` policy |
| AC-023 | Integration (Prisma) | inspect the persisted row / schema |

## Open questions (need Director/owner sign-off)
- **OQ-1 (decided in ADR-0003, confirm):** password hashing = `bcryptjs` cost 10 (vs argon2id). OK?
- **OQ-2 (decided in ADR-0004, confirm):** authz via root `middleware.ts` (vs per-layout server guards). OK?
- **OQ-3 (masking):** the FE mocks (`lib/mock/admin.ts`, `member.ts`, `lib/mock/types.ts` doc-comment) carry
  client-identifying tier codes (`PERADI_*`). Mask to `{REGULAR,PREMIUM,GOLD}` now, or track as a separate cleanup
  issue? (This issue's *data* model uses the masked enum regardless.)
- **OQ-4 (seed vs real data):** seed-only demo users for now (admin/budi/barista), real signup creates members.
  Confirm seed passwords come from env (`SEED_ADMIN_PASSWORD`, …) with dev-only fallbacks, never committed.
- **OQ-5 (test DB):** integration tests run against local Docker Postgres or a Neon test branch (per
  `docs/environments.md`). Confirm the CI choice (plan assumes a `TEST_DATABASE_URL` env + a separate node-env
  Vitest project; CI provisions a throwaway DB).
