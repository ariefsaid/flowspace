# ADR-0014 — Authentication: Supabase Auth (server-authoritative) replacing NextAuth Credentials

- Status: Accepted
- Date: 2026-06-16
- Issue: I-005 (backend re-platform to Supabase + Drizzle + Supabase Auth)
- Supersedes: [ADR-0003](0003-auth-nextauth-credentials.md) (NextAuth/Auth.js v5 Credentials). Implements the auth
  half of [ADR-0013](0013-backend-platform-supabase.md). The **route-gate decision** of
  [ADR-0004](0004-server-side-authz-middleware.md) is preserved (same policy table, same fail-closed semantics);
  only the *session source* the middleware reads changes (JWT-in-cookie → Supabase session cookie).

## Context
ADR-0003 chose NextAuth v5 Credentials (email+password, bcrypt, JWT session) over a Prisma `AppUser`. ADR-0013
re-platforms the backend onto Supabase, whose **Auth** primitive owns users (`auth.users`), issues the session,
and is the thing that authorises Realtime channels and RLS policies. Running NextAuth *and* Supabase Auth in
parallel would mean two identity systems, two session cookies, and a hand-rolled bridge to RLS — strictly worse.
This issue is **behavior-preserving**: every I-004 acceptance criterion (especially AC-003 no-enumeration,
AC-010/011 member-blocked-server-side, AC-014 unauth-redirect, AC-020 session-shape, AC-023 no-plaintext) must
still pass on the new stack.

## Decision

### 1. Supabase Auth owns identity; an app-side profile row carries domain attributes
- Credentials (email + password) authenticate via Supabase Auth (`signInWithPassword` /
  `signUp`). **Supabase stores and hashes the password** (bcrypt, in the managed `auth.users` table) — we no
  longer persist `password_hash` ourselves. This *strengthens* AC-023: there is **no** password column on any
  application table at all.
- An application-owned profile table **`app_users`** carries the domain attributes the product needs and Supabase
  Auth does not model: `org_id` (the tenancy/location seam), `role` (`MEMBER`/`ADMIN`/`BARISTA`),
  `membership_tier`, `time_credits`, `print_balance`, `name`, `archived_at`. It is linked 1:1 to the identity by
  **`auth_user_id uuid` → `auth.users.id`** (unique, FK, `on delete cascade`). `email` remains a unique mirror for
  lookups/joins.
- **Profile creation is server-side and transactional with signup** (not a DB trigger): the signup server action
  calls `supabase.auth.admin`/`signUp` to mint the `auth.users` row, then `createMember(...)` inserts the linked
  `app_users` row in the same request. Rationale: a trigger cannot supply `org_id` (resolved from the seeded org
  server-side) without coupling auth schema to app schema, and the server is already the enforcement authority.
  The `app_users.auth_user_id` unique constraint is the integrity backstop if a partial failure occurs (re-running
  signup upserts the profile rather than duplicating it). The signup action is **transactional on failure**: if the
  profile insert fails after `admin.createUser` succeeds, the just-created auth user is deleted (`admin.deleteUser`)
  so no orphan identity is left behind (the `app_users_auth_user_fk` ON DELETE CASCADE FK is live).

- **`app_metadata` (role / org_id) is admin-API-only — NEVER client-writable.** The `role` and `org_id` JWT claims
  the edge gate and RLS trust are set **only** via the service-role admin API (`admin.createUser`/
  `admin.updateUserById`) at signup and on a server-side role change. No client-reachable (`"use client"`) module
  may call `auth.updateUser` with `app_metadata`/`role`/`org_id` — that would let a user forge their own
  role/tenant claim and escalate privileges. The guard test
  `lib/supabase/no-client-metadata-write.test.ts` scans the source and fails if any client module ever does. **Prod
  GoTrue MUST NOT run any hook that copies `user_metadata` → `app_metadata`** (that would re-open the same
  self-elevation hole); app_metadata is written solely by the server admin API.

### 2. Session shape contract is preserved at the `lib/auth/session.ts` seam
The rest of the app consumes a trusted server-resolved user `{ id, role, orgId, email, name }` — unchanged from
ADR-0004. Concretely:
- `getSessionUser()` / `requireSession()` keep their **exact signatures and return shape**. Internally they now:
  read the Supabase session server-side (`@supabase/ssr` server client → `auth.getUser()`), then resolve the
  linked `app_users` row to attach `role` + `orgId`. `id` is the **`app_users.id`** (the domain id callers already
  use), not the `auth.users` uuid — so `orgId`-scoped repository calls are untouched.
- The JWT/session callback logic that AC-020 owns moves to a **pure mapper** `lib/auth/session-claims.ts`
  (`toSessionUser(authUser, profile) → { id, role, orgId, email, name }`), unit-tested with the same AC-020
  assertions. The NextAuth `jwt`/`session` callbacks (`lib/auth.config.ts`) are deleted; their behavior is this
  mapper.

### 3. The Edge middleware reads the Supabase session (route-gate decision unchanged)
- `middleware.ts` keeps the ADR-0004 contract: short-circuit **before** RSC render; consult the single source of
  truth `lib/auth/route-policy.ts` (`requiredRolesFor`, `roleHome`); fail closed on unknown paths.
- It reads the session via `@supabase/ssr`'s `createServerClient` bound to the request/response cookies and calls
  **`supabase.auth.getUser()`** (network-validated against Supabase Auth — the documented safe check; never trust
  an unverified `getSession()` cookie at a trust boundary). The user's **role** for the gate is read from the
  Supabase JWT **app-metadata claim** `role` (mirrored onto the token at signup/role-change via the admin API), so
  the middleware needs **no DB round-trip** — preserving the ADR-0004 "Edge-fast, JWT-only" property. `org_id` is
  likewise mirrored as a claim for Realtime/RLS; the **authoritative** `orgId` for data access is still
  re-resolved server-side in `lib/auth/session.ts` (the claim is a convenience, the `app_users` row is the truth).
- **DECISION FLAGGED FOR OWNER (OQ-A):** `getUser()` adds one Supabase Auth round-trip per protected navigation at
  the edge. Alternative: verify the JWT signature locally with the project JWT secret (zero round-trip) and accept
  the small staleness window on revocation. Recommended: start with `getUser()` for correctness; optimise to local
  verify only if edge latency proves a problem (record as a follow-up). Either way the *gate logic* is identical.

### 4. RLS is a defense-in-depth backstop, not the gate
Per ADR-0013, the server (route handlers / server actions / `org_id`-scoped repository) is the enforcement
authority. RLS policies on `app_users` (and future business tables) enforce `org_id`/location isolation as a second
line, keyed on the `org_id` claim. One integration proof (a cross-org row is invisible under a scoped role)
documents the backstop; we do **not** push the authoritative tenancy assertion down to RLS. (Detail + the Drizzle
choice in [ADR-0015](0015-drizzle-rls-on-supabase.md).)

## Consequences
- **Stronger no-plaintext posture (AC-023):** no application password column exists; the assertion becomes "no
  `password*` column on `app_users`, and Supabase manages the credential". Owning layer stays integration.
- **AC-003 no-enumeration preserved:** the login surface maps every Supabase Auth failure (wrong password, unknown
  email, unconfirmed) to the **same** generic message `"Email atau kata sandi salah."`. Supabase's
  `signInWithPassword` already returns an opaque `Invalid login credentials` for both wrong-password and
  unknown-email, so enumeration resistance is inherited; the login component still normalises any error to the one
  message. The timing-decoy (`DUMMY_BCRYPT_HASH`) in `authorize.ts` is **removed** — Supabase owns credential
  verification and its own timing profile; we no longer run bcrypt.
- **AC-010/011/014 preserved:** the middleware gate and its policy table are unchanged; only the session read swaps.
  The member-blocked e2e is the single owning proof, re-run on the new stack.
- **Email confirmation:** Supabase Auth defaults to email-confirm-required. For behavior parity with I-004
  (signup → immediately signed in → `/dashboard`, AC-004), **dev/test disables email confirmation**
  (`enable_confirmations = false` in `supabase/config.toml`); production confirmation policy is a deferred decision
  (OQ-C). Until then signup signs the user in directly.
- **Deferred (own ADR/issue when they land):** OAuth providers, phone/OTP, password reset + email templates,
  production email-confirmation flow, MFA. Noted, not built here.
- **Lock-in:** auth is now Supabase-coupled. Mitigated by the `lib/auth/session.ts` seam (the app depends on the
  shape, not the provider) and `lib/auth/route-policy.ts` (provider-agnostic decision logic).
