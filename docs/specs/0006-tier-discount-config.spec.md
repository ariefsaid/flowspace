# Spec 0006 — Per-tier discount configuration (admin Settings)

- Status: **Approved (I-027, owner sign-off 2026-06-23 — incl. print base rates).** Money path.
- Realizes the `/admin/settings` launcher card **"Kategori Membership — Kelola tier membership dan diskon per
  kategori"** (OBS-035 settings grid). Depends on spec 0002 (auth/authz), spec 0003 (cafe pricing), spec 0004
  (print pricing), ADR-0011/0015.
- Source of behavior: net-new admin config + server-side money path (`FR-*`).

## Problem
The discount rates that drive two money paths are **hardcoded constants**, not configurable:
- Cafe: `MEMBER_DISCOUNT_RATE = 0.05` (`lib/cafe/pricing.ts`) — flat, applied when the member has an active session.
- Print: `TIER_DISCOUNT_RATE = { REGULAR: 0, PREMIUM: 0.2, GOLD: 0.2 }` (`lib/print/pricing.ts`) — per tier.
An admin cannot change a tier's discount without a code deploy. This issue moves these rates into per-org,
per-tier **configuration** an ADMIN edits in Settings, read server-side by the pricing paths.

## Scope
**In:**
- A per-org, per-tier config table `membership_tier_config(orgId, tier, cafeDiscountPct, printDiscountPct)` — one row
  per `{org, tier}` (tiers `REGULAR/PREMIUM/GOLD`). Seeded to **preserve current behavior**: every tier
  `cafeDiscountPct = 5`; `printDiscountPct = REGULAR 0 / PREMIUM 20 / GOLD 20`.
- Repo `lib/db/tier-config.ts` (org-scoped): `listTierConfig(orgId)`, `getTierDiscounts(orgId, tier)`,
  `updateTierDiscounts(orgId, tier, { cafeDiscountPct, printDiscountPct })` (ADMIN-only writer).
- **Per-org print base rates** (owner add-on): table `org_print_pricing(orgId, bwRatePerPageRupiah,
  colorRatePerPageRupiah)` — one row per org, seeded `500` / `1500` (current `PRINT_RATE_BW`/`PRINT_RATE_COLOR`).
  Repo `lib/db/print-pricing.ts`: `getPrintPricing(orgId)`, `updatePrintPricing(orgId, {bw, color})` (ADMIN-only).
- The pure pricing fns take explicit **rates** instead of constants: `computePrintTotal({pages, copies, colorMode,
  bwRateRupiah, colorRateRupiah, discountPct})` and `computeOrderTotals(lines, { discountPct })`. The repositories
  resolve the member's tier + the org's print rates → load config → pass them in. No client value is ever trusted.
- Admin sub-page `/admin/settings/tiers` — (a) a print-pricing section (BW + COLOR base-rate inputs), and (b) an
  editable 3-row table (one per tier) with `cafeDiscountPct` + `printDiscountPct`, with a Save action (ADMIN-only,
  server-validated). The Settings launcher card navigates here.
**Out (follow-up issues):** facilities & cafe-menu CRUD; all integration cards (printers/print-server/GA/email/UniFi —
simulated); tier rename / add/remove tiers (the enum stays `REGULAR/PREMIUM/GOLD`).

## Roles
ADMIN edits config (server-side authz, like the other admin mutations). MEMBER/BARISTA: read-only effect (their
prices reflect config); they cannot reach the editor (middleware + the `(admin)` layout guard).

## Functional requirements (EARS)
- **FR-400** (ubiquitous) — The schema *shall* define `membership_tier_config(id, org_id→organizations, tier:
  membership_tier, cafe_discount_pct: int, print_discount_pct: int, created_at, updated_at)` with
  `@@unique(org_id, tier)` and `@@index(org_id)`. Percentages are integers 0–100. Ordered Supabase migration; the
  seed upserts the current-behavior rows for the seeded org.
- **FR-401** (ubiquitous) — `lib/db/tier-config.ts` reads/writes *shall* be scoped to the caller's server-derived
  `orgId`; the client *shall never* supply `orgId` or a tier rate that is persisted without validation.
- **FR-402** (event-driven) — *When* a print job is priced, the system *shall* resolve the per-page **base rate**
  from `getPrintPricing(orgId)` (BW vs COLOR) and the `printDiscountPct` from the member's tier config
  (`getTierDiscounts(orgId, tier)`), applying both server-side — replacing the `PRINT_RATE_*` and `TIER_DISCOUNT_RATE`
  constants. Absent a config row, base rate *shall* fall back to the constant default and discount to 0 (fail-safe).
- **FR-406** (event-driven) — *When* an ADMIN saves print base rates, the system *shall* validate each is a positive
  integer (Rupiah), reject otherwise (no write), and persist only the caller-org's `org_print_pricing` row.
- **FR-403** (event-driven, conditional) — *When* a cafe order is priced **and** discount eligibility is true
  (active session, AC-115), the system *shall* apply the member's tier `cafeDiscountPct` from config — replacing the
  `MEMBER_DISCOUNT_RATE` constant. Ineligible or no config row → 0%.
- **FR-404** (event-driven) — *When* an ADMIN saves a tier's rates, the system *shall* validate each percentage is an
  integer in `[0, 100]` server-side, reject otherwise (no write), and persist only the caller-org's row for that tier.
- **FR-405** (state-driven) — *While* a non-ADMIN requests `/admin/settings/tiers` or its save action, the system
  *shall* deny server-side (middleware + `(admin)` layout guard for the page; explicit ADMIN check in the action).
- **NFR-400** (ubiquitous) — Money math stays integer Rupiah; `discountRupiah = round(subtotal * pct/100)`. Changing
  config *shall not* retro-alter already-persisted orders/jobs (rates are read at pricing time only).

## Acceptance criteria (Given/When/Then)
- **AC-400** — Config is org-scoped + seeded to current behavior. *Given* seeded orgs A and B, *When*
  `listTierConfig(orgA)` runs, *Then* it returns exactly A's 3 tier rows (cafe 5 all; print 0/20/20) and never B's. — **Integration**.
- **AC-401** — Print pricing reads config. *Given* a PREMIUM member in an org whose PREMIUM `printDiscountPct` is set
  to 30, *When* a print job is priced, *Then* the discount applied is 30% (not the old constant 20%). — **Integration**.
- **AC-402** — Cafe pricing reads config. *Given* an eligible member whose tier `cafeDiscountPct` is 5, *When* an
  order is priced, *Then* `discountRupiah = round(subtotal * 0.05)`; *Given* the rate is changed to 10, *Then* a new
  order applies 10%. — **Integration**.
- **AC-403** — Admin save validates + persists. *Given* an ADMIN sets PREMIUM print to 25, *When* the save action
  runs, *Then* the org's PREMIUM row updates to 25; *Given* a value of 150 or −1 or 12.5, *Then* it is rejected with
  no write. — **Integration**.
- **AC-404** — Non-ADMIN cannot save. *Given* a MEMBER invoking the save action, *When* it runs, *Then* it is denied
  (FORBIDDEN) with no write. — **Integration**.
- **AC-405** — Editor renders current rates + the launcher card links here. *Given* the seeded config, *When* an ADMIN
  opens `/admin/settings/tiers`, *Then* the table shows 3 tier rows with their current rates; the Settings card
  "Kategori Membership" links to this route. — **Unit** (RTL render) + the link.
- **AC-406** — Pure pricing fns apply explicit rates. *Given* `computePrintTotal` called with given
  `bwRateRupiah`/`colorRateRupiah`/`discountPct` (and `computeOrderTotals` with `discountPct`), *Then* subtotal uses
  the passed base rate and discount = `round(subtotal * pct/100)`, total = subtotal − discount. — **Unit**.
- **AC-407** — Print base rates read + edited from config. *Given* an org whose COLOR rate is set to 2000, *When* a
  COLOR print job is priced, *Then* the per-page rate used is 2000 (not the constant 1500); *Given* an ADMIN saves a
  base rate of 0 or −1 or 1.5, *Then* it is rejected with no write. — **Integration**.

## Traceability (owning layer per ADR-0010)
| AC | Owning layer |
|----|--------------|
| AC-400, AC-401, AC-402, AC-403, AC-404, AC-407 | Integration (Drizzle vs Supabase local) — config + money paths + authz |
| AC-405 | Unit (RTL) — editor render + nav link |
| AC-406 | Unit (Vitest) — pure pricing with explicit rates |

Admin-route authz (non-admin → redirect) is already e2e/layout-owned; FR-405's action-level check is proven by AC-404.

## Key decisions baked in (for owner sign-off)
1. **Storage:** one `membership_tier_config` row per `{org, tier}` holding both cafe + print pct — not a generic
   key-value settings table (keeps it typed + simple; other settings cards get their own tables later).
2. **Cafe stays "flat per active session," just configurable per tier** (seeded 5% for all tiers → identical to
   today). Cafe discount does **not** become tiered-by-default; an admin *could* set different cafe rates per tier,
   but the seed preserves the replica's flat 5%.
3. **Print BW/COLOR base rates ARE configurable** this issue (owner add-on 2026-06-23) — a per-org
   `org_print_pricing` row (global, not per-tier), seeded to the current 500/1500.
4. **Fail-safe default:** a missing config row → 0% discount (never an unintended larger discount).
