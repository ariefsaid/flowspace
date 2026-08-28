/**
 * Integration tests for the print-pricing config repo + its money-path read (I-027).
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 *
 * AC-400, AC-402, AC-403 are superseded by the widened four-dimensional tier
 * model (I-041, spec 0008) — see lib/db/tier-model.int.test.ts for their
 * replacements (per the spec's "Supersedes from spec 0006" table).
 *
 * AC-401: submitPrintJob applies the configured per-tier print discount (now
 *   resolved from the widened four-dim model — PREMIUM print is 5%, not the
 *   stale spec-0006 20% guess).
 * AC-407: getPrintPricing reads config (fallback when absent); updatePrintPricing validates.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { appUsers, organizations, membershipTierConfig } from "@/lib/db/schema";
import { getPrintPricing, updatePrintPricing } from "@/lib/db/print-pricing";
import { submitPrintJob } from "@/lib/db/print";
import { PRINT_RATE_COLOR } from "@/lib/print/pricing";
import { LOCKED_TIER_DISCOUNTS } from "@/lib/tier-discounts";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

let orgAId: string;
let premiumUserId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","print_jobs","cafe_order_items","cafe_orders","cafe_menu_items","membership_tier_config","org_print_pricing","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Cfg Org A", slug: "cfg-org-a-test" })
    .returning();
  orgAId = orgA.id;

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

  // Widened four-dim locked config (I-041) — PREMIUM print is 5%, not the
  // stale spec-0006 20% guess.
  await testDb.insert(membershipTierConfig).values({
    orgId: orgAId,
    tier: "PREMIUM",
    ...LOCKED_TIER_DISCOUNTS.PREMIUM,
  });
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","print_jobs","cafe_order_items","cafe_orders","cafe_menu_items","membership_tier_config","org_print_pricing","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

describe("print pricing config repo", () => {
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
    // org A COLOR rate is now 2000 (set above); PREMIUM printDiscountPct = 5 (widened model).
    const job = await submitPrintJob({
      orgId: orgAId,
      userId: premiumUserId,
      fileName: "doc.pdf",
      pages: 10,
      copies: 1,
      colorMode: "COLOR",
    });
    // subtotal = 2000 × 10 = 20000; 5% off → discount 1000, total 19000.
    expect(job.pricePerPageRupiah).toBe(2000);
    expect(job.discountRupiah).toBe(1000);
    expect(job.totalRupiah).toBe(19000);
  });
});
