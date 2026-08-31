// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { organizations, printTopupPackages, appUsers, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listPrintTopupPackages, purchasePrintTopup } from "./print-packages";
import { declinePayment } from "@/lib/topup/mockPaymentGateway";

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:34322/postgres", { prepare: false, max: 3 });
const db = drizzle(sql, { schema });
let orgA: string; let orgB: string; let userA: string;
beforeAll(async () => {
  await sql`TRUNCATE TABLE print_topup_packages, organizations RESTART IDENTITY CASCADE`;
  const [a] = await db.insert(organizations).values({ name: "Package A", slug: "package-a" }).returning();
  const [b] = await db.insert(organizations).values({ name: "Package B", slug: "package-b" }).returning();
  orgA = a.id; orgB = b.id;
  const [user] = await db.insert(appUsers).values({ orgId: orgA, email: "package-member@x.test", name: "Member", role: "MEMBER", printBalance: 2 }).returning();
  userA = user.id;
  await db.insert(printTopupPackages).values([
    { id: "a-10", orgId: orgA, pages: 10, priceRupiah: 10000, sortOrder: 1 },
    { id: "a-archived", orgId: orgA, pages: 50, priceRupiah: 45000, sortOrder: 2, archivedAt: new Date() },
    { id: "b-10", orgId: orgB, pages: 10, priceRupiah: 10000, sortOrder: 1 },
  ]);
});
afterAll(async () => { await sql`TRUNCATE TABLE transactions, print_topup_packages, organizations RESTART IDENTITY CASCADE`; await sql.end(); });

describe("print topup package repository", () => {
  it("AC-629: purchases the stored package atomically and writes one completed topup ledger row", async () => {
    const [before] = await db.select({ balance: appUsers.printBalance }).from(appUsers).where(eq(appUsers.id, userA));
    await purchasePrintTopup({ orgId: orgA, userId: userA, packageId: "a-10" });
    const [after] = await db.select({ balance: appUsers.printBalance }).from(appUsers).where(eq(appUsers.id, userA));
    expect(after.balance).toBe(before.balance + 10);
    const rows = await db.select().from(transactions).where(eq(transactions.userId, userA));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "PRINT_TOPUP", amountRupiah: 10000, status: "COMPLETED", orgId: orgA });
  });

  it("AC-630: rejects archived, unknown, and cross-org packages before writes", async () => {
    for (const packageId of ["a-archived", "b-10", "unknown"]) {
      await expect(purchasePrintTopup({ orgId: orgA, userId: userA, packageId })).rejects.toThrow(/UNKNOWN_PACKAGE/);
    }
    const rows = await db.select().from(transactions).where(eq(transactions.userId, userA));
    expect(rows).toHaveLength(1);
  });

  it("a forced simulated decline throws PAYMENT_DECLINED — no balance change, no ledger row", async () => {
    const [before] = await db.select({ balance: appUsers.printBalance }).from(appUsers).where(eq(appUsers.id, userA));
    const rowsBefore = await db.select().from(transactions).where(eq(transactions.userId, userA));

    await expect(
      purchasePrintTopup({ orgId: orgA, userId: userA, packageId: "a-10", simulatePayment: declinePayment }),
    ).rejects.toThrow(/PAYMENT_DECLINED/);

    const [after] = await db.select({ balance: appUsers.printBalance }).from(appUsers).where(eq(appUsers.id, userA));
    expect(after.balance).toBe(before.balance);

    const rowsAfter = await db.select().from(transactions).where(eq(transactions.userId, userA));
    expect(rowsAfter).toHaveLength(rowsBefore.length);
  });
  it("AC-628: lists only active, non-archived packages for the org in sort order", async () => {
    const rows = await listPrintTopupPackages(orgA);
    expect(rows.map((row) => row.id)).toEqual(["a-10"]);
    expect(rows.some((row) => row.orgId === orgB)).toBe(false);
  });

  it(": unknown and cross-org package ids are absent from the listing", async () => {
    const rows = await listPrintTopupPackages(orgA);
    expect(rows.find((row) => row.id === "a-archived")).toBeUndefined();
    expect(rows.find((row) => row.id === "b-10")).toBeUndefined();
    expect(rows.find((row) => row.id === "unknown")).toBeUndefined();
  });
});
