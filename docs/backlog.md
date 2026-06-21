# Backlog — issue-driven roadmap

One issue at a time (Director loop). Each issue: Intake → Spec → Plan → Build → Review → Accept → (design re-review) → Ship.
Surfaces come from `docs/specs/0001-recon-app-surface.spec.md`.

## CURRENT STATE (2026-06-17) — read this first
- **Stack:** Supabase (Postgres+Auth+Realtime+Storage+RLS) + Drizzle, server-authoritative (ADR-0013/0014/0015). Prisma/Neon/NextAuth removed.
- **On `main` (CI green):** the **20-route frontend pixel replica** (~95 fidelity) + the **auth/data foundation** (Supabase Auth, `middleware.ts` server-side authz closing OBS-122/131, org_id-scoped Drizzle repo, RLS backstop, Realtime/Storage seams) + **I-022 cafe domain** (PR #3 merged 2026-06-16; menu/orders/KDS on Supabase+Drizzle+Realtime). Tests on `main`: unit 94 / int 38 / e2e 6.
- **Superseded:** the old `feat/cafe-domain` (Prisma) branch — its spec/plan/`lib/cafe/*` logic was carried into I-022; do NOT merge the old branch.
- **In review (branch `feat/domain-verticals`, PR pending):** the **functional-app goal-push** — I-020 packages/top-up, I-021 booking, I-024 keycard QR, I-023 print, admin console (users/pending/bookings/KPIs), and member dashboard/history, all on the Supabase foundation with a unified `transactions` ledger. **Every data surface is now live** (only `/`, `/signup`, `/admin/settings` [config hub, simulated], `/admin/print-reports` [absent on original] remain static). External boundaries (payments/print-HW/QR/WiFi) are **simulated behind seams**. Built burst-parallel via pi+GLM; Director [SEC]-verified money paths; gpt-5.4 cross-family security review (no Critical). Gates: typecheck 0 / int 73 / unit 138 / e2e 8 / lint 0 / build green.

## Done
- [x] **I-000** Repo + agentic SDD/TDD/BDD workflow scaffold. · [x] **I-001** Recon (all surfaces → spec 0001). · [x] **I-002** `DESIGN.md` tokens.
- [x] **Frontend replica** (landing/login/signup/guest-cafe/member×7/barista/admin×8) built + pixel-hardened, merged.
- [x] **I-003/I-004** auth+data foundation (NextAuth/Prisma) — **superseded by** [x] **I-005** re-platform to Supabase+Drizzle+Supabase Auth, **merged, CI green** (ADR-0013/0014/0015; plan `docs/plans/2026-06-16-replatform-supabase.md`).
- [x] **I-022 (cafe) — rebuilt on Supabase+Drizzle+Realtime, merged ([PR #3](https://github.com/ariefsaid/flowspace/pull/3), 2026-06-16, CI green):** migration `0005_cafe_domain.sql` (3 tables + 4 enums + org-scoped RLS + realtime publication), Drizzle repo `lib/db/cafe.ts` (server-priced orders, org-scoped), server actions w/ Supabase-session authz, 5 surfaces wired (UI pixel-identical), Supabase Realtime KDS. Plan `docs/plans/2026-06-16-cafe-domain-supabase.md`. Tests: unit 94 / int 38 / e2e 6 (AC-121). 3-lens cross-family review (glm-5.1) + Director [SEC] verification caught 5 defects (multi-variant guard, qty manipulation, archived-item orderability, TOCTOU status race, silent checkout errors) — all fixed. **Supersedes the shelved `feat/cafe-domain` (Prisma) branch.**

## DONE in the functional-app push (branch `feat/domain-verticals`, PR pending)
- [x] **I-020** Time-credit packages + print top-up — server-priced purchase, atomic balance+ledger, org-scoped (`/topup`).
- [x] **I-021** Booking — walk-in (4h cap, pay-at-cashier) + scheduled (seat/room, server rate from facilities), ledger-linked, admin complete/approve (`/booking`, `/admin/bookings`, `/admin/pending`).
- [x] **I-024** Keycard QR — HMAC-signed rotating token from the active booking (simulated door access; fails closed in prod) (`/keycard`, dashboard QR).
- [x] **I-023** Print billing — server-priced (tier discount), race-safe printBalance debit, ledger-linked (`/print`).
- [x] **Admin console + member dashboard/history** wired to live data; unified `transactions` ledger feeds history + admin revenue/KPIs.

## OUTSTANDING — next work
- [ ] **Activate the dormant cafe 5% discount** now that booking exists — flip `resolveDiscountEligibility` to consult `getActiveBooking` (ADR-0011).
- [ ] **`/admin/settings`** config hub (tiers/discounts, facilities CRUD, cafe-menu CRUD, print pricing) — currently static; wire the config we own, keep integration panels (print-server/UniFi/GA/email) simulated.
- [ ] **Functional-push follow-ups (non-blocking, from review):** tier→discount + COLOR-rate as config (not constants); print-preview tier-discount display; users Add/Edit + booking "Tambah" stubs; `KEYCARD_TOKEN_SECRET` in prod env; admin date-filter wiring.
- [ ] **I-022 follow-ups (non-blocking):** guest-order rate-limit + line-count cap; `advanceOrderStatusAsActor` test-seam relocate; `canAdminSetOrderStatus()` symmetry; `updated_at` DB trigger; AC-id hygiene.
- [ ] **External integrations** (each its own owner-gated ADR/issue): payment gateway (Midtrans/Xendit), PaperCut print server, UniFi WiFi vouchers, real dynamic-QR door access, ESB/ERP. + **Supabase Storage** for real print-file uploads (currently simulated).

> NB: the Phase 1–3 sections below are the ORIGINAL frontend roadmap — those pixel surfaces are built/merged. The real outstanding work is the **domain backend verticals above** + the external integrations under Tech debt.

## Phase 1 — Public + member shell
- [ ] **I-010** Landing `/` pixel replica (OBS-001..005).
- [ ] **I-011** `/login` + `/signup` pixel replica (OBS-010..011).
- [ ] **I-012** App chrome (member nav/footer) + routing + protected routes.
- [ ] **I-013** Member dashboard (time-credit balance, next booking).

## Phase 2 — Core member journeys
- [ ] **I-020** Time-credit packages: list + purchase + ledger debit.
- [ ] **I-021** Booking flow (seat/room, time window, credit check, confirm).
- [x] **I-022** Cafe domain — **rebuilt on Supabase+Drizzle+Realtime and merged** (PR #3; see Done). The old `feat/cafe-domain` (Prisma) branch is superseded.
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
