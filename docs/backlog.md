# Backlog — issue-driven roadmap

One issue at a time (Director loop). Each issue: Intake → Spec → Plan → Build → Review → Accept → (design re-review) → Ship.
Surfaces come from `docs/specs/0001-recon-app-surface.spec.md`.

## CURRENT STATE (2026-06-16) — read this first
- **Stack:** Supabase (Postgres+Auth+Realtime+Storage+RLS) + Drizzle, server-authoritative (ADR-0013/0014/0015). Prisma/Neon/NextAuth removed.
- **On `main` (CI green):** the **20-route frontend pixel replica** (~95 fidelity) + the **auth/data foundation** (Supabase Auth, `middleware.ts` server-side authz closing OBS-122/131, org_id-scoped Drizzle repo, RLS backstop, Realtime/Storage seams). Tests: unit 52 / integration 19 / e2e 5.
- **Shelved (NOT on main):** `feat/cafe-domain` branch = the cafe domain built on the OLD Prisma/NextAuth stack (schema/repo/actions/5 surfaces wired + tests, spec `0003-cafe-domain`, plan, `lib/cafe/*` logic). **Rebuild on Supabase+Drizzle** — spec/plan/domain-logic carry over; redo the data/auth wiring. First candidate for the **pi+GLM parallel lane** (`docs/pi-delegation.md`).

## Done
- [x] **I-000** Repo + agentic SDD/TDD/BDD workflow scaffold. · [x] **I-001** Recon (all surfaces → spec 0001). · [x] **I-002** `DESIGN.md` tokens.
- [x] **Frontend replica** (landing/login/signup/guest-cafe/member×7/barista/admin×8) built + pixel-hardened, merged.
- [x] **I-003/I-004** auth+data foundation (NextAuth/Prisma) — **superseded by** [x] **I-005** re-platform to Supabase+Drizzle+Supabase Auth, **merged, CI green** (ADR-0013/0014/0015; plan `docs/plans/2026-06-16-replatform-supabase.md`).

## OUTSTANDING — next work (domain verticals rebuilt on the Supabase foundation)
- [ ] **I-022 (cafe) — rebuild on Supabase+Drizzle** (un-shelve `feat/cafe-domain`): menu reads + order lifecycle (member/guest → barista KDS → admin orders/POS), now using **Supabase Realtime** for the live KDS. Spec `docs/specs/0003-cafe-domain.spec.md` (on the shelved branch) carries over.
- [ ] **I-020** Time-credit packages: list + purchase + ledger debit (Top Up).
- [ ] **I-021** Booking (seat/room, walk-in vs scheduled, time-window, credit check/debit, payment states). NB: enables the cafe "active-session" 5% discount (dormant until booking exists; ADR-0011 lands with the cafe rebuild from `feat/cafe-domain`).
- [ ] **I-023** Print billing (PaperCut-style charge model) + member view + **Supabase Storage** for uploads.
- [ ] **I-024** Dynamic-QR facility access. · Admin sub-pages wired to live data (users/bookings/pending/pos/orders/print-reports/settings).

> NB: the Phase 1–3 sections below are the ORIGINAL frontend roadmap — those pixel surfaces are built/merged. The real outstanding work is the **domain backend verticals above** + the external integrations under Tech debt.

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
- [ ] Preview env wiring (deferred Supabase preview/branch per PR — see `docs/environments.md`; ADR-0013).
- [ ] Storybook for the shared component library (once extracted).
- [ ] **External/hardware integrations (each its own ADR/issue, server-authoritative, per-venue on-prem agent — ADR-0013):** payment gateway (Midtrans/Xendit) for PAID ONLINE · **PaperCut** print billing + print-server (Mini PC) · **UniFi** WiFi vouchers · **dynamic-QR door/print access** (rotating token + device verify) · **ESB/ERP** connectors (future).
- [ ] **Prod infra decision (owner-gated, ADR-0013):** Supabase cloud vs self-host + **Indonesia data-residency (PDP)**.
- [ ] **Auth carry-overs (I-005 security review):** rate limiting on signup (GoTrue covers login) · `lib/supabase/env.ts` → split server-only into `env.server.ts` · org-scoped email uniqueness when multi-venue lands.
- [ ] **Auth: rate limiting / lockout on login + signup** (security L2 from I-004 review) — throttle repeated attempts per IP/email to blunt credential stuffing and signup abuse.
- [ ] **Auth: email verification before activation** (security L4 from I-004 review) — require a verified email before a new MEMBER can transact.
- [ ] **Auth: org-scoped email uniqueness** (`@@unique([orgId, email])` from I-004 review) — for multi-venue, email should be unique per org rather than globally; revisit `findByEmail`/signup when the org seam goes multi-venue.
