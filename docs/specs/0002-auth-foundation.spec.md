# Spec 0002 — Auth + data foundation

- Status: Built (I-004) + re-platformed (I-005)
- Depends on / supersedes recon: `OBS-010`, `OBS-011`, `OBS-020`, `OBS-122`, `OBS-131` (spec 0001).
- Source of behavior: the live product's auth flow (recon) for `OBS-*`; net-new server-side authz hardening as `FR-*`.
- Purpose: turn the frontend-first replica into an authenticated app with a real data seam, and **close the
  server-side authorization gap** (`OBS-122`/`OBS-131`): members can currently reach `/admin/*` and `/barista`
  guarded only by a client redirect.

> **Masking note (ADR-0002).** Membership-tier names are white-labeled; this spec uses the masked enum
> `{ REGULAR, PREMIUM, GOLD }`. The FE mocks use these masked codes and `app/(public)/__tests__/landing.test.tsx`
> asserts the client-identifying codes (`PERADI`/`RBA`) never render (OQ-3 resolved).

## Scope
**In:** `organizations` + `app_users` Drizzle/Supabase tables (DDL in `supabase/migrations/`) + dev seed; **Supabase Auth**
credentials (the credential lives in `auth.users`, not on `app_users`); login/signup wired to real auth; server-side route
authz (`middleware.ts`); `lib/db/users.ts` Drizzle repository (org-scoped); `lib/auth/policy.ts` `can()` (UX-only).
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
  single seeded organization, register the credential via **Supabase Auth** (which owns it — `app_users` carries no
  password column), and then sign the user in (→ `/dashboard`).
- **FR-005** (event-driven, conditional) — *When* signup is submitted with an email that already exists in the org,
  the system *shall not* create a user and *shall* return a generic "email already registered" error.
- **NFR-001** (ubiquitous) — Credentials *shall* be owned by **Supabase Auth** (`auth.users`); `app_users` *shall* carry
  **no password column at all**. The plaintext password *shall never* be persisted, logged, or returned by any repository read.

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
- **FR-021** (ubiquitous) — The schema *shall* finalize the `app_users` table (Drizzle mirror in `lib/db/schema.ts`;
  DDL in `supabase/migrations/0000_app_schema.sql`) with: `id`, `org_id` (FK→`organizations`), `auth_user_id`
  (FK→`auth.users`, nullable; links the domain profile to its Supabase-Auth credential), `email` (unique), `name`,
  `role` (enum), `membership_tier` (enum, default `REGULAR`), `time_credits` (default 0), `print_balance` (default 0),
  `created_at`, `updated_at`, `archived_at` (nullable, for soft-archive over hard-delete). **No password column** — the
  credential lives in `auth.users`. Applied as an ordered Supabase migration (`supabase db reset` re-applies fresh).
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
  Then a new `app_users` row exists with `role = MEMBER`, `org_id` = the seeded org, linked to a Supabase-Auth
  credential (**no password column** on `app_users`), and the visitor is signed in → `/dashboard`. (FR-004, NFR-001)
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
- **AC-023** — The credential lives in Supabase Auth, not on `app_users`.
  Given a created/seeded user,
  When the `app_users` row (and its migration DDL) is inspected,
  Then there is **no password column at all** on `app_users` — the credential is owned by `auth.users` (Supabase Auth).
  (NFR-001)

---

## Traceability (owning layer per ADR-0010 — full table in the plan)
| AC | Owning layer | Why |
|----|--------------|-----|
| AC-002 | E2E (Playwright) | real login form → session → role redirect across the stack (`e2e/AC-002-admin-login.spec.ts`) |
| AC-001 | Unit (Vitest) | role→home mapping is pure logic (`lib/auth/route-policy.test.ts`); the I-004 rebalance (ADR-0010) pulled it down from E2E |
| AC-003 | Unit (Vitest) | bad-credentials → generic no-enumeration error owned at the login-form unit layer (`app/(public)/login/__tests__/login-page.test.tsx`) |
| AC-005 | Integration (Drizzle) | duplicate-email rejection is a data-layer contract (`app/(public)/signup/actions.int.test.ts`) |
| AC-004 | Integration (Drizzle) | user-creation + Supabase-Auth credential contract owned at the data layer; e2e references it |
| AC-010, AC-011, AC-012, AC-013, AC-014, AC-015 | E2E (Playwright) | middleware request→redirect is only honestly provable end-to-end |
| AC-020 | Unit (Vitest) | jwt/session callback pure logic |
| AC-021 | Integration (Drizzle) | org_id scoping against the Supabase local stack |
| AC-022 | Unit (Vitest) | pure `can()` policy |
| AC-023 | Integration (Drizzle) | inspect the persisted row / migration DDL (no password column) |

## Resolution notes (settled during I-004 → I-005 re-platform)

These were open at the I-004 draft; the re-platform to Supabase + Drizzle + Supabase Auth (ADR-0013/0014/0015) settled them.

- **OQ-1 → resolved (ADR-0014):** credential storage is **Supabase Auth** (`auth.users`); there is no app-side password
  column and no hashing dependency (the legacy hashing library was removed in I-005).
- **OQ-2 → resolved (ADR-0004, revised by ADR-0014 §3):** authz via root `middleware.ts` reading the Supabase session
  via `getUser()`. The route-gate decision is preserved; only the *session source* moved (from the old credentials
  provider's JWT to the Supabase session cookie).
- **OQ-3 → resolved (masking):** the FE mocks use the masked enum `{REGULAR, PREMIUM, GOLD}`, and
  `app/(public)/__tests__/landing.test.tsx` asserts the client-identifying codes (`PERADI`/`RBA`) never render.
- **OQ-4 → resolved (seed):** the dev seed creates admin/budi/barista from `SEED_*` env vars (dev-only fallbacks,
  never committed) against the Supabase local stack.
- **OQ-5 → resolved (ADR-0010/0015):** integration tests run against the **Supabase CLI local stack** (`supabase start`);
  CI provisions the same. `TEST_DATABASE_URL`/`DATABASE_URL` point at the local stack DB; tests truncate between runs.
