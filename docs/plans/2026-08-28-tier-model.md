# Plan — Tier model correction · I-041 · 2026-08-28

Spec: `docs/specs/0008-tier-model.spec.md` (signed off). ADR: `docs/adr/0016-tier-enum-vs-crud.md` (DIV-1,
committed with this plan). Migration claimed: **0010** only. **Money path** — tasks 8–10 are the money
proofs; this issue merges FIRST in the wave (I-040 consumes the new columns). Plan authored by the Director
(pi lane escalation).

## Design

One widening pass over the existing seam — no new tables, no new routes. `membership_tier_config` gains
`coworking_discount_pct` and `meeting_discount_pct`; the four seeded values become ORIG's truth
(REGULAR 0/0/0/0 · PREMIUM 10/10/5/5 · GOLD 15/15/10/10, ordered coworking/meeting/cafe/print). The repo
API (`lib/db/tier-config.ts`) returns all four dims (missing row → four zeros, fail-safe); cafe and print
pricing keep their mechanics and merely read corrected values; the two seed constants
(`DEFAULT_CAFE_DISCOUNT_PCT` in `lib/cafe/pricing.ts`, `DEFAULT_PRINT_DISCOUNT_PCT` in
`lib/print/pricing.ts`) are replaced by one shared four-dim map `DEFAULT_TIER_DISCOUNTS` in
`lib/db/tier-config.ts` so seed and fallback can't drift. The editor
(`app/(admin)/admin/settings/tiers/TiersClient.tsx` + `actions.ts`) widens from 2 to 4 inputs per tier;
`savePricingConfigAction` validates and persists all four atomically (existing all-or-nothing transaction).
I-040 reads `coworkingDiscountPct`/`meetingDiscountPct` from `getTierDiscounts` — the seam is this repo
function, nothing else.

## Tasks

1. **Red migration test** — `lib/db/tier-migration.int.test.ts`: failing test titled `AC-500`/`AC-502`:
   after `supabase db reset`, `membership_tier_config` has the four integer NOT NULL DEFAULT 0 columns and
   each seeded org's rows equal REGULAR 0/0/0/0, PREMIUM 10/10/5/5, GOLD 15/15/10/10. Add an `AC-501`/
   `AC-508` case: a direct `db.execute` inserting `coworking_discount_pct = 101` (and `-1` on
   `meeting_discount_pct`) is rejected by the CHECK.
   Verify: `pnpm test:int -- 'lib/db/tier-migration.int.test.ts'` (red).
2. **Migration 0010** — `supabase/migrations/0010_tier_model.sql`:
   ```sql
   ALTER TABLE "membership_tier_config"
     ADD COLUMN "coworking_discount_pct" integer NOT NULL DEFAULT 0,
     ADD COLUMN "meeting_discount_pct"  integer NOT NULL DEFAULT 0;
   ALTER TABLE "membership_tier_config" DROP CONSTRAINT "membership_tier_config_pct_range";
   ALTER TABLE "membership_tier_config" ADD CONSTRAINT "membership_tier_config_pct_range" CHECK (
     "cafe_discount_pct" BETWEEN 0 AND 100 AND "print_discount_pct" BETWEEN 0 AND 100
     AND "coworking_discount_pct" BETWEEN 0 AND 100 AND "meeting_discount_pct" BETWEEN 0 AND 100
   );
   UPDATE "membership_tier_config" SET "coworking_discount_pct"=0,  "meeting_discount_pct"=0,  "cafe_discount_pct"=0,  "print_discount_pct"=0  WHERE "tier"='REGULAR';
   UPDATE "membership_tier_config" SET "coworking_discount_pct"=10, "meeting_discount_pct"=10, "cafe_discount_pct"=5,  "print_discount_pct"=5  WHERE "tier"='PREMIUM';
   UPDATE "membership_tier_config" SET "coworking_discount_pct"=15, "meeting_discount_pct"=15, "cafe_discount_pct"=10, "print_discount_pct"=10 WHERE "tier"='GOLD';
   ```
   (RLS/unique/index untouched.) Verify: `pnpm exec supabase db reset && pnpm test:int -- 'lib/db/tier-migration.int.test.ts'` (green).
3. **Schema mirror** — `lib/db/schema.ts` `membershipTierConfig`: add `coworkingDiscountPct`
   (`integer("coworking_discount_pct").notNull().default(0)`) and `meetingDiscountPct` likewise; extend the
   column assertions in `lib/db/schema.test.ts`. Verify: `pnpm test:unit -- 'lib/db/schema.test.ts' && pnpm typecheck`.
4. **Repo returns 4 dims** — `lib/db/tier-config.ts`: failing unit test `AC-501` in
   `lib/db/tier-config.test.ts` (missing row → `{coworkingDiscountPct:0, meetingDiscountPct:0,
   cafeDiscountPct:0, printDiscountPct:0}`), then widen `getTierDiscounts`'s select + fallback and
   `updateTierDiscounts`'s `rates` param/`assertPct` calls/insert/update sets to all four. Export
   `DEFAULT_TIER_DISCOUNTS = { REGULAR:{coworking:0,meeting:0,cafe:0,print:0}, PREMIUM:{coworking:10,meeting:10,cafe:5,print:5}, GOLD:{coworking:15,meeting:15,cafe:10,print:10} } as const`
   with an `AC-527`-titled unit test asserting the exact map. Verify: `pnpm test:unit -- 'lib/db/tier-config.test.ts'`.
5. **Repo integration proofs** — `lib/db/pricing-config.int.test.ts`: failing tests `AC-505` (listTierConfig
   org-scoped, four dims), `AC-506` (missing row → zeros, no cross-org read), `AC-507` (four-dim upsert org
   A leaves org B), `AC-508` is owned by task 1's file — do not duplicate. Verify:
   `pnpm test:int -- 'lib/db/pricing-config.int.test.ts'`.
6. **Seed uses the shared map** — `scripts/seed-supabase.ts`: replace the
   `DEFAULT_CAFE_DISCOUNT_PCT`/`DEFAULT_PRINT_DISCOUNT_PCT[tier]` writes (lines ~380–381) with
   `DEFAULT_TIER_DISCOUNTS[tier]` spread into all four columns; delete `DEFAULT_CAFE_DISCOUNT_PCT` from
   `lib/cafe/pricing.ts` and `DEFAULT_PRINT_DISCOUNT_PCT` from `lib/print/pricing.ts` and fix their
   importers (`grep -rn "DEFAULT_CAFE_DISCOUNT_PCT\|DEFAULT_PRINT_DISCOUNT_PCT" lib app scripts` must
   return only `DEFAULT_TIER_DISCOUNTS` call sites). `AC-503` integration test (seed twice → one row per
   tier per org, locked values) in `lib/db/tier-migration.int.test.ts`. Verify:
   `pnpm exec supabase db reset && pnpm db:seed:supabase && pnpm test:int -- 'lib/db/tier-migration.int.test.ts'`.
7. **Action validates 4 dims** — `app/(admin)/admin/settings/tiers/actions.ts` + `actions.test.ts`: failing
   `AC-510` test (MEMBER → FORBIDDEN, zero repo calls) already exists for 2 dims — extend the input type
   `SavePricingConfigInput` to four per-tier fields; add `AC-509` integration case (one invalid tier value
   in the batch → whole transaction rolls back incl. print rates) to `lib/db/pricing-config.int.test.ts`;
   add `AC-523` unit case (tier outside enum rejected). Verify:
   `pnpm test:unit -- 'app/(admin)/admin/settings/tiers/actions.test.ts' && pnpm test:int -- 'lib/db/pricing-config.int.test.ts'`.
8. **Money proof: cafe** — `lib/db/cafe.int.test.ts`: failing `AC-512`/`AC-513` tests — three members
   (REGULAR/PREMIUM/GOLD) each with an ACTIVE booking, same cart → discounts 0%/5%/10% of subtotal; same
   members without ACTIVE booking → 0%. `AC-519`: org with no config rows → 0%. (Mechanic untouched —
   `lib/db/cafe.ts:152` already reads config; only values/dims change.) `AC-514` rounding stays owned by
   the existing `lib/cafe/pricing.test.ts` — retitle its rounding case to `AC-514`. Verify:
   `pnpm test:int -- 'lib/db/cafe.int.test.ts' && pnpm test:unit -- 'lib/cafe/pricing.test.ts'`.
9. **Money proof: print** — `lib/db/print.int.test.ts`: failing `AC-515` (equal BW jobs, tiers → 0/5/10)
   and keep `AC-516` in `lib/print/pricing.test.ts` (retitle existing rounding case). Update any test
   fixture that assumed print 20% (grep `20` in `lib/db/print.int.test.ts` fixtures). Verify:
   `pnpm test:int -- 'lib/db/print.int.test.ts' && pnpm test:unit -- 'lib/print/pricing.test.ts'`.
10. **Config-change isolation proof** — `AC-517` in `lib/db/pricing-config.int.test.ts`: create an order +
    print job, change config, assert stored totals unchanged and a new pricing run uses the new pct.
    `AC-518` (I-040 seam): assert `getTierDiscounts(org, "PREMIUM").coworkingDiscountPct === 10` and
    `.meetingDiscountPct === 10`, GOLD → 15/15 — the booking-total application itself stays I-040's.
    `AC-528` org-parallel proof rides the same file. Verify: `pnpm test:int -- 'lib/db/pricing-config.int.test.ts'`.
11. **[UI] Editor 4 columns** — `app/(admin)/admin/settings/tiers/TiersClient.tsx` + `TiersClient.test.tsx`:
    failing `AC-520` RTL test (four labeled inputs per tier — "Diskon Coworking (%)", "Diskon Meeting (%)",
    "Diskon Cafe (%)", "Diskon Print (%)" — populated 0/0/0/0, 10/10/5/5, 15/15/10/10), `AC-521` (payload
    carries all four per tier), `AC-522` (action error → error state, no success), `AC-525` (enum labels
    only), `AC-526` (server rejects fractional/out-of-range — unit on action, not HTML min/max). DESIGN.md
    tokens only; keep existing layout pattern, extend the grid. `AC-524` stays owned by the existing
    route-policy/layout tests — retitle if needed, do not duplicate. Verify:
    `pnpm test:unit -- 'app/(admin)/admin/settings/tiers/TiersClient.test.tsx' && pnpm lint:ci`.
12. **Traceability + full gates** — confirm each AC-500..529 appears in exactly one test title
    (`for id in $(seq 500 529); do grep -rl "AC-$id" lib app e2e | wc -l; done` — `AC-529` is this check
    itself, documented in the PR body, no standalone test). Then:
    `pnpm exec supabase db reset && pnpm db:seed:supabase && pnpm typecheck && pnpm lint:ci && pnpm test:unit && pnpm test:int && pnpm build`.

## Traceability

| AC | Owning test | Layer |
|---|---|---|
| AC-500 | `lib/db/tier-migration.int.test.ts` — `AC-500` | Integration |
| AC-501 | `lib/db/tier-config.test.ts` — `AC-501` | Unit |
| AC-502 | `lib/db/tier-migration.int.test.ts` — `AC-502` | Integration |
| AC-503 | `lib/db/tier-migration.int.test.ts` — `AC-503` | Integration |
| AC-504 | `lib/db/tier-migration.int.test.ts` — `AC-504` (RLS/unique/index retained) | Integration |
| AC-505 | `lib/db/pricing-config.int.test.ts` — `AC-505` | Integration |
| AC-506 | `lib/db/pricing-config.int.test.ts` — `AC-506` | Integration |
| AC-507 | `lib/db/pricing-config.int.test.ts` — `AC-507` | Integration |
| AC-508 | `lib/db/tier-migration.int.test.ts` — `AC-508` | Integration |
| AC-509 | `lib/db/pricing-config.int.test.ts` — `AC-509` | Integration |
| AC-510 | `app/(admin)/admin/settings/tiers/actions.test.ts` — `AC-510` | Unit |
| AC-511 | `lib/db/pricing-config.int.test.ts` — `AC-511` (cross-org save no-op) | Integration |
| AC-512 | `lib/db/cafe.int.test.ts` — `AC-512` | Integration |
| AC-513 | `lib/db/cafe.int.test.ts` — `AC-513` | Integration |
| AC-514 | `lib/cafe/pricing.test.ts` — `AC-514` | Unit |
| AC-515 | `lib/db/print.int.test.ts` — `AC-515` | Integration |
| AC-516 | `lib/print/pricing.test.ts` — `AC-516` | Unit |
| AC-517 | `lib/db/pricing-config.int.test.ts` — `AC-517` | Integration |
| AC-518 | `lib/db/pricing-config.int.test.ts` — `AC-518` | Integration (I-040 seam) |
| AC-519 | `lib/db/cafe.int.test.ts` — `AC-519` | Integration |
| AC-520 | `app/(admin)/admin/settings/tiers/TiersClient.test.tsx` — `AC-520` | Unit (RTL) |
| AC-521 | `app/(admin)/admin/settings/tiers/TiersClient.test.tsx` — `AC-521` | Unit (RTL) |
| AC-522 | `app/(admin)/admin/settings/tiers/TiersClient.test.tsx` — `AC-522` | Unit (RTL) |
| AC-523 | `app/(admin)/admin/settings/tiers/actions.test.ts` — `AC-523` | Unit |
| AC-524 | existing layout/route-policy tests (retitle to include `AC-524`) | Unit |
| AC-525 | `app/(admin)/admin/settings/tiers/TiersClient.test.tsx` — `AC-525` | Unit (RTL) |
| AC-526 | `app/(admin)/admin/settings/tiers/actions.test.ts` — `AC-526` | Unit |
| AC-527 | `lib/db/tier-config.test.ts` — `AC-527` | Unit |
| AC-528 | `lib/db/pricing-config.int.test.ts` — `AC-528` | Integration |
| AC-529 | PR-body traceability sweep (documented command, task 12) | Meta |

Task count: 12. Riskiest: task 6 (constant deletion touches cafe/print importers — grep-verified) and
tasks 8–9 (money proofs; existing fixtures assume the old 5%/20% values and must flip to spec truth — the
app conforms to the test, and the test to the SPEC, never to the old constants). Migration: 0010.
ADR: 0016 (committed alongside). Open questions: none.
