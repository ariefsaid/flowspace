# Plan I-041 — Tier model correction (four discount dimensions)

- **Spec:** `docs/specs/0008-tier-model.spec.md` (signed off). **Depends:** 0002, 0006; ADR-0010/0011/0015/0016.
- **Goal:** widen `membership_tier_config` from 2 → 4 discount dimensions (coworking/meeting/cafe/print) with
  integer percentages; replace spec-0006 guess seed values with the locked map
  `REGULAR 0/0/0/0, PREMIUM 10/10/5/5, GOLD 15/15/10/10`; expose all four through the repo + `/admin/settings/tiers`;
  prove the values flow into cafe and print totals and are exposed to the I-040 booking seam; record DIV-1 (ADR-0016).
- **MONEY PATH:** tasks **12–13** are the integration money-proof gate (AC-512..519). All business reads/writes
  stay server-authoritative and `org_id`-scoped; RLS remains the defense-in-depth backstop.
- **Head migration:** `0009_money_qty_checks.sql` → this wave adds **`0010_tier_model.sql`** (exactly per spec §Migration).

## Design

### Data model (DIV-1, ADR-0016)
Keep the `MembershipTier` enum and the org-scoped `membership_tier_config` table. `0010_tier_model.sql` adds
`coworking_discount_pct` and `meeting_discount_pct` (integer NOT NULL DEFAULT 0), drops/re-adds the
`membership_tier_config_pct_range` CHECK so all **four** columns are `BETWEEN 0 AND 100`, and rewrites every
existing row by enum tier to the locked values. Enum, `(org_id, tier)` unique index, `org_id` index, and the
`_org_isolation` RLS policy are untouched (the policy references only `org_id`; the new columns need no policy
change). `lib/db/schema.ts` mirrors the two new columns in lockstep (drizzle-kit is not the DDL authority).

### Repository seam (`lib/db/tier-config.ts`)
`getTierDiscounts` returns all four camelCase fields, fail-closed to four zeroes on a missing row. `updateTierDiscounts`
takes all four in a shared `TierDiscounts` shape, validates each is an integer 0–100 (throwing
`INVALID_PCT:<coworking|meeting|cafe|print>`), rejects a tier outside the enum (`INVALID_TIER`), and upserts all
four atomically under the `(org_id, tier)` unique index. `listTierConfig` (org-scoped) returns full rows. Existing
consumers `lib/db/cafe.ts` (`.cafeDiscountPct`) and `lib/db/print.ts` (`.printDiscountPct`) keep working unchanged.

### Shared locked map (`lib/tier-discounts.ts`)
One canonical four-dimensional map (`LOCKED_TIER_DISCOUNTS`) is the single source used by the seed; the stale
spec-0006 guesses (`DEFAULT_CAFE_DISCOUNT_PCT = 5`, `DEFAULT_PRINT_DISCOUNT_PCT = 0/20/20`) are removed so seed
and fallback cannot drift (FR-529 / AC-527). The runtime fail-safe is `getTierDiscounts` returning zeroes.

### Admin editor (`/admin/settings/tiers`)
The `TierRow` shape and `SavePricingConfigInput.tiers` grow from two to four fields; the client renders four
labelled percentage inputs per tier (Coworking %, Meeting %, Cafe %, Print %) using DESIGN.md `Input`; the save
action forwards all four per tier and the repos validate server-side (ADMIN-only via the existing
`app/(admin)/layout.tsx` guard + the action's `requireSession` role check). All-or-nothing within one `db.transaction`.

### Books apply
Booking pricing (applying coworking/meeting %) is **I-040's** concern; this plan only ships the seam (`FR-527`,
`AC-518`) and its integration proof that the repo exposes 10%/15% to the consumer.

## Tasks

### 1. Add `supabase/migrations/0010_tier_model.sql` (schema + seed rewrite) — AC-500, AC-501, AC-502, AC-504
Create `supabase/migrations/0010_tier_model.sql`:

```sql
-- Tier model correction (I-041, spec 0008, DIV-1/ADR-0016). After 0009_money_qty_checks.sql.
-- Widens membership_tier_config from the 2-dim (cafe/print) spec-0006 shape to all four
-- dimensions (coworking/meeting/cafe/print), widens the CHECK to cover all four, and
-- rewrites every existing org's rows to the locked values. Enum, (org_id,tier) unique
-- index, org_id index, and the _org_isolation RLS policy are left unchanged.

ALTER TABLE "public"."membership_tier_config"
  ADD COLUMN "coworking_discount_pct" integer NOT NULL DEFAULT 0,
  ADD COLUMN "meeting_discount_pct" integer NOT NULL DEFAULT 0;

ALTER TABLE "public"."membership_tier_config"
  DROP CONSTRAINT "membership_tier_config_pct_range";

ALTER TABLE "public"."membership_tier_config"
  ADD CONSTRAINT "membership_tier_config_pct_range" CHECK (
    "coworking_discount_pct" BETWEEN 0 AND 100 AND
    "meeting_discount_pct" BETWEEN 0 AND 100 AND
    "cafe_discount_pct" BETWEEN 0 AND 100 AND
    "print_discount_pct" BETWEEN 0 AND 100
  );

-- Rewrite every org's rows to the locked values (FR-521). ORIG base/mid/top →
-- REGULAR/PREMIUM/GOLD.
UPDATE "public"."membership_tier_config" SET
  "coworking_discount_pct" = 0, "meeting_discount_pct" = 0,
  "cafe_discount_pct" = 0, "print_discount_pct" = 0
  WHERE "tier" = 'REGULAR';
UPDATE "public"."membership_tier_config" SET
  "coworking_discount_pct" = 10, "meeting_discount_pct" = 10,
  "cafe_discount_pct" = 5, "print_discount_pct" = 5
  WHERE "tier" = 'PREMIUM';
UPDATE "public"."membership_tier_config" SET
  "coworking_discount_pct" = 15, "meeting_discount_pct" = 15,
  "cafe_discount_pct" = 10, "print_discount_pct" = 10
  WHERE "tier" = 'GOLD';
```

Verify: `pnpm exec supabase db reset && pnpm exec supabase db reset` (applies cleanly twice; CI path).

### 2. Mirror the two columns in `lib/db/schema.ts` — AC-500 (TS mirror)
In `lib/db/schema.ts`, `membershipTierConfig` table: add the two fields before `cafeDiscountPct`:

```ts
    coworkingDiscountPct: integer("coworking_discount_pct").notNull().default(0),
    meetingDiscountPct: integer("meeting_discount_pct").notNull().default(0),
    cafeDiscountPct: integer("cafe_discount_pct").notNull().default(0),
    printDiscountPct: integer("print_discount_pct").notNull().default(0),
```

Verify: `pnpm typecheck`.

### 3. Create shared locked map + unit test — AC-527
Create `lib/tier-discounts.ts`:

```ts
import type { MembershipTier } from "@/lib/db/enums";

/** One tier's four discount percentages (integer points, 0–100). */
export type TierDiscounts = {
  coworkingDiscountPct: number;
  meetingDiscountPct: number;
  cafeDiscountPct: number;
  printDiscountPct: number;
};

/**
 * Locked four-dimensional tier map (I-041, spec 0008; supersedes spec-0006's flat
 * 5% cafe + 0/20/20 print guesses). Single source of truth for the migration, dev
 * seed, and money paths so seed and fallback cannot drift (FR-529 / AC-527).
 * ORIG base/mid/top → REGULAR/PREMIUM/GOLD.
 */
export const LOCKED_TIER_DISCOUNTS: Record<MembershipTier, TierDiscounts> = {
  REGULAR: { coworkingDiscountPct: 0, meetingDiscountPct: 0, cafeDiscountPct: 0, printDiscountPct: 0 },
  PREMIUM: { coworkingDiscountPct: 10, meetingDiscountPct: 10, cafeDiscountPct: 5, printDiscountPct: 5 },
  GOLD: { coworkingDiscountPct: 15, meetingDiscountPct: 15, cafeDiscountPct: 10, printDiscountPct: 10 },
};
```

**Test first** — create `lib/tier-discounts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LOCKED_TIER_DISCOUNTS } from "@/lib/tier-discounts";
import * as cafePricing from "@/lib/cafe/pricing";
import * as printPricing from "@/lib/print/pricing";

describe("LOCKED_TIER_DISCOUNTS", () => {
  it("AC-527: holds the exact locked 4-dim values (no 5/5/5 or 0/20/20 guess)", () => {
    expect(LOCKED_TIER_DISCOUNTS.REGULAR).toEqual({ coworkingDiscountPct: 0, meetingDiscountPct: 0, cafeDiscountPct: 0, printDiscountPct: 0 });
    expect(LOCKED_TIER_DISCOUNTS.PREMIUM).toEqual({ coworkingDiscountPct: 10, meetingDiscountPct: 10, cafeDiscountPct: 5, printDiscountPct: 5 });
    expect(LOCKED_TIER_DISCOUNTS.GOLD).toEqual({ coworkingDiscountPct: 15, meetingDiscountPct: 15, cafeDiscountPct: 10, printDiscountPct: 10 });
  });

  it("AC-527: stale spec-0006 guess constants are removed from pricing defaults", () => {
    expect("DEFAULT_CAFE_DISCOUNT_PCT" in cafePricing).toBe(false);
    expect("DEFAULT_PRINT_DISCOUNT_PCT" in printPricing).toBe(false);
  });
});
```

Verify: `pnpm test:unit -- lib/tier-discounts.test.ts` (fails on the second `it` until Task 6 runs — that's fine,
TDD). Complete both Tasks 3 and 6, then run green.

### 4. Rewrite `lib/db/tier-config.ts` to four dimensions + validation — AC-508, AC-523
Replace the file body (keeping the existing exports' signatures except widening `getTierDiscounts`/`updateTierDiscounts`):

```ts
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { membershipTierConfig, type MembershipTierConfig } from "@/lib/db/schema";
import { MEMBERSHIP_TIERS, type MembershipTier } from "@/lib/db/enums";
import type { TierDiscounts } from "@/lib/tier-discounts";

const PCT_DIMS = ["coworking", "meeting", "cafe", "print"] as const;

export function listTierConfig(orgId: string): Promise<MembershipTierConfig[]> {
  return db
    .select()
    .from(membershipTierConfig)
    .where(eq(membershipTierConfig.orgId, orgId))
    .orderBy(asc(membershipTierConfig.tier));
}

/** All four discount % for one (org, tier); fail-closed to zeroes when absent (NFR-500). */
export async function getTierDiscounts(
  orgId: string,
  tier: MembershipTier,
): Promise<TierDiscounts> {
  const [row] = await db
    .select({
      coworkingDiscountPct: membershipTierConfig.coworkingDiscountPct,
      meetingDiscountPct: membershipTierConfig.meetingDiscountPct,
      cafeDiscountPct: membershipTierConfig.cafeDiscountPct,
      printDiscountPct: membershipTierConfig.printDiscountPct,
    })
    .from(membershipTierConfig)
    .where(and(eq(membershipTierConfig.orgId, orgId), eq(membershipTierConfig.tier, tier)))
    .limit(1);
  return (
    row ?? { coworkingDiscountPct: 0, meetingDiscountPct: 0, cafeDiscountPct: 0, printDiscountPct: 0 }
  );
}

function assertPct(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`INVALID_PCT:${label}`);
  }
}

/** ADMIN-only (caller enforces role). Validates all four + tier; upserts atomically. */
export async function updateTierDiscounts(
  orgId: string,
  tier: MembershipTier,
  rates: TierDiscounts,
  txdb: Pick<typeof db, "insert"> = db,
): Promise<void> {
  if (!MEMBERSHIP_TIERS.includes(tier)) throw new Error("INVALID_TIER");
  PCT_DIMS.forEach((d) => assertPct(rates[`${d}DiscountPct`], d));
  await txdb
    .insert(membershipTierConfig)
    .values({
      orgId,
      tier,
      coworkingDiscountPct: rates.coworkingDiscountPct,
      meetingDiscountPct: rates.meetingDiscountPct,
      cafeDiscountPct: rates.cafeDiscountPct,
      printDiscountPct: rates.printDiscountPct,
    })
    .onConflictDoUpdate({
      target: [membershipTierConfig.orgId, membershipTierConfig.tier],
      set: {
        coworkingDiscountPct: rates.coworkingDiscountPct,
        meetingDiscountPct: rates.meetingDiscountPct,
        cafeDiscountPct: rates.cafeDiscountPct,
        printDiscountPct: rates.printDiscountPct,
        updatedAt: new Date(),
      },
    });
}
```

**Test first** — create `lib/db/tier-config.test.ts` (unit; mock the inserted tx so no write occurs):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn();
vi.mock("@/lib/db/drizzle", () => ({
  db: {},
}));

import { updateTierDiscounts } from "@/lib/db/tier-config";

describe("updateTierDiscounts validation (AC-508 / AC-523 / AC-526)", () => {
  beforeEach(() => insert.mockReset());

  it("AC-508: rejects fractional with the matching INVALID_PCT:<dimension> label", async () => {
    await expect(
      updateTierDiscounts("o1", "PREMIUM", {
        coworkingDiscountPct: 1, meetingDiscountPct: 1,
        cafeDiscountPct: 12.5, printDiscountPct: 1,
      }, { insert } as never),
    ).rejects.toThrow("INVALID_PCT:cafe");
    expect(insert).not.toHaveBeenCalled();
  });

  it("AC-508: rejects negative/over-100 for a named dimension, no write", async () => {
    await expect(
      updateTierDiscounts("o1", "GOLD", {
        coworkingDiscountPct: -1, meetingDiscountPct: 1,
        cafeDiscountPct: 1, printDiscountPct: 1,
      }, { insert } as never),
    ).rejects.toThrow("INVALID_PCT:coworking");
    await expect(
      updateTierDiscounts("o1", "GOLD", {
        coworkingDiscountPct: 1, meetingDiscountPct: 101,
        cafeDiscountPct: 1, printDiscountPct: 1,
      }, { insert } as never),
    ).rejects.toThrow("INVALID_PCT:meeting");
    expect(insert).not.toHaveBeenCalled();
  });

  it("AC-523 / AC-526: rejects a tier outside the enum, no write", async () => {
    await expect(
      updateTierDiscounts("o1", "PLATINUM" as never, {
        coworkingDiscountPct: 1, meetingDiscountPct: 1,
        cafeDiscountPct: 1, printDiscountPct: 1,
      }, { insert } as never),
    ).rejects.toThrow("INVALID_TIER");
    expect(insert).not.toHaveBeenCalled();
  });
});
```

Verify: `pnpm test:unit -- lib/db/tier-config.test.ts`.

### 5. Update dev seed to the locked map (idempotent, all four dims) — FR-529, AC-503 (source)
In `scripts/seed-supabase.ts`:
1. Remove `import { DEFAULT_CAFE_DISCOUNT_PCT } from "@/lib/cafe/pricing";` and the `DEFAULT_PRINT_DISCOUNT_PCT`
   import from `@/lib/print/pricing`; add `import { LOCKED_TIER_DISCOUNTS } from "@/lib/tier-discounts";`.
2. Replace the tier-config insert with an **upsert** that sets all four dimensions for the org's tier:

```ts
  // -- Pricing config (I-041, spec 0008) — 4-dim locked map, idempotent upsert ----
  for (const tier of MEMBERSHIP_TIERS) {
    const id = `${org.id}__tiercfg-${tier}`;
    await db
      .insert(membershipTierConfig)
      .values({ id, orgId: org.id, tier, ...LOCKED_TIER_DISCOUNTS[tier] })
      .onConflictDoUpdate({
        target: [membershipTierConfig.orgId, membershipTierConfig.tier],
        set: { ...LOCKED_TIER_DISCOUNTS[tier], updatedAt: new Date() },
      });
  }
```

Verify: `pnpm db:seed:supabase && pnpm db:seed:supabase` (runs twice; no duplicate rows). (Fresh-DB duplication
assertion is the integration test in Task 12.)

### 6. Strip stale guess constants from pricing fallbacks — AC-527, FR-529
- In `lib/cafe/pricing.ts`: delete `export const DEFAULT_CAFE_DISCOUNT_PCT = 5;` and update its doc comment to
  state the fail-safe is the repo's `getTierDiscounts` (0% when ineligible / unconfigured).
- In `lib/print/pricing.ts`: delete `export const DEFAULT_PRINT_DISCOUNT_PCT = { REGULAR: 0, PREMIUM: 20, GOLD: 20 } as const;`
  and update its doc comment to note the per-tier print discount is resolved from `membership_tier_config` via
  `getTierDiscounts` (fail-safe 0%).

Verify: `pnpm test:unit -- lib/tier-discounts.test.ts` now passes both `it` blocks.

### 7. Update the admin save action to four dimensions — AC-510, AC-521, AC-524, AC-526
In `app/(admin)/admin/settings/tiers/actions.ts`:
1. Replace the tier entry type and the loop body:

```ts
import type { TierDiscounts } from "@/lib/tier-discounts";

export type SavePricingConfigInput = {
  printPricing: { bwRatePerPageRupiah: number; colorRatePerPageRupiah: number };
  tiers: Array<TierDiscounts & { tier: MembershipTier }>;
};
```

```ts
    for (const t of input.tiers) {
      const { tier, ...rates } = t; // tier excluded from the four dims
      await updateTierDiscounts(user.orgId, tier, rates, tx);
    }
```

2. Keep the existing `requireSession` + `role !== "ADMIN"` → `FORBIDDEN` guard and the single `db.transaction`.

**Test first** — update `app/(admin)/admin/settings/tiers/actions.test.ts`:
- Replace the two-tier `input` with a three-tier payload whose entries carry all four dims (e.g. PREMIUM
  `{ coworkingDiscountPct: 10, meetingDiscountPct: 10, cafeDiscountPct: 5, printDiscountPct: 5 }`).
- Rename the MEMBER case to `AC-510`, replace `updateTierDiscounts`/`updatePrintPricing` not-called assertions
  (keep), and assert the ADMIN case forwards the full `TierDiscounts` (all four keys) per tier to `updateTierDiscounts`.
- Add `AC-524` (a BARISTA is denied `FORBIDDEN`, no write) — supersedes the old AC-404 body.
- Add `AC-526` (ADMIN save with `cafeDiscountPct: 101` — repos mock rejects → action throws and
  `updatePrintPricing`/`updateTierDiscounts` surface the error; no partial success).
- Add `AC-521` (the admin payload contains all four dimensions for every known tier before call).

Verify: `pnpm test:unit -- "app/(admin)/admin/settings/tiers/actions.test.ts"`.

### 8. Widen the RSC projection in `app/(admin)/admin/settings/tiers/page.tsx` — AC-520 (data in)
Project all four per tier (fill four zeroes for unconfigured tiers):

```ts
      tier,
      coworkingDiscountPct: row?.coworkingDiscountPct ?? 0,
      meetingDiscountPct: row?.meetingDiscountPct ?? 0,
      cafeDiscountPct: row?.cafeDiscountPct ?? 0,
      printDiscountPct: row?.printDiscountPct ?? 0,
```

Verify: `pnpm typecheck`.

### 9. [UI] Widen the editor to four inputs per tier — AC-520, AC-522, AC-525
In `app/(admin)/admin/settings/tiers/TiersClient.tsx` (use only DESIGN.md `Input`/`Card`/`Button` tokens):
1. `TierRow` gains `coworkingDiscountPct` and `meetingDiscountPct`; `setTierField`'s field union becomes
   `"coworkingDiscountPct" | "meetingDiscountPct" | "cafeDiscountPct" | "printDiscountPct"`.
2. Add Coworking and Meeting labelled inputs to the table (labels `Diskon coworking ${tier}` /
   `Diskon meeting ${tier}`), keeping the existing Cafe/Print inputs.

**Test first** — update `app/(admin)/admin/settings/tiers/TiersClient.test.tsx`:
- `AC-520`: render seeded 4-dim tiers; assert the four labelled inputs are populated
  `0/0/0/0, 10/10/5/5, 15/15/10/10` (e.g. `getByLabelText("Diskon cafe PREMIUM")` → 5,
  `getByLabelText("Diskon meeting GOLD")` → 15, `getByLabelText("Diskon coworking PREMIUM")` → 10).
- `AC-525`: assert only enum tier labels are rendered (no dynamic display-name/color metadata dependency).
- `AC-522`: mock `savePricingConfigAction` to reject; render, submit Save, assert an error state is shown and
  the saved indicator is absent (`screen.queryByText("Tersimpan")` null, `role="alert"` present).

Verify: `pnpm test:unit -- "app/(admin)/admin/settings/tiers/TiersClient.test.tsx"`.

### 10. Cafe money math unit — AC-514
In `lib/cafe/pricing.test.ts` add:

```ts
  it("AC-514: discount rounds with Math.round on a fractional-Rupiah subtotal", () => {
    // subtotal 100000 × 3 = ... use a subtotal that fractions: 3 lines summing to 100001
    const frac: PricedLine[] = [
      { menuItemId: "a", nameSnapshot: "A", qty: 1, unitPriceRupiah: 50000 },
      { menuItemId: "b", nameSnapshot: "B", qty: 1, unitPriceRupiah: 33334 },
      { menuItemId: "c", nameSnapshot: "C", qty: 1, unitPriceRupiah: 16667 },
    ]; // subtotal = 100001
    // 10% → 10000.1 → Math.round → 10000
    expect(computeOrderTotals(frac, { discountPct: 10 })).toEqual({
      subtotalRupiah: 100001,
      discountRupiah: 10000,
      totalRupiah: 90001,
    });
  });
```

Verify: `pnpm test:unit -- lib/cafe/pricing.test.ts`.

### 11. Print money math unit — AC-516
In `lib/print/pricing.test.ts` add:

```ts
  it("AC-516: discounts round to whole Rupiah on a fractional subtotal", () => {
    const t = computePrintTotal({
      pages: 2, copies: 1, colorMode: "BW",
      bwRateRupiah: 3333, colorRateRupiah: 1000, discountPct: 10,
    });
    // subtotal = 3333 × 2 = 6666 → 10% = 666.6 → Math.round = 667
    expect(t.discountRupiah).toBe(667);
    expect(t.totalRupiah).toBe(5999);
    expect(Number.isInteger(t.discountRupiah)).toBe(true);
    expect(Number.isInteger(t.totalRupiah)).toBe(true);
  });
```

Verify: `pnpm test:unit -- lib/print/pricing.test.ts`.

### 12. [MONEY-PATH] `lib/db/tier-model.int.test.ts` — AC-500..519, AC-528
Create the new integration file (Vitest vs TEST_DATABASE_URL, same truncate/setup pattern as
`lib/db/pricing-config.int.test.ts`). Seed org A (0/0/0/0, 10/10/5/5, 10/10/5/5 for the three) and org B with
distinct values, plus menu items and 3 member users (REGULAR/PREMIUM/GOLD) for A and a print-eligible user.
Own one canonical test per AC (each `it` titled with its `AC-###`):

- **AC-500** — `information_schema.columns` for the 4 pct columns (integer, nullable=NO, default=0) and confirm
  `pg_enum` values are exactly `{REGULAR,PREMIUM,GOLD}`.
- **AC-501** — raw `UPDATE ... SET coworking_discount_pct = 150` rejects; row unchanged (re-read).
- **AC-502** — after reset+seed, assert each org tier row equals the locked map (0/0/0/0, 10/10/5/5, 15/15/10/10)
  and no row holds stale 5/20 guesses.
- **AC-503** — run the seed-upsert block twice; assert one row per `(org,tier)` (count = 3 tiers × orgs), locked values.
- **AC-504** — `pg_policies` has `membership_tier_config_org_isolation`; `pg_indexes` has
  `membership_tier_config_org_id_tier_idx` (unique) and `membership_tier_config_org_id_idx`.
- **AC-505** — `listTierConfig(A)` returns only A's rows, each with four dims.
- **AC-506** — `getTierDiscounts(A, GOLD)` (no row) → four zeroes; B's row never surfaced.
- **AC-507** — `updateTierDiscounts(A, PREMIUM, four)` upserts all four; B's PREMIUM unchanged; read back.
- **AC-509** — within a `db.transaction(tx)`: valid `updateTierDiscounts(REGULAR, tx)` then invalid
  `updateTierDiscounts(PREMIUM, {cafeDiscountPct:101}, tx)` → rejects; assert REGULAR row was **not** persisted
  (rollback) and PREMIUM unchanged.
- **AC-511** — org A and org B both have PREMIUM; `updateTierDiscounts(A, PREMIUM, ...)` leaves B's PREMIUM
  untouched and A's rows all `orgId === A`.
- **AC-512** — `createOrder(eligible=true)` for the 3 A users on equal subtotal → discounts 0%, 5%, 10%
  (PREMIUM/GOLD totals reduced).
- **AC-513** — `createOrder(eligible=false)` for a GOLD user with 10% config → discount 0%.
- **AC-515** — `submitPrintJob` for REGULAR/PREMIUM/GOLD users (equal BW pages) → print discounts 0%, 5%, 10%.
- **AC-517** — persist an order + a print job; `updateTierDiscounts` to new values; re-read the **stored** totals
  (unchanged) and price a new item (uses the new %).
- **AC-518** — `getTierDiscounts(A, PREMIUM)` exposes `coworkingDiscountPct === 10` & `meetingDiscountPct === 10`;
  GOLD → 15/15 (the I-040 seam contract; I-040 owns the booking-total assertion).
- **AC-519** — an org/tier with **no** config row (e.g. B's REGULAR) → cafe & print pricing apply 0%.
- **AC-528** — two orgs share tier names; `listTierConfig` and `updateTierDiscounts` affect only the server-derived org.

Verify: `pnpm test:int -- lib/db/tier-model.int.test.ts` (with `supabase start` + `db reset` first).

### 13. Update `lib/db/pricing-config.int.test.ts` for the widened shape — AC-401, AC-407
- Remove the superseded **AC-400**, **AC-402**, **AC-403** `it` blocks (superseded by AC-505/512-513/507-509-526).
  Keep **AC-401** (submitPrintJob applies configured print discount + base rate) and **AC-407** (getPrintPricing
  fallback; updatePrintPricing validates) — adjust the **AC-401** expectations to the widened model (PREMIUM print
  5% not 20%; update the `getTierDiscounts` assertions to the four-field shape where referenced).
- Where the file still calls `getTierDiscounts`/sets tier config, use the four-dim `TierDiscounts` shape.

Verify: `pnpm test:int -- lib/db/pricing-config.int.test.ts`.

### 14. `[UI]` Regression on the route guard — AC-524 (route layer)
`app/(admin)/layout.tsx` already redirects non-ADMIN (`if (user.role !== "ADMIN") redirect(roleHome(user.role))`)
and is covered by `app/(admin)/layout.test.tsx`. Add one `it` asserting a MEMBER is redirected (AC-524) if not
already present; otherwise leave as-is. This is the route-side complement to the action's independent `FORBIDDEN`
(AC-510). Verify: `pnpm test:unit -- "app/(admin)/layout.test.tsx"`.

### 15. Full verification gate — AC-529 + quality gates
Run, in order, at repo root:
```
pnpm typecheck
pnpm lint:ci
pnpm exec supabase db reset && pnpm db:seed:supabase
pnpm test:unit
pnpm test:int
# Traceability: every AC-500..AC-528 appears exactly once in a canonical test title
grep -rhoE "AC-5[0-9]{2}" --include=*.test.ts --include=*.int.test.ts app lib | sort | uniq -c
```
Every AC-500..AC-528 must appear with count `1`. Then `pnpm test:coverage` and confirm ≥80% changed-line
coverage on `lib/db/tier-config.ts`, `lib/db/tier-model.int.test.ts`, the admin tiers surface, and
`lib/tier-discounts.ts`.

## Traceability table

| AC | Owning test file | Layer |
|---|---|---|
| AC-500 | `lib/db/tier-model.int.test.ts` | Integration |
| AC-501 | `lib/db/tier-model.int.test.ts` | Integration |
| AC-502 | `lib/db/tier-model.int.test.ts` | Integration |
| AC-503 | `lib/db/tier-model.int.test.ts` | Integration |
| AC-504 | `lib/db/tier-model.int.test.ts` | Integration |
| AC-505 | `lib/db/tier-model.int.test.ts` | Integration |
| AC-506 | `lib/db/tier-model.int.test.ts` | Integration |
| AC-507 | `lib/db/tier-model.int.test.ts` | Integration |
| AC-508 | `lib/db/tier-config.test.ts` | Unit |
| AC-509 | `lib/db/tier-model.int.test.ts` | Integration |
| AC-510 | `app/(admin)/admin/settings/tiers/actions.test.ts` | Unit |
| AC-511 | `lib/db/tier-model.int.test.ts` | Integration |
| AC-512 | `lib/db/tier-model.int.test.ts` | Integration (money) |
| AC-513 | `lib/db/tier-model.int.test.ts` | Integration (money) |
| AC-514 | `lib/cafe/pricing.test.ts` | Unit |
| AC-515 | `lib/db/tier-model.int.test.ts` | Integration (money) |
| AC-516 | `lib/print/pricing.test.ts` | Unit |
| AC-517 | `lib/db/tier-model.int.test.ts` | Integration (money) |
| AC-518 | `lib/db/tier-model.int.test.ts` | Integration (I-040 seam) |
| AC-519 | `lib/db/tier-model.int.test.ts` | Integration (money) |
| AC-520 | `app/(admin)/admin/settings/tiers/TiersClient.test.tsx` | Unit (RTL) |
| AC-521 | `app/(admin)/admin/settings/tiers/actions.test.ts` | Unit |
| AC-522 | `app/(admin)/admin/settings/tiers/TiersClient.test.tsx` | Unit (RTL) |
| AC-523 | `lib/db/tier-config.test.ts` | Unit |
| AC-524 | `app/(admin)/admin/settings/tiers/actions.test.ts` + `app/(admin)/layout.test.tsx` | Unit |
| AC-525 | `app/(admin)/admin/settings/tiers/TiersClient.test.tsx` | Unit (RTL) |
| AC-526 | `app/(admin)/admin/settings/tiers/actions.test.ts` | Unit |
| AC-527 | `lib/tier-discounts.test.ts` | Unit |
| AC-528 | `lib/db/tier-model.int.test.ts` | Integration |
| AC-529 | Task 15 grep verified once at issue time | Unit (traceability check) |

**Superseded (spec 0008):** AC-400, AC-402, AC-403, AC-405 replaced by the rows above; AC-401, AC-404, AC-406,
AC-407 remain authoritative (their tier-dependent proofs use the widened model).

## Open questions
None for the Director — enum shape and locked seed are approved by the brief; I-040 owns the booking-total
consumer per FR-527/AC-518.