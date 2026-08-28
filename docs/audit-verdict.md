# Audit verdict — FlowSpace vs the original app source (2026-08-28)

> The client's original app source was obtained on 2026-08-28 (a private clone kept **outside this repo**,
> like the recon screenshots — it contains real branding throughout). A 3-agent audit battery compared it
> against FlowSpace on architecture, security, and feature parity. Detailed diff:
> [`gap-analysis-original.md`](gap-analysis-original.md). "ORIG" below = the original app.

**Verdict: FlowSpace is architecturally strictly better. Feature parity has real gaps, concentrated in
booking depth, admin CRUD, and the integrations ORIG actually ships.**

## Where FlowSpace is ahead (architecture & security)

ORIG is Next.js 14 + Prisma 6.7 + NextAuth v4 (JWT), all logic in `app/api/*` route handlers, no tests,
no tenancy seam, no brand abstraction. Its defects, none of which FlowSpace shares:

- **No middleware, no central gate** — every page/API copy-pastes its own role check; the barista page
  checks login but not role. FlowSpace: fail-closed `middleware.ts` + route-policy + in-action re-checks
  + RLS backstop.
- **Client-trusted money**: cafe and guest orders accept `item.itemPrice || menuItem.price` — any caller
  sets their own price, persisted into a COMPLETED transaction. POS trusts client subtotal/discount too.
  FlowSpace is server-priced everywhere.
- **Zero `prisma.$transaction`** — print-balance debit, credit spend, and conflict-check-then-book are all
  TOCTOU races (overdraw, double-booking). FlowSpace: atomic ledger writes, race-safe conditional debits.
- **Unauthenticated live endpoints**: a mock top-up route that credits *any* user's print balance, an IDOR
  balance read, and a public status sweep that bulk-mutates bookings.
- **Dynamic QR is theater**: a proper HMAC `verifyQRCode()` exists but is dead code — door access is granted
  on a parsed bookingId + time window alone. FlowSpace's HMAC is real and fails closed in prod.
- Hard-deletes users with cascade (destroys financial history) vs soft-archive; `Json` cart blob vs a
  line-item table; string pseudo-FKs vs real FKs; no indexes; KDS by 10s polling vs Supabase Realtime;
  the production Docker build `sed`s typecheck errors off. Tests: 0 vs our ~216 unit / 86 int / 8 e2e.

## Feature gaps (prioritized — detail + constants in the gap analysis)

1. **Booking** — ORIG has seat-level facilities + floor plan, a `PENDING→CONFIRMED→ACTIVE→COMPLETED`
   lifecycle, **time credits as a booking payment method** (expiring lots, FIFO), extend, admin
   checkout/billing, an auto activate/cancel sweep, overlap conflict checks, and per-tier booking
   discounts. Verified in our code: **FlowSpace bookings never spend time credits and have no conflict
   check** — the original's core product loop.
2. **Time credits** — expiring 90-day lots spent FIFO vs our plain int that only goes up.
3. **Tier model** — ORIG: a CRUD tier table with 4 discount dims (coworking/meeting/cafe/print). Ours: a
   fixed enum with 2 dims and values that don't match the original's data.
4. **Print** — colorMode×paperSize pricing matrix, printers CRUD, page-range, PROCESSING/FAILED, a
   print-agent pull API (API-key gated), page-package top-ups.
5. **Admin** — reports/charts page, users full CRUD, manual booking creation, bulk pending-approve, and
   settings CRUD for facilities/menu/print-pricing/printers (our static cards).
6. **Integrations ORIG really has** — WiFi-voucher controller integration (genuine, live-testable), email
   notifications via its app-builder platform's hosted API, a door-facing verify endpoint.
7. **Cafe nuances** — priced variants (e.g. Cold +Rp3.000), order notes, POS member lookup.

ORIG also has bugs we must **not** copy (POS hardcoded menu + hardcoded 15% discount contradicting its own
tier data, walk-in approve resetting startTime with a fake +24h end, guest name stuffed into `notes`).
Parity targets intent, not defects. Its status sweep, however, is the answer to our open stale-walk-in OQ.

## Disposition

Parity work is scheduled as backlog issues **I-040..I-045** (Phase 4 — source-parity wave) in
[`backlog.md`](backlog.md), in dependency order: booking overhaul first, then tier correction, admin CRUD,
print parity, cafe nuances, and owner-gated integrations.
