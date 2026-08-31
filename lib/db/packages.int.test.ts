/**
 * Integration tests for lib/db/packages.ts
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 *
 * I-020/I-040 — Time-credit packages + top-up:
 *   listPackages: org-scoped, excludes archived + cross-org, sorted by sortOrder
 *   purchasePackage (AC-826): creates a time_credit_lots row expiring exactly
 *     90 days from purchase, writes a COMPLETED PACKAGE_PURCHASE txn (amount =
 *     pkg.priceRupiah, packageId set), and recomputes the derived
 *     app_users.timeCredits cache (= SUM of non-expired remainingHours);
 *     cross-org packageId throws UNKNOWN_PACKAGE with no lot/balance change
 *     and no txn.
 *   topUpPrint: increments printBalance by pages (still an aggregate — no
 *     lot concept for print), writes a COMPLETED PRINT_TOPUP txn (amount =
 *     pages × 500); invalid pages throws, no write.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  appUsers,
  organizations,
  timeCreditLots,
  timeCreditPackages,
  transactions,
} from "@/lib/db/schema";
import {
  listPackages,
  purchasePackage,
  topUpPrint,
  PRINT_RATE_PER_PAGE_RUPIAH,
} from "@/lib/db/packages";
import { declinePayment } from "@/lib/topup/mockPaymentGateway";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

/** Dedicated Drizzle + postgres-js client for the test DB — never the app singleton. */
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

// --- test data ---
let orgAId: string;
let orgBId: string;
let aUserId: string;
let pkg5hAId: string;
let pkg10hAId: string;
let pkgArchivedAId: string;
let pkgOrgBId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "time_credit_lots","transactions","time_credit_packages","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Pkg Org A", slug: "pkg-org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Pkg Org B", slug: "pkg-org-b-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  // I-040: timeCredits is now a derived cache of non-expired lot
  // remainingHours (no lots exist yet), so it starts at 0 — not a stale
  // aggregate the purchase would "increment".
  const [userA] = await testDb
    .insert(appUsers)
    .values({
      orgId: orgAId,
      email: "pkg-a@x.test",
      name: "Alice",
      role: "MEMBER",
      timeCredits: 0,
      printBalance: 5,
    })
    .returning();
  aUserId = userA.id;

  const [pkg5] = await testDb
    .insert(timeCreditPackages)
    .values({
      orgId: orgAId,
      name: "5 Hours",
      hours: 5,
      priceRupiah: 75000,
      pricePerHourRupiah: 15000,
      popular: false,
      sortOrder: 1,
    })
    .returning();
  pkg5hAId = pkg5.id;

  const [pkg10] = await testDb
    .insert(timeCreditPackages)
    .values({
      orgId: orgAId,
      name: "10 Hours",
      hours: 10,
      priceRupiah: 140000,
      pricePerHourRupiah: 14000,
      popular: true,
      sortOrder: 2,
    })
    .returning();
  pkg10hAId = pkg10.id;

  // Archived — must NOT appear in listPackages / be purchasable
  const [archived] = await testDb
    .insert(timeCreditPackages)
    .values({
      orgId: orgAId,
      name: "Old Hours",
      hours: 99,
      priceRupiah: 999999,
      pricePerHourRupiah: 9999,
      popular: false,
      sortOrder: 0,
      archivedAt: new Date(),
    })
    .returning();
  pkgArchivedAId = archived.id;

  // Org B's package — cross-org guard
  const [pkgB] = await testDb
    .insert(timeCreditPackages)
    .values({
      orgId: orgBId,
      name: "B Only",
      hours: 7,
      priceRupiah: 70000,
      pricePerHourRupiah: 10000,
      popular: false,
      sortOrder: 1,
    })
    .returning();
  pkgOrgBId = pkgB.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "time_credit_lots","transactions","time_credit_packages","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

describe("lib/db/packages", () => {
  // -------------------------------------------------------------------------
  // P1 — listPackages
  // -------------------------------------------------------------------------
  describe("listPackages", () => {
    it("returns only orgA's available packages, sorted by sortOrder, excluding archived + cross-org", async () => {
      const items = await listPackages(orgAId);
      expect(items.every((p) => p.orgId === orgAId)).toBe(true);
      const ids = items.map((p) => p.id);
      expect(ids).not.toContain(pkgArchivedAId);
      expect(ids).not.toContain(pkgOrgBId);
      expect(ids).toContain(pkg5hAId);
      expect(ids).toContain(pkg10hAId);
      // sortOrder ascending: 5h (1) before 10h (2)
      expect(ids).toEqual([pkg5hAId, pkg10hAId]);
    });

    it("org isolation — orgB call does not return orgA packages", async () => {
      const items = await listPackages(orgBId);
      expect(items.every((p) => p.orgId === orgBId)).toBe(true);
      const ids = items.map((p) => p.id);
      expect(ids).not.toContain(pkg5hAId);
      expect(ids).toContain(pkgOrgBId);
    });
  });

  // -------------------------------------------------------------------------
  // P2 — purchasePackage
  // -------------------------------------------------------------------------
  describe("purchasePackage — money path [SEC]", () => {
    it("AC-826: creates a lot expiring exactly 90 days from purchase, recomputes the derived balance by pkg.hours, writes a COMPLETED PACKAGE_PURCHASE txn", async () => {
      const before = await testDb
        .select({ timeCredits: appUsers.timeCredits })
        .from(appUsers)
        .where(eq(appUsers.id, aUserId))
        .limit(1);
      expect(before[0]?.timeCredits).toBe(0);

      const beforePurchase = Date.now();
      const result = await purchasePackage({
        orgId: orgAId,
        userId: aUserId,
        packageId: pkg5hAId,
      });
      expect(result.timeCredits).toBe(5);

      const after = await testDb
        .select({ timeCredits: appUsers.timeCredits })
        .from(appUsers)
        .where(eq(appUsers.id, aUserId))
        .limit(1);
      expect(after[0]?.timeCredits).toBe(5);

      const [lot] = await testDb
        .select()
        .from(timeCreditLots)
        .where(and(eq(timeCreditLots.orgId, orgAId), eq(timeCreditLots.userId, aUserId)))
        .limit(1);
      expect(lot).toBeDefined();
      expect(lot.totalHours).toBe(5);
      expect(lot.remainingHours).toBe(5);
      expect(lot.packageId).toBe(pkg5hAId);
      const expectedExpiry = lot.purchasedAt.getTime() + 90 * 24 * 60 * 60 * 1000;
      expect(lot.expiresAt.getTime()).toBe(expectedExpiry);
      expect(lot.purchasedAt.getTime()).toBeGreaterThanOrEqual(beforePurchase);

      const [txn] = await testDb
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.orgId, orgAId),
            eq(transactions.userId, aUserId),
            eq(transactions.type, "PACKAGE_PURCHASE"),
          ),
        )
        .limit(1);
      expect(txn).toBeDefined();
      expect(txn.status).toBe("COMPLETED");
      // amount comes from the DB row price, never the client
      expect(txn.amountRupiah).toBe(75000);
      expect(txn.packageId).toBe(pkg5hAId);
      expect(txn.description).toBe("Purchased 5 Hours package");
      expect(lot.purchaseTransactionId).toBe(txn.id);
    });

    it("a cross-org packageId throws UNKNOWN_PACKAGE — no balance/lot change, no txn written", async () => {
      const [{ count: txnBefore }] = await testSql`
        select count(*)::int as count from transactions where org_id = ${orgAId} and user_id = ${aUserId}`;
      const [{ count: lotsBefore }] = await testSql`
        select count(*)::int as count from time_credit_lots where org_id = ${orgAId} and user_id = ${aUserId}`;
      const before = await testDb
        .select({ timeCredits: appUsers.timeCredits })
        .from(appUsers)
        .where(eq(appUsers.id, aUserId))
        .limit(1);

      await expect(
        purchasePackage({
          orgId: orgAId,
          userId: aUserId,
          packageId: pkgOrgBId, // belongs to org B
        }),
      ).rejects.toThrow(/UNKNOWN_PACKAGE/);

      const after = await testDb
        .select({ timeCredits: appUsers.timeCredits })
        .from(appUsers)
        .where(eq(appUsers.id, aUserId))
        .limit(1);
      expect(after[0]?.timeCredits).toBe(before[0]?.timeCredits);

      const [{ count: txnAfter }] = await testSql`
        select count(*)::int as count from transactions where org_id = ${orgAId} and user_id = ${aUserId}`;
      expect(txnAfter).toBe(txnBefore);

      const [{ count: lotsAfter }] = await testSql`
        select count(*)::int as count from time_credit_lots where org_id = ${orgAId} and user_id = ${aUserId}`;
      expect(lotsAfter).toBe(lotsBefore);
    });

    it("an archived package id throws UNKNOWN_PACKAGE — no write", async () => {
      await expect(
        purchasePackage({
          orgId: orgAId,
          userId: aUserId,
          packageId: pkgArchivedAId,
        }),
      ).rejects.toThrow(/UNKNOWN_PACKAGE/);
    });

    it("a forced simulated decline throws PAYMENT_DECLINED — no balance change, no lot, no ledger row", async () => {
      const before = await testDb
        .select({ timeCredits: appUsers.timeCredits })
        .from(appUsers)
        .where(eq(appUsers.id, aUserId))
        .limit(1);
      const [{ count: txnBefore }] = await testSql`
        select count(*)::int as count from transactions where org_id = ${orgAId} and user_id = ${aUserId}`;
      const [{ count: lotsBefore }] = await testSql`
        select count(*)::int as count from time_credit_lots where org_id = ${orgAId} and user_id = ${aUserId}`;

      await expect(
        purchasePackage({
          orgId: orgAId,
          userId: aUserId,
          packageId: pkg5hAId,
          simulatePayment: declinePayment,
        }),
      ).rejects.toThrow(/PAYMENT_DECLINED/);

      const after = await testDb
        .select({ timeCredits: appUsers.timeCredits })
        .from(appUsers)
        .where(eq(appUsers.id, aUserId))
        .limit(1);
      expect(after[0]?.timeCredits).toBe(before[0]?.timeCredits);

      const [{ count: txnAfter }] = await testSql`
        select count(*)::int as count from transactions where org_id = ${orgAId} and user_id = ${aUserId}`;
      expect(txnAfter).toBe(txnBefore);

      const [{ count: lotsAfter }] = await testSql`
        select count(*)::int as count from time_credit_lots where org_id = ${orgAId} and user_id = ${aUserId}`;
      expect(lotsAfter).toBe(lotsBefore);
    });
  });

  // -------------------------------------------------------------------------
  // P3 — topUpPrint
  // -------------------------------------------------------------------------
  describe("topUpPrint — money path [SEC]", () => {
    it("increments printBalance by pages, writes a COMPLETED PRINT_TOPUP txn with amount = pages × rate", async () => {
      // printBalance was 5 at seed; prior purchase tests only touched timeCredits
      const result = await topUpPrint({
        orgId: orgAId,
        userId: aUserId,
        pages: 100,
      });
      // server rate is fixed at PRINT_RATE_PER_PAGE_RUPIAH
      expect(result.printBalance).toBe(105);

      const after = await testDb
        .select({ printBalance: appUsers.printBalance })
        .from(appUsers)
        .where(eq(appUsers.id, aUserId))
        .limit(1);
      expect(after[0]?.printBalance).toBe(105);

      const [txn] = await testDb
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.orgId, orgAId),
            eq(transactions.userId, aUserId),
            eq(transactions.type, "PRINT_TOPUP"),
          ),
        )
        .limit(1);
      expect(txn).toBeDefined();
      expect(txn.status).toBe("COMPLETED");
      expect(txn.amountRupiah).toBe(100 * PRINT_RATE_PER_PAGE_RUPIAH);
      expect(txn.description).toBe("Top up 100 print pages");
    });

    it("[SEC][MONEY][I-047 fix-3] clamps the printBalance RESULT at the int4 ceiling — a valid top-up on a near-max balance must not overflow the SQL increment", async () => {
      const [target] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: `topup-int4-${Date.now()}@x.test`, name: "TopupInt4", role: "MEMBER", printBalance: 2_147_480_000 })
        .returning();

      // 2_147_480_000 + 10_000 pages > INT4_MAX: a raw `print_balance + pages`
      // addition overflows in Postgres. The RESULT must clamp instead.
      const { printBalance } = await topUpPrint({ orgId: orgAId, userId: target.id, pages: 10_000 });
      expect(printBalance).toBe(2_147_483_647);

      const [fresh] = await testDb
        .select({ printBalance: appUsers.printBalance })
        .from(appUsers)
        .where(eq(appUsers.id, target.id))
        .limit(1);
      expect(fresh?.printBalance).toBe(2_147_483_647);
    });

    it("rejects non-positive / fractional / oversized pages — no write", async () => {
      const [{ count: txnBefore }] = await testSql`
        select count(*)::int as count from transactions where org_id = ${orgAId} and user_id = ${aUserId} and type = 'PRINT_TOPUP'`;
      const before = await testDb
        .select({ printBalance: appUsers.printBalance })
        .from(appUsers)
        .where(eq(appUsers.id, aUserId))
        .limit(1);

      for (const badPages of [-5, 0, 1.5, 100_000]) {
        await expect(
          topUpPrint({ orgId: orgAId, userId: aUserId, pages: badPages }),
        ).rejects.toThrow(/INVALID_PAGES/);
      }

      const after = await testDb
        .select({ printBalance: appUsers.printBalance })
        .from(appUsers)
        .where(eq(appUsers.id, aUserId))
        .limit(1);
      expect(after[0]?.printBalance).toBe(before[0]?.printBalance);

      const [{ count: txnAfter }] = await testSql`
        select count(*)::int as count from transactions where org_id = ${orgAId} and user_id = ${aUserId} and type = 'PRINT_TOPUP'`;
      expect(txnAfter).toBe(txnBefore);
    });
  });
});
