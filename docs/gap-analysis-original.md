# Gap analysis — FlowSpace vs the original app source (2026-08-28)

> Companion to [`audit-verdict.md`](audit-verdict.md). Source: the client's original app code, obtained
> 2026-08-28 and kept in a **private clone outside this repo** (contains real branding; never copy from it
> verbatim — masking rules in `CLAUDE.md` apply). "ORIG" = the original app. Tier names are masked:
> **T-BASE / T-MID / T-TOP** map to FlowSpace's `REGULAR / PREMIUM / GOLD`.
>
> This document supersedes recon guesses where they conflict: recon captured observable behavior from
> outside; ORIG's code is now the authoritative behavior oracle for parity. Screens/pixels remain graded
> against the captured original as before.

## 1. Architecture summary (context for the diff)

| Axis | ORIG | FlowSpace |
|---|---|---|
| Stack | Next.js 14.2 + React 18, Prisma 6.7 + Postgres, NextAuth v4 (JWT), Tailwind v3/shadcn, S3 presigned uploads, Docker+Traefik | Next.js 15 + React 19, Supabase (Postgres/Auth/Realtime/Storage/RLS) + Drizzle, Tailwind v4 |
| Logic placement | `app/api/*` route handlers only; no server actions; clients `fetch` | Server actions + typed Drizzle repositories (`lib/db/*`) |
| Authz | No `middleware.ts`; per-page `useSession` (UX-only) + per-handler inline checks; roles USER/ADMIN only (cashier = full ADMIN) | Fail-closed middleware + route-policy; MEMBER/BARISTA/ADMIN; in-action re-checks; RLS backstop |
| Tenancy | None — hard single-tenant, no org column anywhere | `org_id` seam on every business table |
| Atomicity | Zero `$transaction`; TOCTOU races on balance debit, credit spend, double-booking | Atomic domain+ledger writes; conditional race-safe debits |
| Money integrity | Cafe/guest orders trust client `itemPrice`; POS trusts client subtotal/discount | Server-priced everywhere |
| Ledger | `Transaction.referenceId` free-text pseudo-FK | `transactions` with real per-domain FKs |
| Deletes | Hard delete + cascade (user delete destroys financial history) | Soft-archive, FK-block |
| Realtime | 10s client polling (KDS) | Supabase Realtime (`postgres_changes`) |
| Tests / CI | None; Docker build sed-disables typecheck | ~216 unit / 86 int / 8 e2e; typecheck+lint gates |
| Brand | Hardcoded throughout (name, emails, seed accounts) | `brand.config.ts` + env seam |

**ORIG security defects (do NOT replicate; several are lessons for our own surface):** unauthenticated
mock top-up route crediting any user's print balance; IDOR balance read; public state-mutating booking
status sweep; door verify endpoint that ignores the HMAC signature (proper `verifyQRCode()` exists as dead
code — the rotating QR is cosmetic); QR secret with a hardcoded fallback; signup with no rate-limit /
email verification; page-guard drift (barista page checks login, not role).

## 2. Domain-by-domain gaps

### 2.1 Booking (flagship gap)

**ORIG facility catalog (seeded, admin-editable):**
- 12 desks (labels A–L), capacity 1, **Rp25.000/h**, zone `DESK`, `maxHoursCap: 4`
- 8 counter seats (labels 1–8), capacity 1, **Rp20.000/h**, zone `COUNTER`, `maxHoursCap: 4`
- Meeting Room A capacity 10 **Rp150.000/h** · Meeting Room B capacity 8 **Rp120.000/h**, zone `MEETING`
- Full-room event rental, capacity 20, **Rp350.000/h**, zone `FULL_ROOM` — bookable only if **zero**
  individual seats have any booking that whole day (exclusivity rule in the availability API)

**ORIG booking behavior:**
- 4-step wizard: type → date/time (scheduled 1–8h, or walk-in now) → **interactive floor plan** seat pick → summary
  with an 8-clause booking-policy accept checkbox.
- Lifecycle `PENDING → CONFIRMED → ACTIVE → COMPLETED | CANCELLED`; payment status `PAID_ONLINE /
  WAITING_CASHIER / PAID_CASHIER`.
- **Payment methods at booking:** `time_credits` (FIFO against expiring credit lots → instantly
  CONFIRMED/PAID_ONLINE) · `online` (simulated → CONFIRMED/PAID_ONLINE) · `cashier` (PENDING/WAITING_CASHIER).
- **Per-tier booking discounts** on `rate × hours`: coworking% / meetingRoom% by tier (see §2.3).
- **Overlap conflict check**: any PENDING/CONFIRMED/ACTIVE booking on the facility blocks a new one
  (ORIG's check is racy — ours must be transactional/constraint-backed).
- **Extend session**: ACTIVE only, total ≤4h, blocked if another booking starts <60 min after the new end;
  creates a PENDING transaction.
- **Admin checkout/billing dialog** ends an ACTIVE session: recompute billed hours (walk-in =
  `ceil(elapsed/60)` capped at `maxHoursCap`; scheduled = booked duration), re-apply tier discount, pay by
  `cash / qris / time_credits`, set COMPLETED + PAID_CASHIER (or PAID_ONLINE for credits), rewrite the
  linked transaction.
- **Status sweep** (cron-style endpoint, called every 30s by the admin board): auto-activate paid CONFIRMED
  bookings whose start arrived; auto-cancel CONFIRMED bookings that expired unactivated; flag overtime
  (never auto-completes ACTIVE — cashier checks out). ORIG ships it **unauthenticated** (defect); ours must
  be an authenticated job.
- Walk-in: starts PENDING/WAITING_CASHIER; cashier "approve & start" flips to ACTIVE (ORIG resets
  startTime to approval time and sets a placeholder end +24h — defect, match intent not mechanics).
  Dashboard shows live running cost, ≤15-min-left extend banner, red overtime banner.

**FlowSpace today (verified in code):** walk-in (opens ACTIVE, charged at complete, 4h cap, fixed rates
15k/120k) + scheduled (facility rate × ceil hours) only; statuses ACTIVE→COMPLETED/CANCELLED; **no conflict
check; bookings never spend time credits; no CONFIRMED stage, extend, checkout dialog, floor plan,
booking discounts, or sweep.** Members can double-book, and purchased credits are unusable.

### 2.2 Time credits

- ORIG: `TimeCredit` rows — `totalHours`/`remainingHours`, **expire 90 days** after purchase, consumed
  oldest-expiring-first. Packages (identical to ours): 5h/Rp75.000 · 10h/Rp140.000 · 20h/Rp260.000 ·
  50h/Rp600.000. Payment-receipt email on purchase.
- FlowSpace: single `app_users.time_credits` int, incremented by purchase, never debited, no expiry.
- Parity needs: expiring lots + FIFO spend + booking integration (§2.1). Ledger already exists.

### 2.3 Membership tiers

- ORIG: a **CRUD tier table** (name, displayName, description, 4 discount dims, isActive, sortOrder,
  color), matched to users by string. Seeded values:

| Tier (masked) | coworking% | meeting% | cafe% | print% |
|---|---|---|---|---|
| T-BASE | 0 | 0 | 0 | 0 |
| T-MID | 10 | 10 | 5 | 5 |
| T-TOP | 15 | 15 | 10 | 10 |

- FlowSpace: enum tiers + `membership_tier_config` with only cafe%/print%, seeded **cafe 5/5/5 and print
  0/20/20 — recon-era guesses that don't match ORIG's data**. Cafe discount is additionally gated on an
  ACTIVE session in both apps (ORIG member flow does the same; its POS hardcodes 15% — a defect, ignore).
- Parity needs: add coworking/meeting dims, correct seed values, admin tier CRUD (dynamic tiers vs enum —
  needs a small ADR: keep enum + config table, or go dynamic like ORIG).

### 2.4 Print

- ORIG pricing: `PrintPricing` matrix **colorMode × paperSize** — BW A4 500 / A3 1.000 / F4 600; COLOR
  A4 2.000 / A3 4.000 / F4 2.500 (fallback 500). Tier print% applied. Page-range strings (`1-5,8`),
  copies, duplex, printer pick gated by printer `colorSupport`/`paperSizes`.
- ORIG printers: CRUD (CUPS name, display name, type, color support, paper sizes, default, active).
- ORIG statuses: `PENDING → PROCESSING → READY/FAILED → COMPLETED`; advanced by admin **or** by a print
  agent (mini-PC) polling a pull API gated by an `x-api-key` matching a stored settings key; agent gets
  signed download URLs; `processedBy`/`errorMessage` recorded.
- ORIG top-ups: **page packages** 10/Rp10.000 · 50/Rp45.000 · 100/Rp80.000.
- FlowSpace: flat per-org BW/COLOR rates (500/1500 default, admin-editable), paper_size stored but
  unpriced, statuses PENDING/READY/COMPLETED, flat 500/page top-up, no printers, no agent API, no
  page-range. (We're ahead on upload integrity: magic-byte validation + 10MB cap; ORIG trusts declared
  MIME/pageCount/fileSize at job creation.)
- Parity needs: pricing matrix, printers CRUD, page-range, PROCESSING/FAILED, package top-ups, agent pull
  API (API-key gated, like ORIG's — its one well-gated external endpoint).

### 2.5 Cafe

- ORIG: menu items carry `hasVariants` + `variantConfig` JSON with **priced options** (Temperature: Hot +0 /
  Cold **+Rp3.000**; Sugar levels +0) — active on coffee/most drinks. Order `notes` field (highlighted on
  KDS). POS looks up a member by email to apply the session discount. Guest order code `G{YYYYMMDD}-{rand3}`.
  Admin orders page can delete orders (defect vs audit trail — keep our soft/status model).
- FlowSpace: temperature/sugar enums exist on order items but **no price adjustment and seed has all
  `hasVariants:false`**; no notes; POS member lookup unverified; 6-char base36 codes.
- Menu truth: our seed (31 items, incl. the Rumah Rames set from PR #6) diverges from ORIG's 15-item seed —
  **owner to confirm which menu is current reality** (ORIG's seed may be stale vs the live venue).
- Parity needs: priced variants, order notes, POS member-lookup discount (tier-driven, not ORIG's
  hardcoded 15%), menu reconciliation.

### 2.6 Admin console

- ORIG has, FlowSpace lacks:
  - **`/admin/reports`**: revenue trend, revenue-by-type pie, booking-status charts (daily/weekly/monthly).
  - **Users CRUD**: add/edit (incl. password reset, tier set), delete (blocked for admins; ORIG
    hard-cascades — we keep soft-archive), search/filter with per-user booking/transaction counts.
  - **Manual booking creation** (admin books on behalf of a user, any status).
  - **Bulk pending-approve** (checkbox multi-select) — ours is per-item.
  - **Settings CRUD**: facilities, cafe menu, print pricing, printers, print-agent API key, email toggles
    (+ site/SEO/theme/analytics forms that ORIG persists but never consumes — skip those, or wire them
    into `brand.config.ts` properly if the owner wants them).

### 2.7 Integrations (ORIG ships these in-code; ours are static cards)

- **WiFi vouchers**: real controller integration, two modes (cloud API-key via the vendor's site-manager
  API, or local controller IP), voucher generated on booking activation, live "Test Connection". Fails to
  no-voucher when unconfigured.
- **Email notifications**: welcome / booking-confirmation / payment-receipt via the app-builder platform's
  hosted email API; per-type toggles + test-send. (We'd use our own provider behind a seam.)
- **Door access**: `verify-access` endpoint for an IoT device — booking status CONFIRMED/ACTIVE, window
  from start−15min to end, auto-activates on first scan. ORIG never checks the HMAC (defect); ours must
  verify the signature we already generate.
- **Print agent**: §2.4 pull API + a downloadable agent script (CUPS/systemd docs) — physical printing
  happens outside the web app.

## 3. Ideas worth adopting beyond parity

- **Status sweep** resolves our open stale-walk-in OQ (discount persisting past presence) — an
  authenticated scheduled job for auto-activate / auto-cancel / overtime.
- **DB backup sidecar** (ORIG: daily `pg_dump`, 7-day retention) — fold into the ADR-0013 prod decision.
- Deployment reference: ORIG's Docker/Traefik shape is a working reference for self-host, minus its
  defects (typecheck-stripping build, unattached security/rate-limit middlewares).

## 4. Issue mapping

| Issue | Scope | Gap refs |
|---|---|---|
| I-040 | Booking parity overhaul (conflict check, credits-as-payment + expiring lots, CONFIRMED lifecycle, extend, admin checkout, seat facilities + floor plan, booking discounts, status sweep) | §2.1, §2.2 |
| I-041 | Tier model correction (4 dims, true values, tier CRUD decision ADR) | §2.3 |
| I-042 | Admin CRUD completion (users, manual booking, facilities/menu CRUD, reports, bulk approve) | §2.6 |
| I-043 | Print parity (pricing matrix, printers, page-range, statuses, package top-ups, agent pull API) | §2.4 |
| I-044 | Cafe nuances (priced variants, notes, POS lookup, menu reconciliation) | §2.5 |
| I-045 | Integrations, owner-gated per ADR (WiFi vouchers, email, door verify done right) | §2.7 |
