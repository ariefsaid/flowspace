# ADR-0004 — Server-side authorization: middleware route-gate + `org_id` seam

- Status: Accepted
- Date: 2026-06-15
- Issue: I-004 (auth + data foundation)

## Context
Recon found the security gap this issue must close (`OBS-122`, `OBS-131`): admin routes are guarded **client-side
only** — a member is briefly served `/admin/*` then redirected, and `/barista` is not gated at all. The charter
makes **server-side authz the enforcement authority**; the client nav/redirect is UX only and may be stricter than
the server but is never the gate. We need: unauthenticated → `/login`; `/admin/*` → ADMIN; `/barista` → BARISTA or
ADMIN; member routes → any authenticated user. We also need every user **read** scoped to the caller's `org_id`.

## Decision
1. **Middleware as the primary route gate.** A single `middleware.ts` at the repo root runs Auth.js v5's
   `auth((req) => …)` wrapper. It reads the JWT (`req.auth`) — no DB call — and enforces, before the page renders:
   - no session on a protected path → redirect to `/login?callbackUrl=…`;
   - `/admin` or `/admin/*` requires `role === "ADMIN"`;
   - `/barista` requires `role === "ADMIN" || role === "BARISTA"`;
   - member paths (`/dashboard`, `/booking`, `/cafe`, `/print`, `/keycard`, `/topup`, `/history`) require any
     authenticated session;
   - a non-permitted authenticated user is redirected to their role's home (`MEMBER→/dashboard`, `BARISTA→/barista`,
     `ADMIN→/admin`) — never served the protected content. Public paths (`/`, `/login`, `/signup`, `/cafe/guest`,
     `/api/auth/*`) pass through.
   The matcher excludes `_next/static`, `_next/image`, favicon, and static assets.
   Because middleware short-circuits **before** RSC render, content/data cannot leak pre-redirect (the `OBS-131`
   defect). The route segment table mapping (which prefixes need which role) lives in `lib/auth/route-policy.ts`
   and is imported by both the middleware and `lib/auth.config.ts`'s `authorized` callback so there is one source
   of truth.
2. **Defense in depth at the data seam.** Middleware gates *navigation*; the repository layer gates *data*. Every
   query in `lib/db/users.ts` takes the caller's `orgId` (resolved server-side from the session via
   `lib/auth/session.ts → requireSession()`), and the `WHERE` is always `org_id`-scoped. The client never supplies
   `orgId`. A future per-route handler / server action follows the same rule. (Neon Postgres RLS remains optional
   future hardening per ADR-0001 — not in this issue.)
3. **`can(action, entity, ctx)` is UX-only.** `lib/auth/policy.ts` exports a pure `can()` used by components to
   show/hide affordances. It is explicitly **not** an authorization boundary — the middleware and the `org_id`-scoped
   repository are. This is stated in the policy module's doc comment and asserted by a unit test.
4. **Why middleware over per-layout guards.** Per-`layout.tsx` server guards are easy to forget on a new route and
   run *after* the segment begins resolving. A single middleware is the one choke point, is Edge-fast (JWT only),
   and fails closed (unknown protected path → require auth). Trade-off: middleware can't do per-row ownership — that
   is precisely why the repository layer (point 2) is the second, authoritative line for data.

## Consequences
- One file (`middleware.ts`) + one policy table (`lib/auth/route-policy.ts`) is the navigation authority; adding a
  protected route means adding one entry, not remembering a per-page guard.
- The `org_id` seam is enforced at the only place that touches the DB (`lib/db/*`), keeping multi-venue future open.
- `can()` drift (FE hiding something the server still allows, or vice-versa) is a UX bug, never a security hole,
  because the server is independently authoritative — proven by an integration test (member blocked from admin data)
  separate from the unit test of `can()`.
- The middleware authz outcomes (member→/admin blocked, member→/barista blocked, admin→/admin allowed) are owned by
  an **e2e** test (only Playwright exercises the real request → middleware → redirect across the stack); `org_id`
  scoping of reads is owned by a **Prisma integration** test. (Traceability table in the plan.)
