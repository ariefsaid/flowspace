# Backlog — issue-driven roadmap

One issue at a time (Director loop). Each issue: Intake → Spec → Plan → Build → Review → Accept → (design re-review) → Ship.
Surfaces come from `docs/specs/0001-recon-app-surface.spec.md`.

## CURRENT STATE (2026-06-21) — read this first
- **Stack:** Supabase (Postgres+Auth+Realtime+Storage+RLS) + Drizzle, server-authoritative (ADR-0013/0014/0015). Prisma/Neon/NextAuth removed. Migrations `0000`–`0007`.
- **The app is FUNCTIONALLY COMPLETE on `main` (CI green).** Every data surface is live on Supabase. Merged: I-005 (re-platform), I-022 cafe (PR #3, Realtime KDS), the **functional-app push** ([PR #4](https://github.com/ariefsaid/flowspace/pull/4): I-020 packages/top-up · I-021 booking · I-024 keycard QR · I-023 print · admin console · dashboard/history + a unified `transactions` ledger), and the **workflow-conformance harden** ([PR #5](https://github.com/ariefsaid/flowspace/pull/5): SDD spec 0004, print→Supabase Storage, full 4-reviewer battery). Tests on `main`: see `pnpm test` / CI (≈unit 188 / int 85 / e2e 8 as of 2026-06-21).
- **Live (LIVE-DB):** landing(static)·login·signup(action)·guest-cafe·member dashboard/cafe/booking/print/keycard/topup/history·barista·admin dashboard/users/pending/bookings/pos/orders. **Static (intentional):** `/`, `/signup` page, `/admin/settings` (config hub — simulated integrations), `/admin/print-reports` (absent on original).
- **External integrations are SIMULATED behind seams** (payments→COMPLETED, QR/WiFi→tokens, print→Storage but physical print stubbed). Each real provider is a separate owner-gated issue.
- **Superseded:** the old `feat/cafe-domain` (Prisma) branch — logic carried into I-022; do NOT merge it.
- **Local env:** 3 Supabase CLI stacks run side-by-side (flowspace `64321/64322`, pmo-portal `54xxx`, gordi-mos `44xxx`); the repo `.env` must point at flowspace (`DATABASE_URL=…:64322`). Re-seed after any `test:int` (it truncates the shared dev DB).

## Done
- [x] **I-000** Repo + agentic SDD/TDD/BDD workflow scaffold. · [x] **I-001** Recon (all surfaces → spec 0001). · [x] **I-002** `DESIGN.md` tokens.
- [x] **Frontend replica** (landing/login/signup/guest-cafe/member×7/barista/admin×8) built + pixel-hardened, merged.
- [x] **I-003/I-004** auth+data foundation (NextAuth/Prisma) — **superseded by** [x] **I-005** re-platform to Supabase+Drizzle+Supabase Auth, **merged, CI green** (ADR-0013/0014/0015; plan `docs/plans/2026-06-16-replatform-supabase.md`).
- [x] **I-022 (cafe) — rebuilt on Supabase+Drizzle+Realtime, merged ([PR #3](https://github.com/ariefsaid/flowspace/pull/3), 2026-06-16, CI green):** migration `0005_cafe_domain.sql` (3 tables + 4 enums + org-scoped RLS + realtime publication), Drizzle repo `lib/db/cafe.ts` (server-priced orders, org-scoped), server actions w/ Supabase-session authz, 5 surfaces wired (UI pixel-identical), Supabase Realtime KDS. Plan `docs/plans/2026-06-16-cafe-domain-supabase.md`. Tests added at each slice (see `pnpm test` / CI). 3-lens cross-family review (glm-5.1) + Director [SEC] verification caught 5 defects (multi-variant guard, qty manipulation, archived-item orderability, TOCTOU status race, silent checkout errors) — all fixed. **Supersedes the shelved `feat/cafe-domain` (Prisma) branch.**

## DONE in the functional-app push (branch `feat/domain-verticals`, PR pending)
- [x] **I-020** Time-credit packages + print top-up — server-priced purchase, atomic balance+ledger, org-scoped (`/topup`).
- [x] **I-021** Booking — walk-in (4h cap, pay-at-cashier) + scheduled (seat/room, server rate from facilities), ledger-linked, admin complete/approve (`/booking`, `/admin/bookings`, `/admin/pending`).
- [x] **I-024** Keycard QR — HMAC-signed rotating token from the active booking (simulated door access; fails closed in prod) (`/keycard`, dashboard QR).
- [x] **I-023** Print billing — server-priced (tier discount), race-safe printBalance debit, ledger-linked (`/print`).
- [x] **Admin console + member dashboard/history** wired to live data; unified `transactions` ledger feeds history + admin revenue/KPIs.

## OUTSTANDING — next work
- [ ] **Activate the dormant cafe 5% discount** now that booking exists — flip `resolveDiscountEligibility` to consult `getActiveBooking` (ADR-0011).
- [ ] **`/admin/settings`** config hub (tiers/discounts, facilities CRUD, cafe-menu CRUD, print pricing) — currently static; wire the config we own, keep integration panels (print-server/UniFi/GA/email) simulated.
- [ ] **Review minors (non-blocking, from the 4-reviewer battery):** magic-byte MIME validation for print uploads (currently trusts `Blob.type`; bucket is private so low risk); dedupe the two booking-ledger helpers (`settleBookingTransaction`/`setBookingTransactionAmount` → one `updateBookingTransaction`); `cafe.ts` customer hydration could call `users.findProfilesByIds`; print Total color teal-vs-original-blue (replica nuance — Director's call); admin "Pending Payments" KPI → link to `/admin/pending`; refresh spec 0004's "coverage gaps" note (PrintClient test now exists).
- [ ] **Local-env note (ops, not code):** 3 Supabase CLI stacks run side-by-side — flowspace `64321/64322`, pmo-portal `54xxx`, gordi-mos `44xxx`. The repo `.env` must point at flowspace (`DATABASE_URL=…:64322`, `NEXT_PUBLIC_SUPABASE_URL=…:64321`); `lib/db/drizzle.ts` has no fallback so a wrong/stale `DATABASE_URL` breaks every server render. Re-seed (`pnpm db:seed:supabase`) after any `pnpm test:int` (integration tests truncate the shared dev DB).
- [ ] **Functional-push follow-ups (non-blocking):** tier→discount + COLOR-rate as config (not constants); print-preview tier-discount display; users Add/Edit + booking "Tambah" stubs; `KEYCARD_TOKEN_SECRET` in prod env; admin date-filter wiring; keycard vs dashboard QR color consistency.
- [ ] **I-022 follow-ups (non-blocking):** guest-order rate-limit + line-count cap; `advanceOrderStatusAsActor` test-seam relocate; `canAdminSetOrderStatus()` symmetry; `updated_at` DB trigger; AC-id hygiene.
- [ ] **External integrations** (each its own owner-gated ADR/issue): payment gateway (Midtrans/Xendit), PaperCut print server, UniFi WiFi vouchers, real dynamic-QR door access, ESB/ERP. (Print **file upload** now uses Supabase Storage — done; only the physical printing is external.)

### Doc/process follow-ups (from the 2026-06-21 cold audit)
- **Domain-verticals plan (backfill or waive):** PR #4 (I-020/021/023/024 + admin console) was a burst with **no `docs/plans/` artifact** — spec `0004-domain-verticals.spec.md` holds the ACs. Treat as an **owner-approved burst waiver** (documented here) until/unless a backfilled `docs/plans/2026-06-17-domain-verticals.md` is wanted.
- **`lib/mock/*` cleanup (FR-252 literal compliance):** delete the 9 dead mock **data** files (`lib/mock/{admin,barista,bookings,cafe,index,member,packages,print,transactions}.ts` — no longer imported) and relocate the shared view-types out of `lib/mock/types.ts` (still used by 5 production type-only imports) to e.g. `lib/types/views.ts`; then FR-252's "no `lib/mock` import" is literally true.
- **`drizzle/` artifacts:** ADR-0015 calls them "retained as reference/legacy" but they predate I-022 (only `0000_init.sql` — no cafe/bookings/print/transactions/storage_path). Either regenerate (`pnpm dz:generate`) to match `lib/db/schema.ts`'s 10 tables or delete and stop calling them "reference."
- **spec-0002 traceability:** `docs/specs/0002-auth-foundation.spec.md` marks AC-001/AC-003/AC-005 as **E2E**-owned, but no `e2e/` files exist for them — they're actually owned by unit/integration (ADR-0010 I-004 rebalance). Re-assign to the real owning layer.
- **Reconcile `/admin/print-reports`:** spec-0001 OBS-035 says it's on the original ("detail pending"); backlog says "absent on original"; the built page is a static mock. Re-recon 2026-06-21 shows the live product redirects it → `/dashboard`. Owner OQ to confirm.
- **Deferred product decisions:** `phone` field (collected at `/signup`, discarded — no column) and `PAID_ONLINE` payment state (enum value never written; no test exercises online settlement). Both deferred — confirm out-of-scope vs. future column/path.

## DONE in the workflow-conformance harden (branch `feat/verticals-harden`)
- [x] **SDD spec backfilled** — `docs/specs/0004-domain-verticals.spec.md` (OBS/FR/AC mapped to existing tests).
- [x] **Print file upload → Supabase Storage** (our stack; org-scoped path, MIME allowlist + size cap; no migration). Closes the one "functional without external ties" gap.
- [x] **Coverage gap closed** — `PrintClient.test.tsx` + `uploads.test.ts` + print action tests (see `pnpm test` / CI).
- [x] **Full 4-reviewer battery run** (by the book): spec-reviewer (matches spec), code-quality, design-reviewer (rendered round-2 on real screenshots), security-auditor (gpt-5.4 cross-family). All FIX-FIRST findings resolved:
  - **[SEC]** print charged-orphan (app/bucket MIME mismatch + charge-before-upload) → migration 0007 widens bucket + upload-before-charge + file-required (AC-0243/0244); cafe hydration org-scoped; keycard fail-closed-in-prod.
  - **Design (rendered)** wizard-stepper pill shape; admin orange-tile AA contrast (4.67:1); Riwayat empty states; keycard QR + print btn + WifiCard tokens.
  - **Quality** AC-id collision de-duped; dual-mode print action removed (single FormData input).
- [x] **Local env diagnosed + flowspace re-seeded** — the stale Prisma-era `.env` (DATABASE_URL→dead :5433) was the render blocker; correct flowspace env verified to render the app authenticated end-to-end.

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
