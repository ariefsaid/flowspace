/**
 * [MONEY-PATH] Integration tests for the widened four-dimensional tier model
 * (I-041, spec 0008). Runs against the Supabase local Postgres via
 * TEST_DATABASE_URL. Owns the schema/repo/money-path integration proofs for
 * the 500–519 and 528 acceptance-criteria range (see the plan's traceability
 * table; each `it()` title below names its own owning criterion).
 *
 * Fixtures:
 *  - Org A: full locked config for REGULAR/PREMIUM/GOLD (0/0/0/0, 10/10/5/5,
 *    15/15/10/10) + three members (one per tier) + a cafe item + print
 *    balance, used for the money-path proofs.
 *  - Org A + B also get a default printer + BW/A4 matrix cell (I-043
 *    precondition for submitPrintJob — resolved before the tier discount).
 *  - Org B: a PREMIUM row with DISTINCT values (used for cross-org isolation)
 *    and a REGULAR member with NO config row (used for the fail-safe 0%
 *    money-path proof below).
 *  - Org C: no config rows at all (used for the fail-closed / no-cross-org-
 *    leak proof below).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import {
  appUsers,
  organizations,
  cafeMenuItems,
  cafeOrders,
  printJobs,
  membershipTierConfig,
  printers,
  orgPrintPricing,
  bookings,
} from "@/lib/db/schema";
import {
  listTierConfig,
  getTierDiscounts,
  updateTierDiscounts,
} from "@/lib/db/tier-config";
import { createOrder } from "@/lib/db/cafe";
import { submitPrintJob } from "@/lib/db/print";
import { LOCKED_TIER_DISCOUNTS } from "@/lib/tier-discounts";
import { MEMBERSHIP_TIERS } from "@/lib/db/enums";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

const TRUNCATE = `TRUNCATE TABLE "bookings","transactions","print_jobs","cafe_order_items","cafe_orders","cafe_menu_items","membership_tier_config","org_print_pricing","app_users","organizations" RESTART IDENTITY CASCADE`;

let orgAId: string;
let orgBId: string;
let orgCId: string;
let regularAId: string;
let premiumAId: string;
let goldAId: string;
let regularBId: string;
let itemAId: string;
let itemBId: string;

beforeAll(async () => {
  await testSql.unsafe(TRUNCATE);

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Tier Org A", slug: "tier-org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Tier Org B", slug: "tier-org-b-test" })
    .returning();
  const [orgC] = await testDb
    .insert(organizations)
    .values({ name: "Tier Org C", slug: "tier-org-c-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;
  orgCId = orgC.id;

  const [regularA, premiumA, goldA] = await testDb
    .insert(appUsers)
    .values([
      { orgId: orgAId, email: "a-regular@x.test", name: "Ar", role: "MEMBER", membershipTier: "REGULAR", printBalance: 100 },
      { orgId: orgAId, email: "a-premium@x.test", name: "Ap", role: "MEMBER", membershipTier: "PREMIUM", printBalance: 100 },
      { orgId: orgAId, email: "a-gold@x.test", name: "Ag", role: "MEMBER", membershipTier: "GOLD", printBalance: 100 },
    ])
    .returning();
  regularAId = regularA.id;
  premiumAId = premiumA.id;
  goldAId = goldA.id;

  const [regularB] = await testDb
    .insert(appUsers)
    .values({ orgId: orgBId, email: "b-regular@x.test", name: "Br", role: "MEMBER", membershipTier: "REGULAR", printBalance: 100 })
    .returning();
  regularBId = regularB.id;

  const [itemA] = await testDb
    .insert(cafeMenuItems)
    .values({ orgId: orgAId, name: "Latte A", emoji: "☕", category: "COFFEE", priceRupiah: 20000, description: "x", hasVariants: false, available: true })
    .returning();
  itemAId = itemA.id;

  const [itemB] = await testDb
    .insert(cafeMenuItems)
    .values({ orgId: orgBId, name: "Latte B", emoji: "☕", category: "COFFEE", priceRupiah: 20000, description: "x", hasVariants: false, available: true })
    .returning();
  itemBId = itemB.id;

  // Org A — the locked map, all three tiers (the money-path fixture).
  await testDb.insert(membershipTierConfig).values(
    MEMBERSHIP_TIERS.map((tier) => ({ orgId: orgAId, tier, ...LOCKED_TIER_DISCOUNTS[tier] })),
  );

  // Org B — PREMIUM only, with values distinct from A and from the locked map
  // (isolation proof); REGULAR is deliberately left unconfigured (the
  // fail-safe 0% money-path fixture below).
  await testDb.insert(membershipTierConfig).values({
    orgId: orgBId,
    tier: "PREMIUM",
    coworkingDiscountPct: 20,
    meetingDiscountPct: 20,
    cafeDiscountPct: 20,
    printDiscountPct: 20,
  });

  // Org C — no config rows at all (the fail-closed / no-leak fixture below).

  // I-044 [MONEY] TOCTOU fix: createOrder now re-derives cafe-discount
  // eligibility from a LIVE ACTIVE booking (not just the caller's
  // `discountEligible` flag) — every member fixture used with
  // `discountEligible: true` below needs a real ACTIVE booking so these
  // tests keep proving the TIER-CONFIG money path, not accidentally the
  // booking-eligibility path (which is covered by lib/db/cafe.int.test.ts).
  for (const userId of [regularAId, premiumAId, goldAId]) {
    await testDb.insert(bookings).values({
      orgId: orgAId,
      userId,
      facilityType: "WALKIN_COWORKING",
      facilityName: "Walk-in Coworking",
      ratePerHourRupiah: 10000,
      status: "ACTIVE",
    });
  }
  await testDb.insert(bookings).values({
    orgId: orgBId,
    userId: regularBId,
    facilityType: "WALKIN_COWORKING",
    facilityName: "Walk-in Coworking",
    ratePerHourRupiah: 10000,
    status: "ACTIVE",
  });

  // Print-parity preconditions (I-043) — submitPrintJob requires an active
  // default printer + a resolved BW/A4 matrix cell; org A and org B both
  // submit print jobs below.
  for (const orgId of [orgAId, orgBId]) {
    await testDb.insert(printers).values({
      orgId,
      name: "tier-model-printer",
      displayName: "Tier Model Printer",
      colorSupport: true,
      paperSizes: ["A4", "A3", "F4"],
      isDefault: true,
    });
    await testDb.insert(orgPrintPricing).values({
      orgId,
      colorMode: "BW",
      paperSize: "A4",
      pricePerPageRupiah: 500,
      isActive: true,
    });
  }
}, 30_000);

afterAll(async () => {
  await testSql.unsafe(TRUNCATE);
  await testSql.end();
}, 30_000);

/** Restore org A's PREMIUM/GOLD rows to the locked map (some tests mutate them). */
async function restoreOrgALocked(): Promise<void> {
  await updateTierDiscounts(orgAId, "PREMIUM", LOCKED_TIER_DISCOUNTS.PREMIUM);
  await updateTierDiscounts(orgAId, "GOLD", LOCKED_TIER_DISCOUNTS.GOLD);
}

// Runs after every test (idempotent no-op for tests that never mutated org A)
// so a mutating test can never leak state into a later test regardless of order.
afterEach(async () => {
  await restoreOrgALocked();
});

describe("Schema, migration, and seed", () => {
  it("AC-500: all four pct columns are integer NOT NULL DEFAULT 0; enum is exactly REGULAR/PREMIUM/GOLD", async () => {
    const cols = await testSql`
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_name = 'membership_tier_config'
        and column_name in ('coworking_discount_pct','meeting_discount_pct','cafe_discount_pct','print_discount_pct')
      order by column_name`;
    expect(cols).toHaveLength(4);
    for (const c of cols) {
      expect(c.data_type).toBe("integer");
      expect(c.is_nullable).toBe("NO");
      expect(c.column_default).toBe("0");
    }
    const enumRows = await testSql`
      select e.enumlabel
      from pg_type t
      join pg_enum e on t.oid = e.enumtypid
      where t.typname = 'MembershipTier'
      order by e.enumsortorder`;
    expect(enumRows.map((r) => r.enumlabel)).toEqual(["REGULAR", "PREMIUM", "GOLD"]);
  });

  it("AC-501: a direct write outside 0–100 for any dimension is rejected by the CHECK; the row is unchanged", async () => {
    await expect(
      testSql`UPDATE membership_tier_config SET coworking_discount_pct = 150 WHERE org_id = ${orgAId} AND tier = 'REGULAR'`,
    ).rejects.toThrow();
    expect(await getTierDiscounts(orgAId, "REGULAR")).toEqual(LOCKED_TIER_DISCOUNTS.REGULAR);
  });

  it("AC-502: every org's REGULAR/PREMIUM/GOLD row is exactly the locked map — no stale 5/20 guesses", async () => {
    for (const tier of MEMBERSHIP_TIERS) {
      expect(await getTierDiscounts(orgAId, tier)).toEqual(LOCKED_TIER_DISCOUNTS[tier]);
    }
  });

  it("AC-503: re-running the seed-upsert twice leaves one row per (org,tier), still the locked values", async () => {
    for (let i = 0; i < 2; i++) {
      for (const tier of MEMBERSHIP_TIERS) {
        await updateTierDiscounts(orgAId, tier, LOCKED_TIER_DISCOUNTS[tier]);
      }
    }
    const rows = await testDb
      .select()
      .from(membershipTierConfig)
      .where(eq(membershipTierConfig.orgId, orgAId));
    expect(rows).toHaveLength(MEMBERSHIP_TIERS.length);
    for (const tier of MEMBERSHIP_TIERS) {
      expect(await getTierDiscounts(orgAId, tier)).toEqual(LOCKED_TIER_DISCOUNTS[tier]);
    }
  });

  it("AC-504: the org-isolation RLS policy and both indexes survive the migration", async () => {
    const policies = await testSql`
      select policyname from pg_policies where tablename = 'membership_tier_config'`;
    expect(policies.map((p) => p.policyname)).toContain("membership_tier_config_org_isolation");
    const indexes = await testSql`
      select indexname from pg_indexes where tablename = 'membership_tier_config'`;
    const names = indexes.map((i) => i.indexname);
    expect(names).toContain("membership_tier_config_org_id_tier_idx");
    expect(names).toContain("membership_tier_config_org_id_idx");
  });
});

describe("I-040 booking-pricing seam", () => {
  it("AC-518: getTierDiscounts exposes coworkingDiscountPct/meetingDiscountPct — PREMIUM 10/10, GOLD 15/15", async () => {
    const premium = await getTierDiscounts(orgAId, "PREMIUM");
    expect(premium.coworkingDiscountPct).toBe(10);
    expect(premium.meetingDiscountPct).toBe(10);
    const gold = await getTierDiscounts(orgAId, "GOLD");
    expect(gold.coworkingDiscountPct).toBe(15);
    expect(gold.meetingDiscountPct).toBe(15);
  });
});

describe("Repository and authorization", () => {
  it("AC-505: listTierConfig(A) returns only A's rows, each with four dimensions", async () => {
    const rows = await listTierConfig(orgAId);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.orgId === orgAId)).toBe(true);
    for (const r of rows) {
      expect(typeof r.coworkingDiscountPct).toBe("number");
      expect(typeof r.meetingDiscountPct).toBe("number");
      expect(typeof r.cafeDiscountPct).toBe("number");
      expect(typeof r.printDiscountPct).toBe("number");
    }
    // Org B's distinct PREMIUM values (20/20/20/20) never appear for org A.
    expect(rows.some((r) => r.cafeDiscountPct === 20)).toBe(false);
  });

  it("AC-506: a tier with no config row fails closed to four zeroes and never reads another org's row", async () => {
    const d = await getTierDiscounts(orgCId, "GOLD");
    expect(d).toEqual({ coworkingDiscountPct: 0, meetingDiscountPct: 0, cafeDiscountPct: 0, printDiscountPct: 0 });
  });

  it("AC-507: updateTierDiscounts(A, PREMIUM, values) upserts all four; org B's PREMIUM is unaffected", async () => {
    await updateTierDiscounts(orgAId, "PREMIUM", {
      coworkingDiscountPct: 11, meetingDiscountPct: 12, cafeDiscountPct: 13, printDiscountPct: 14,
    });
    expect(await getTierDiscounts(orgAId, "PREMIUM")).toEqual({
      coworkingDiscountPct: 11, meetingDiscountPct: 12, cafeDiscountPct: 13, printDiscountPct: 14,
    });
    expect(await getTierDiscounts(orgBId, "PREMIUM")).toEqual({
      coworkingDiscountPct: 20, meetingDiscountPct: 20, cafeDiscountPct: 20, printDiscountPct: 20,
    });
  });

  it("AC-509: within one transaction, a valid write followed by an invalid write rolls back BOTH (no partial persistence)", async () => {
    const before = await getTierDiscounts(orgAId, "REGULAR");
    await expect(
      testDb.transaction(async (tx) => {
        await updateTierDiscounts(orgAId, "REGULAR", { coworkingDiscountPct: 1, meetingDiscountPct: 1, cafeDiscountPct: 1, printDiscountPct: 1 }, tx);
        await updateTierDiscounts(orgAId, "PREMIUM", { coworkingDiscountPct: 1, meetingDiscountPct: 1, cafeDiscountPct: 101, printDiscountPct: 1 }, tx);
      }),
    ).rejects.toThrow("INVALID_PCT:cafe");
    // REGULAR's valid write was never committed (rolled back with the tx).
    expect(await getTierDiscounts(orgAId, "REGULAR")).toEqual(before);
    // PREMIUM is unchanged too (the whole tx rolled back).
    expect(await getTierDiscounts(orgAId, "PREMIUM")).toEqual(LOCKED_TIER_DISCOUNTS.PREMIUM);
  });

  it("AC-511 / AC-528: two orgs sharing tier names are isolated on both read and write", async () => {
    await updateTierDiscounts(orgAId, "PREMIUM", {
      coworkingDiscountPct: 33, meetingDiscountPct: 33, cafeDiscountPct: 33, printDiscountPct: 33,
    });
    // B's PREMIUM (same tier name) is untouched by A's write.
    expect(await getTierDiscounts(orgBId, "PREMIUM")).toEqual({
      coworkingDiscountPct: 20, meetingDiscountPct: 20, cafeDiscountPct: 20, printDiscountPct: 20,
    });
    // All of A's rows remain scoped to A.
    const rowsA = await listTierConfig(orgAId);
    expect(rowsA.every((r) => r.orgId === orgAId)).toBe(true);
  });
});

describe("[MONEY-PATH] Money-path proofs", () => {
  it("AC-512: equal cafe subtotals for REGULAR/PREMIUM/GOLD resolve 0%/5%/10%, PREMIUM/GOLD totals reduced", async () => {
    const regular = await createOrder({ orgId: orgAId, customerUserId: regularAId, guestName: null, lines: [{ menuItemId: itemAId, qty: 1 }], discountEligible: true });
    const premium = await createOrder({ orgId: orgAId, customerUserId: premiumAId, guestName: null, lines: [{ menuItemId: itemAId, qty: 1 }], discountEligible: true });
    const gold = await createOrder({ orgId: orgAId, customerUserId: goldAId, guestName: null, lines: [{ menuItemId: itemAId, qty: 1 }], discountEligible: true });
    expect(regular.discountRupiah).toBe(0);
    expect(regular.totalRupiah).toBe(20000);
    expect(premium.discountRupiah).toBe(1000); // 5% of 20000
    expect(premium.totalRupiah).toBe(19000);
    expect(gold.discountRupiah).toBe(2000); // 10% of 20000
    expect(gold.totalRupiah).toBe(18000);
  });

  it("AC-513: a member without an ACTIVE session (discountEligible=false) gets 0% regardless of tier config", async () => {
    const gold = await createOrder({ orgId: orgAId, customerUserId: goldAId, guestName: null, lines: [{ menuItemId: itemAId, qty: 1 }], discountEligible: false });
    expect(gold.discountRupiah).toBe(0);
    expect(gold.totalRupiah).toBe(20000);
  });

  it("AC-515: equal BW print jobs for REGULAR/PREMIUM/GOLD resolve print discounts 0%/5%/10%", async () => {
    const regular = await submitPrintJob({ orgId: orgAId, userId: regularAId, fileName: "r.pdf", pages: 10, copies: 1, colorMode: "BW" });
    const premium = await submitPrintJob({ orgId: orgAId, userId: premiumAId, fileName: "p.pdf", pages: 10, copies: 1, colorMode: "BW" });
    const gold = await submitPrintJob({ orgId: orgAId, userId: goldAId, fileName: "g.pdf", pages: 10, copies: 1, colorMode: "BW" });
    // subtotal = 500 × 10 = 5000
    expect(regular.discountRupiah).toBe(0);
    expect(regular.totalRupiah).toBe(5000);
    expect(premium.discountRupiah).toBe(250); // 5%
    expect(premium.totalRupiah).toBe(4750);
    expect(gold.discountRupiah).toBe(500); // 10%
    expect(gold.totalRupiah).toBe(4500);
  });

  it("AC-517: changing tier config never alters a persisted order/print-job total; a new item uses the new %", async () => {
    const order = await createOrder({ orgId: orgAId, customerUserId: premiumAId, guestName: null, lines: [{ menuItemId: itemAId, qty: 1 }], discountEligible: true });
    const job = await submitPrintJob({ orgId: orgAId, userId: premiumAId, fileName: "before.pdf", pages: 10, copies: 1, colorMode: "BW" });
    expect(order.discountRupiah).toBe(1000); // 5% of 20000
    expect(job.discountRupiah).toBe(250); // 5% of 5000

    await updateTierDiscounts(orgAId, "PREMIUM", {
      ...LOCKED_TIER_DISCOUNTS.PREMIUM,
      cafeDiscountPct: 50,
      printDiscountPct: 50,
    });

    // The persisted rows are untouched (NFR-501).
    const [storedOrder] = await testDb.select().from(cafeOrders).where(eq(cafeOrders.id, order.id));
    const [storedJob] = await testDb.select().from(printJobs).where(eq(printJobs.id, job.id));
    expect(storedOrder.discountRupiah).toBe(1000);
    expect(storedOrder.totalRupiah).toBe(19000);
    expect(storedJob.discountRupiah).toBe(250);
    expect(storedJob.totalRupiah).toBe(4750);

    // A newly priced item uses the new percentage.
    const newOrder = await createOrder({ orgId: orgAId, customerUserId: premiumAId, guestName: null, lines: [{ menuItemId: itemAId, qty: 1 }], discountEligible: true });
    const newJob = await submitPrintJob({ orgId: orgAId, userId: premiumAId, fileName: "after.pdf", pages: 10, copies: 1, colorMode: "BW" });
    expect(newOrder.discountRupiah).toBe(10000); // 50% of 20000
    expect(newJob.discountRupiah).toBe(2500); // 50% of 5000
  });

  it("AC-519: an otherwise-valid member with no config row for their tier gets 0% on cafe and print", async () => {
    const order = await createOrder({ orgId: orgBId, customerUserId: regularBId, guestName: null, lines: [{ menuItemId: itemBId, qty: 1 }], discountEligible: true });
    expect(order.discountRupiah).toBe(0);
    expect(order.totalRupiah).toBe(20000);

    const job = await submitPrintJob({ orgId: orgBId, userId: regularBId, fileName: "b.pdf", pages: 10, copies: 1, colorMode: "BW" });
    expect(job.discountRupiah).toBe(0);
    expect(job.totalRupiah).toBe(5000);
  });
});
