# Plan (backfilled) — Domain verticals · PR #4 · 2026-06-17

> **Backfill note (2026-06-23):** PR #4 shipped as an owner-approved **burst** (parallelized phases) with no
> `docs/plans/` artifact at the time; the SDD spec `docs/specs/0004-domain-verticals.spec.md` was authored and the
> ACs were proven, but the plan doc was deferred. This document is the retrospective plan — it maps each vertical
> to the code + the AC-owning tests that actually shipped — retiring the burst-waiver recorded in `docs/backlog.md`.

Spec: `docs/specs/0004-domain-verticals.spec.md`. Pattern: 3-layer seam (RSC/action → typed Drizzle repo `lib/db/*`
→ Supabase), `orgId` server-derived, money computed server-side, atomic debit + ledger write in one `db.transaction`.
Schema: migration `0006_domain_verticals.sql` (5 tables + enums + org-scoped RLS) + `0007_print_storage.sql`.

## Verticals (each a slice; AC → owning test)

1. **I-020 — Time-credit packages + print top-up** (`/topup`)
   - Repo `lib/db/packages.ts`: `listPackages`, `purchasePackage` (server price from DB row, atomic
     `timeCredits` credit + ledger), `topUpPrint` (atomic `printBalance` credit + ledger, `MAX_PAGES` bound).
   - Actions `app/(member)/topup/actions.ts`. Verify: `pnpm vitest run lib/db/packages.int.test.ts`.
2. **I-021 — Booking** (`/booking`, `/admin/bookings`, `/admin/pending`)
   - Repo `lib/db/bookings.ts`: walk-in (4h cap, pay-at-cashier) + scheduled (seat/room, server rate from
     `facilities`); `createBooking`, `getActiveBooking`, `listBookings`, `completeBooking` (ADMIN SoD, compare-and-set),
     `approvePayment`. Walk-in predicates centralized in `lib/booking/walkin.ts`.
   - Verify: `pnpm vitest run lib/db/bookings.int.test.ts` + `e2e/AC-200-member-buys-package.spec.ts`.
3. **I-024 — Keycard QR** (`/keycard`, dashboard)
   - `lib/keycard/token.ts` HMAC-signed rotating token from the active booking (server-only, fails closed in prod);
     `lib/keycard/window.ts` client-safe rotation const. Simulated door access (seam).
4. **I-023 — Print billing** (`/print`)
   - Repo `lib/db/print.ts`: server-priced (tier discount + base rate), race-safe conditional `printBalance` debit,
     ledger-linked; upload→Supabase Storage before charge (`0007`). Verify: `pnpm vitest run lib/db/print.int.test.ts`
     + `e2e/AC-201-member-print-job.spec.ts`.
5. **Admin console + member dashboard/history** wired to live data; the unified `transactions` ledger
   (`lib/db/transactions.ts`) feeds member history + admin revenue/KPIs.

## DoD (met at merge)
typecheck 0 / lint 0 / unit + int green / curated e2e green / 4-reviewer battery (incl. design-reviewer, gpt-5.4
cross-family security) — recorded in `docs/specs/0004-domain-verticals.spec.md` + the backlog "DONE" sections.
