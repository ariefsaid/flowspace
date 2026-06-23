/**
 * Integration tests for the pricing config repos + their money-path reads (I-027).
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 *
 * AC-400: listTierConfig is org-scoped.
 * AC-401: submitPrintJob applies the configured per-tier print discount.
 * AC-402: createOrder applies the configured per-tier cafe discount (eligible).
 * AC-403: updateTierDiscounts validates 0–100 and upserts (no write on invalid).
 * AC-407: getPrintPricing reads config (fallback when absent); updatePrintPricing validates.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import {
  appUsers,
  organizations,
  cafeMenuItems,
  membershipTierConfig,
} from "@/lib/db/schema";
import {
  listTierConfig,
  getTierDiscounts,
  updateTierDiscounts,
} from "@/lib/db/tier-config";
import { getPrintPricing, updatePrintPricing } from "@/lib/db/print-pricing";
import { submitPrintJob } from "@/lib/db/print";
import { createOrder } from "@/lib/db/cafe";
import { PRINT_RATE_COLOR } from "@/lib/print/pricing";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

let orgAId: string;
let orgBId: string;
let premiumUserId: string;
let latteId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","print_jobs","cafe_order_items","cafe_orders","cafe_menu_items","membership_tier_config","org_print_pricing","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Cfg Org A", slug: "cfg-org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Cfg Org B", slug: "cfg-org-b-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [user] = await testDb
    .insert(appUsers)
    .values({
      orgId: orgAId,
      email: "cfg-premium@x.test",
      name: "Premi",
      role: "MEMBER",
      membershipTier: "PREMIUM",
      printBalance: 1000,
    })
    .returning();
  premiumUserId = user.id;

  const [latte] = await testDb
    .insert(cafeMenuItems)
    .values({
      orgId: orgAId,
      name: "Latte",
      emoji: "☕",
      category: "COFFEE",
      priceRupiah: 20000,
      description: "x",
      hasVariants: false,
      available: true,
    })
    .returning();
  latteId = latte.id;

  // Seed config for both orgs (A = the system under test).
  await testDb.insert(membershipTierConfig).values([
    { orgId: orgAId, tier: "REGULAR", cafeDiscountPct: 5, printDiscountPct: 0 },
    { orgId: orgAId, tier: "PREMIUM", cafeDiscountPct: 5, printDiscountPct: 20 },
    { orgId: orgAId, tier: "GOLD", cafeDiscountPct: 5, printDiscountPct: 20 },
    { orgId: orgBId, tier: "PREMIUM", cafeDiscountPct: 9, printDiscountPct: 9 },
  ]);
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","print_jobs","cafe_order_items","cafe_orders","cafe_menu_items","membership_tier_config","org_print_pricing","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

describe("pricing config repos", () => {
  it("AC-400: listTierConfig returns only the caller org's rows", async () => {
    const a = await listTierConfig(orgAId);
    expect(a).toHaveLength(3);
    expect(a.every((r) => r.orgId === orgAId)).toBe(true);
    // org B's PREMIUM row (9/9) never appears for org A.
    expect(a.some((r) => r.cafeDiscountPct === 9)).toBe(false);
  });

  it("AC-403: updateTierDiscounts upserts valid rates", async () => {
    await updateTierDiscounts(orgAId, "PREMIUM", {
      cafeDiscountPct: 12,
      printDiscountPct: 25,
    });
    const d = await getTierDiscounts(orgAId, "PREMIUM");
    expect(d).toEqual({ cafeDiscountPct: 12, printDiscountPct: 25 });
    // restore for the money-path tests below
    await updateTierDiscounts(orgAId, "PREMIUM", {
      cafeDiscountPct: 5,
      printDiscountPct: 20,
    });
  });

  it("AC-403: updateTierDiscounts rejects out-of-range / fractional (no write)", async () => {
    for (const bad of [150, -1, 12.5]) {
      await expect(
        updateTierDiscounts(orgAId, "GOLD", {
          cafeDiscountPct: bad,
          printDiscountPct: 0,
        }),
      ).rejects.toThrow(/INVALID_PCT/);
    }
    // GOLD unchanged (still seeded 5/20)
    expect(await getTierDiscounts(orgAId, "GOLD")).toEqual({
      cafeDiscountPct: 5,
      printDiscountPct: 20,
    });
  });

  it("AC-403: getTierDiscounts falls back to 0/0 when no row (fail-safe)", async () => {
    expect(await getTierDiscounts(orgBId, "REGULAR")).toEqual({
      cafeDiscountPct: 0,
      printDiscountPct: 0,
    });
  });

  it("AC-407: getPrintPricing falls back to constants when unconfigured", async () => {
    const p = await getPrintPricing(orgAId);
    expect(p.colorRatePerPageRupiah).toBe(PRINT_RATE_COLOR); // 1500 default
  });

  it("AC-407: updatePrintPricing upserts; reads back; rejects non-positive/fractional", async () => {
    await updatePrintPricing(orgAId, {
      bwRatePerPageRupiah: 600,
      colorRatePerPageRupiah: 2000,
    });
    expect(await getPrintPricing(orgAId)).toEqual({
      bwRatePerPageRupiah: 600,
      colorRatePerPageRupiah: 2000,
    });
    for (const bad of [0, -1, 1.5]) {
      await expect(
        updatePrintPricing(orgAId, {
          bwRatePerPageRupiah: bad,
          colorRatePerPageRupiah: 2000,
        }),
      ).rejects.toThrow(/INVALID_RATE/);
    }
  });

  it("AC-401: submitPrintJob applies the configured per-tier print discount + base rate", async () => {
    // org A COLOR rate is now 2000 (set above); PREMIUM printDiscountPct = 20.
    const job = await submitPrintJob({
      orgId: orgAId,
      userId: premiumUserId,
      fileName: "doc.pdf",
      pages: 10,
      copies: 1,
      colorMode: "COLOR",
    });
    // subtotal = 2000 × 10 = 20000; 20% off → discount 4000, total 16000.
    expect(job.pricePerPageRupiah).toBe(2000);
    expect(job.discountRupiah).toBe(4000);
    expect(job.totalRupiah).toBe(16000);
  });

  it("AC-402: createOrder applies the configured per-tier cafe discount when eligible", async () => {
    // PREMIUM cafe rate is 5%. subtotal 20000 → 1000 off.
    const o1 = await createOrder({
      orgId: orgAId,
      customerUserId: premiumUserId,
      guestName: null,
      lines: [{ menuItemId: latteId, qty: 1 }],
      discountEligible: true,
    });
    expect(o1.discountRupiah).toBe(1000);
    expect(o1.totalRupiah).toBe(19000);

    // Change the config to 10% → a NEW order reflects it (no retro-change).
    await updateTierDiscounts(orgAId, "PREMIUM", {
      cafeDiscountPct: 10,
      printDiscountPct: 20,
    });
    const o2 = await createOrder({
      orgId: orgAId,
      customerUserId: premiumUserId,
      guestName: null,
      lines: [{ menuItemId: latteId, qty: 1 }],
      discountEligible: true,
    });
    expect(o2.discountRupiah).toBe(2000);
    expect(o2.totalRupiah).toBe(18000);

    // Ineligible → 0% regardless of config.
    const o3 = await createOrder({
      orgId: orgAId,
      customerUserId: premiumUserId,
      guestName: null,
      lines: [{ menuItemId: latteId, qty: 1 }],
      discountEligible: false,
    });
    expect(o3.discountRupiah).toBe(0);
  });
});
