# Backlog — issue-driven roadmap

One issue at a time (Director loop). Each issue: Intake → Spec → Plan → Build → Review → Accept → (design re-review) → Ship.
Surfaces come from `docs/specs/0001-recon-app-surface.spec.md`.

## Phase 0 — Foundation (in progress)
- [x] **I-000** Repo + agentic workflow scaffold (agents, skills vendoring, docs, CI, white-label seam). ← this commit
- [x] **I-001** Member + barista recon pass — captured `/dashboard /booking /cafe /print /keycard /topup /history` + `/barista` (KDS). Spec 0001 updated. (Remaining: guest-cafe `/cafe/guest`, cafe variant/checkout, booking steps 2–4.)
- [ ] **I-002** `DESIGN.md` Foundation — reverse-engineer the original's design tokens + component patterns (design-architect).
- [ ] **I-003** Data model — `prisma/schema.prisma` for users/memberships/credit-ledger/bookings/rooms/cafe/print/transactions/settings (+ `org_id` seam), first migration.
- [ ] **I-004** Auth — NextAuth/Auth.js v5 (email+password), session, role gate, `/login` + `/signup` wired.

## Phase 1 — Public + member shell
- [ ] **I-010** Landing `/` pixel replica (OBS-001..005).
- [ ] **I-011** `/login` + `/signup` pixel replica (OBS-010..011).
- [ ] **I-012** App chrome (member nav/footer) + routing + protected routes.
- [ ] **I-013** Member dashboard (time-credit balance, next booking).

## Phase 2 — Core member journeys
- [ ] **I-020** Time-credit packages: list + purchase + ledger debit.
- [ ] **I-021** Booking flow (seat/room, time window, credit check, confirm).
- [ ] **I-022** Cafe ordering (member, tier discount) + guest cafe `/cafe/guest`.
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
