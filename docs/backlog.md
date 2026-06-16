# Backlog — issue-driven roadmap

One issue at a time (Director loop). Each issue: Intake → Spec → Plan → Build → Review → Accept → (design re-review) → Ship.
Surfaces come from `docs/specs/0001-recon-app-surface.spec.md`.

> **⚑ Backend re-platform decided (2026-06-16, ADR-0013):** moving Prisma/Neon/NextAuth → **Supabase (Postgres +
> Auth + Realtime + Storage + RLS) + Drizzle**, server-authoritative, per-venue on-prem agent, ESB/ERP-later.
> Frontend + the 21-route replica + the agentic workflow are unchanged. **I-005** is the re-platform; the domain
> verticals (cafe/booking/print/…) rebuild on the new foundation after it.

## Phase 0 — Foundation
- [x] **I-000** Repo + agentic workflow scaffold (agents, skills vendoring, docs, CI, white-label seam).
- [x] **I-001** Member + barista recon pass — captured `/dashboard /booking /cafe /print /keycard /topup /history` + `/barista` (KDS). Spec 0001 updated.
- [x] **I-010..I-037 (frontend)** 21-route pixel replica built + hardened (~95 fidelity), merged. (Pixel work folded ahead of the backend.)
- [x] **I-002** `DESIGN.md` Foundation — reverse-engineered the original's tokens.
- [x] **I-003 / I-004** Data model + Auth — Prisma schema/migration/seed + NextAuth v5 (email+password), middleware server-side authz (closed OBS-122/131), merged. **→ superseded by I-005 re-platform (ADR-0013).**

## Phase 0.5 — Backend re-platform (current)
- [ ] **I-005** Re-platform to Supabase + Drizzle + Supabase Auth — port I-004 auth to Supabase Auth (link app users → `auth.users`); data layer Prisma→Drizzle on Supabase Postgres; RLS policies (`org_id`/location backstop); Realtime + Storage seams; CI bare-Postgres → Supabase local stack. (Plan: `docs/plans/2026-06-16-replatform-supabase.md`.)

## Phase 1 — Public + member shell
- [ ] **I-010** Landing `/` pixel replica (OBS-001..005).
- [ ] **I-011** `/login` + `/signup` pixel replica (OBS-010..011).
- [ ] **I-012** App chrome (member nav/footer) + routing + protected routes.
- [ ] **I-013** Member dashboard (time-credit balance, next booking).

## Phase 2 — Core member journeys
- [ ] **I-020** Time-credit packages: list + purchase + ledger debit.
- [ ] **I-021** Booking flow (seat/room, time window, credit check, confirm).
- [~] **I-022** Cafe domain — **shelved on `feat/cafe-domain` (Prisma/NextAuth), unmerged.** Schema/repo/actions/5 surfaces wired + tests built (Phases A–E); spec `0003-cafe-domain`, plan, domain logic (`lib/cafe/*`) all carry over. Rebuild the data/auth wiring on the Supabase+Drizzle foundation after I-005.
- [ ] **I-023** Print billing (PaperCut-style charge model) + member view.
- [ ] **I-024** Dynamic-QR facility access.

## Phase 3 — Admin console
- [ ] **I-030** Admin dashboard `/admin` (OBS-020..023: KPIs + recent transactions).
- [ ] **I-031** Users `/admin/users`.
- [ ] **I-032** Bookings `/admin/bookings`.
- [ ] **I-033** Pending payments `/admin/pending`.
- [ ] **I-034** POS `/admin/pos`.
- [ ] **I-035** Orders `/admin/orders`.
- [ ] **I-036** Print reports `/admin/print-reports`.
- [ ] **I-037** Settings `/admin/settings` (pricing/packages/discounts/tiers).

## Tech debt / enhancements
- [ ] Changed-lines-precise coverage gate (PMO had a root-anchored script; dropped here — re-add root-aware version).
- [ ] Preview env wiring (Neon branch per PR + Vercel).
- [ ] Storybook for the shared component library (once extracted).
- [ ] **Auth: rate limiting / lockout on login + signup** (security L2 from I-004 review) — throttle repeated attempts per IP/email to blunt credential stuffing and signup abuse.
- [ ] **Auth: email verification before activation** (security L4 from I-004 review) — require a verified email before a new MEMBER can transact.
- [ ] **Auth: org-scoped email uniqueness** (`@@unique([orgId, email])` from I-004 review) — for multi-venue, email should be unique per org rather than globally; revisit `findByEmail`/signup when the org seam goes multi-venue.
