/**
 * Integration tests for the print-pricing config repo (matrix + legacy A4
 * bridge) + its money-path read. Runs against the Supabase local Postgres
 * via TEST_DATABASE_URL.
 *
 * AC-400, AC-402, AC-403 are superseded by the widened four-dimensional tier
 * model (I-041, spec 0008) — see lib/db/tier-model.int.test.ts for their
 * replacements (per the spec's "Supersedes from spec 0006" table).
 *
 * AC-401: submitPrintJob applies the configured per-tier print discount (now
 *   resolved from the widened four-dim model — PREMIUM print is 5%, not the
 *   stale spec-0006 20% guess) against the resolved matrix rate.
 * AC-623: upsertPrintPricingCell writes one org's cell; another org's cell is
 *   unchanged. The legacy A4 bridge (updatePrintPricing/getPrintPricing) maps
 *   the flat editor onto the two A4 matrix cells (I-043, spec 0009).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import {
  appUsers,
  organizations,
  membershipTierConfig,
  orgPrintPricing,
  printers,
} from "@/lib/db/schema";
import {
  listPrintPricing,
  getActivePrintPrice,
  upsertPrintPricingCell,
  getPrintPricing,
  updatePrintPricing,
} from "@/lib/db/print-pricing";
import { submitPrintJob } from "@/lib/db/print";
import { LOCKED_TIER_DISCOUNTS } from "@/lib/tier-discounts";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

let orgAId: string;
let orgBId: string;
let premiumUserId: string;

/** The six signed matrix cells (OBS-605) — seeded per org as test fixtures. */
const SIX_CELLS: Array<{
  colorMode: "BW" | "COLOR";
  paperSize: "A4" | "A3" | "F4";
  pricePerPageRupiah: number;
}> = [
  { colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500 },
  { colorMode: "BW", paperSize: "A3", pricePerPageRupiah: 1000 },
  { colorMode: "BW", paperSize: "F4", pricePerPageRupiah: 600 },
  { colorMode: "COLOR", paperSize: "A4", pricePerPageRupiah: 2000 },
  { colorMode: "COLOR", paperSize: "A3", pricePerPageRupiah: 4000 },
  { colorMode: "COLOR", paperSize: "F4", pricePerPageRupiah: 2500 },
];

async function seedMatrix(orgId: string) {
  for (const cell of SIX_CELLS) {
    await testDb.insert(orgPrintPricing).values({
      id: `${orgId}__${cell.colorMode}-${cell.paperSize}`,
      orgId,
      colorMode: cell.colorMode,
      paperSize: cell.paperSize,
      pricePerPageRupiah: cell.pricePerPageRupiah,
      isActive: true,
    });
  }
}

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

  // Widened four-dim locked config (I-041) — PREMIUM print is 5%, not the
  // stale spec-0006 20% guess.
  await testDb.insert(membershipTierConfig).values({
    orgId: orgAId,
    tier: "PREMIUM",
    ...LOCKED_TIER_DISCOUNTS.PREMIUM,
  });

  // Seed the six-cell pricing matrix for both orgs (I-043 shape).
  await seedMatrix(orgAId);
  await seedMatrix(orgBId);
  await testDb.insert(printers).values({
    orgId: orgAId,
    name: "cfg-printer",
    displayName: "Config Printer",
    colorSupport: true,
    paperSizes: ["A4", "A3", "F4"],
    isDefault: true,
  });
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","print_jobs","cafe_order_items","cafe_orders","cafe_menu_items","membership_tier_config","org_print_pricing","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

describe("print pricing config repo", () => {
  it("listPrintPricing returns exactly the six signed cells for the org", async () => {
    const rows = await listPrintPricing(orgAId);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.orgId === orgAId)).toBe(true);
    const byCell = new Map(
      rows.map((r) => [`${r.colorMode}/${r.paperSize}`, r.pricePerPageRupiah]),
    );
    expect(byCell.get("BW/A4")).toBe(500);
    expect(byCell.get("BW/A3")).toBe(1000);
    expect(byCell.get("BW/F4")).toBe(600);
    expect(byCell.get("COLOR/A4")).toBe(2000);
    expect(byCell.get("COLOR/A3")).toBe(4000);
    expect(byCell.get("COLOR/F4")).toBe(2500);
  });

  it("getActivePrintPrice resolves each active cell; missing or inactive resolves to null", async () => {
    expect(await getActivePrintPrice(orgAId, "BW", "A4")).toBe(500);
    expect(await getActivePrintPrice(orgAId, "COLOR", "A3")).toBe(4000);
    // Deactivate one cell → null (the caller must reject; no fallback price).
    await testDb
      .update(orgPrintPricing)
      .set({ isActive: false })
      .where(eq(orgPrintPricing.id, `${orgAId}__BW-F4`));
    expect(await getActivePrintPrice(orgAId, "BW", "F4")).toBeNull();
    // org B's own cell is still active (org isolation).
    expect(await getActivePrintPrice(orgBId, "BW", "F4")).toBe(600);
    // restore for later tests
    await testDb
      .update(orgPrintPricing)
      .set({ isActive: true })
      .where(eq(orgPrintPricing.id, `${orgAId}__BW-F4`));
  });

  it("AC-623: upsertPrintPricingCell writes one org's cell; another org's cell is unchanged", async () => {
    // org A admin edits the BW/A3 cell.
    await upsertPrintPricingCell(orgAId, {
      colorMode: "BW",
      paperSize: "A3",
      pricePerPageRupiah: 1200,
    });
    expect(await getActivePrintPrice(orgAId, "BW", "A3")).toBe(1200);
    // org B's BW/A3 cell is untouched.
    expect(await getActivePrintPrice(orgBId, "BW", "A3")).toBe(1000);

    // Upserting again updates the same cell (matrix key, not a new row).
    await upsertPrintPricingCell(orgAId, {
      colorMode: "BW",
      paperSize: "A3",
      pricePerPageRupiah: 1000,
    });
    const rows = await listPrintPricing(orgAId);
    expect(rows.filter((r) => r.colorMode === "BW" && r.paperSize === "A3")).toHaveLength(1);
  });

  it("upsertPrintPricingCell rejects invalid paper size / non-positive / fractional / int4-overflow (no write)", async () => {
    const before = await listPrintPricing(orgAId);
    await expect(
      upsertPrintPricingCell(orgAId, {
        colorMode: "BW",
        paperSize: "A5",
        pricePerPageRupiah: 700,
      }),
    ).rejects.toThrow(/INVALID_PAPER_SIZE/);
    for (const bad of [0, -1, 12.5, 2147483648]) {
      await expect(
        upsertPrintPricingCell(orgAId, {
          colorMode: "COLOR",
          paperSize: "F4",
          pricePerPageRupiah: bad,
        }),
      ).rejects.toThrow(/INVALID_RATE/);
    }
    // No row was added or changed by the rejected writes.
    expect(await listPrintPricing(orgAId)).toHaveLength(before.length);
    expect(await getActivePrintPrice(orgAId, "COLOR", "F4")).toBe(2500);
  });

  it("legacy A4 bridge: updatePrintPricing writes the two A4 cells; reads reflect them", async () => {
    await updatePrintPricing(orgAId, {
      bwRatePerPageRupiah: 600,
      colorRatePerPageRupiah: 2200,
    });
    expect(await getPrintPricing(orgAId)).toEqual({
      bwRatePerPageRupiah: 600,
      colorRatePerPageRupiah: 2200,
    });
    for (const bad of [0, -1, 1.5]) {
      await expect(
        updatePrintPricing(orgAId, {
          bwRatePerPageRupiah: bad,
          colorRatePerPageRupiah: 2000,
        }),
      ).rejects.toThrow(/INVALID_RATE/);
    }
    // restore signed values for the money-path test below
    await updatePrintPricing(orgAId, {
      bwRatePerPageRupiah: 500,
      colorRatePerPageRupiah: 2000,
    });
  });

  it("AC-401: submitPrintJob applies the configured per-tier print discount + matrix rate", async () => {
    // org A COLOR/A4 rate is 2000 (restored above); PREMIUM printDiscountPct = 5 (widened model).
    const job = await submitPrintJob({
      orgId: orgAId,
      userId: premiumUserId,
      fileName: "doc.pdf",
      pages: 10,
      copies: 1,
      colorMode: "COLOR",
      paperSize: "A4",
    });
    // subtotal = 2000 × 10 = 20000; 5% off → discount 1000, total 19000.
    expect(job.pricePerPageRupiah).toBe(2000);
    expect(job.discountRupiah).toBe(1000);
    expect(job.totalRupiah).toBe(19000);
  });
});
