/**
 * Integration tests for lib/db/print.ts
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 *
 * AC-0234: submitPrintJob debits printBalance, inserts PENDING job, writes PRINT_JOB txn (atomic)
 * AC-0235: insufficient printBalance is rejected — no write (no job, no txn, balance unchanged)
 * AC-0236: tier discount applied server-side (PREMIUM 20%); total never trusts client
 * AC-0237: listPrintJobsByUser is org-scoped (no cross-org rows)
 * AC-0238: cross-org userId resolves to NOT_FOUND — no write
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { appUsers, organizations, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

/** Dedicated Drizzle + postgres-js client for test DB — never uses the app's singleton. */
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

// --- test data ---
let orgAId: string;
let orgBId: string;
let aUserId: string;
let bUserId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","print_jobs","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Print Org A", slug: "print-org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Print Org B", slug: "print-org-b-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  // PREMIUM member with 100 sheets of print balance.
  const [userA] = await testDb
    .insert(appUsers)
    .values({
      orgId: orgAId,
      email: "print-a@x.test",
      name: "Alice",
      role: "MEMBER",
      membershipTier: "PREMIUM",
      printBalance: 100,
    })
    .returning();
  const [userB] = await testDb
    .insert(appUsers)
    .values({
      orgId: orgBId,
      email: "print-b@x.test",
      name: "Bob",
      role: "MEMBER",
      membershipTier: "REGULAR",
      printBalance: 5,
    })
    .returning();
  aUserId = userA.id;
  bUserId = userB.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","print_jobs","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

// ---------------------------------------------------------------------------
// Repository under test
// ---------------------------------------------------------------------------
import {
  submitPrintJob,
  listPrintJobsByUser,
  listPrintJobsForAdmin,
} from "@/lib/db/print";
import { printJobs } from "@/lib/db/schema";

describe("lib/db/print", () => {
  // -------------------------------------------------------------------------
  // submitPrintJob — happy path (atomic debit + job + ledger)
  // -------------------------------------------------------------------------
  describe("submitPrintJob — atomic submit", () => {
    it("AC-0234: debits printBalance, inserts a PENDING job, and writes a PRINT_JOB txn — all atomic", async () => {
      const before = await testDb
        .select()
        .from(appUsers)
        .where(eq(appUsers.id, aUserId));
      expect(before[0].printBalance).toBe(100);

      const job = await submitPrintJob({
        orgId: orgAId,
        userId: aUserId,
        fileName: "dokumen.pdf",
        pages: 10,
        copies: 2,
        colorMode: "BW",
        paperSize: "A4",
        duplex: false,
      });

      // Job persisted PENDING with server-computed totals (PREMIUM 20%).
      expect(job.orgId).toBe(orgAId);
      expect(job.userId).toBe(aUserId);
      expect(job.status).toBe("PENDING");
      expect(job.pages).toBe(10);
      expect(job.copies).toBe(2);
      expect(job.pricePerPageRupiah).toBe(500);
      // subtotal = 500 × 10 × 2 = 10000 → 20% = 2000 → 8000
      expect(job.discountRupiah).toBe(2000);
      expect(job.totalRupiah).toBe(8000);

      // Balance debited by sheets = pages × copies = 20.
      const after = await testDb
        .select()
        .from(appUsers)
        .where(eq(appUsers.id, aUserId));
      expect(after[0].printBalance).toBe(80);

      // Ledger row written, linked to the job.
      const [txn] = await testDb
        .select()
        .from(transactions)
        .where(eq(transactions.printJobId, job.id));
      expect(txn).toBeDefined();
      expect(txn.type).toBe("PRINT_JOB");
      expect(txn.amountRupiah).toBe(8000);
      expect(txn.discountRupiah).toBe(2000);
      expect(txn.status).toBe("PENDING");
      expect(txn.orgId).toBe(orgAId);
      expect(txn.userId).toBe(aUserId);
    });

    it("AC-0236: COLOR + PREMIUM tier discount computed server-side (3× rate, 20% off)", async () => {
      const job = await submitPrintJob({
        orgId: orgAId,
        userId: aUserId,
        fileName: "warna.pdf",
        pages: 4,
        copies: 1,
        colorMode: "COLOR",
      });
      // rate 1500 × 4 × 1 = 6000 → 20% = 1200 → 4800
      expect(job.pricePerPageRupiah).toBe(1500);
      expect(job.discountRupiah).toBe(1200);
      expect(job.totalRupiah).toBe(4800);
    });
  });

  // -------------------------------------------------------------------------
  // submitPrintJob — insufficient balance (no write)
  // -------------------------------------------------------------------------
  describe("submitPrintJob — insufficient balance", () => {
    it("AC-0235: rejects when pages×copies > printBalance — no job, no txn, balance unchanged", async () => {
      // userB has 5 sheets; request 10 pages × 1 copy = 10 sheets.
      const [{ count: jobsBefore }] = await testSql`
        select count(*)::int as count from print_jobs where org_id = ${orgBId}`;
      const [{ count: txnsBefore }] = await testSql`
        select count(*)::int as count from transactions where org_id = ${orgBId}`;
      const userBBefore = await testDb
        .select()
        .from(appUsers)
        .where(eq(appUsers.id, bUserId));

      await expect(
        submitPrintJob({
          orgId: orgBId,
          userId: bUserId,
          fileName: "besar.pdf",
          pages: 10,
          copies: 1,
          colorMode: "BW",
        }),
      ).rejects.toThrow(/INSUFFICIENT_BALANCE/);

      // No write: job count, txn count, and balance all unchanged.
      const [{ count: jobsAfter }] = await testSql`
        select count(*)::int as count from print_jobs where org_id = ${orgBId}`;
      const [{ count: txnsAfter }] = await testSql`
        select count(*)::int as count from transactions where org_id = ${orgBId}`;
      const userBAfter = await testDb
        .select()
        .from(appUsers)
        .where(eq(appUsers.id, bUserId));
      expect(jobsAfter).toBe(jobsBefore);
      expect(txnsAfter).toBe(txnsBefore);
      expect(userBAfter[0].printBalance).toBe(userBBefore[0].printBalance);
    });

    it("AC-0235: a job exactly equal to the balance is allowed (boundary)", async () => {
      // userB has 5 sheets — request exactly 5 pages × 1 copy.
      const job = await submitPrintJob({
        orgId: orgBId,
        userId: bUserId,
        fileName: "pas.pdf",
        pages: 5,
        copies: 1,
        colorMode: "BW",
      });
      expect(job.status).toBe("PENDING");
      const [u] = await testDb
        .select()
        .from(appUsers)
        .where(eq(appUsers.id, bUserId));
      expect(u.printBalance).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // submitPrintJob — input validation + cross-org isolation
  // -------------------------------------------------------------------------
  describe("submitPrintJob — validation + org scope", () => {
    it("rejects an empty fileName (no write)", async () => {
      const [{ count: before }] = await testSql`
        select count(*)::int as count from print_jobs where org_id = ${orgAId}`;
      await expect(
        submitPrintJob({
          orgId: orgAId,
          userId: aUserId,
          fileName: "   ",
          pages: 1,
          copies: 1,
          colorMode: "BW",
        }),
      ).rejects.toThrow(/INVALID_FILE/);
      const [{ count: after }] = await testSql`
        select count(*)::int as count from print_jobs where org_id = ${orgAId}`;
      expect(after).toBe(before);
    });

    it("AC-0238: cross-org userId (orgB user under orgA) resolves to NOT_FOUND — no write", async () => {
      const [{ count: before }] = await testSql`
        select count(*)::int as count from print_jobs where org_id = ${orgAId}`;
      await expect(
        submitPrintJob({
          orgId: orgAId,
          userId: bUserId, // belongs to orgB
          fileName: "x.pdf",
          pages: 1,
          copies: 1,
          colorMode: "BW",
        }),
      ).rejects.toThrow(/NOT_FOUND/);
      const [{ count: after }] = await testSql`
        select count(*)::int as count from print_jobs where org_id = ${orgAId}`;
      expect(after).toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // listPrintJobsByUser — org + user scope
  // -------------------------------------------------------------------------
  describe("listPrintJobsByUser", () => {
    it("AC-0237: returns only the caller org + user's jobs, newest first", async () => {
      const jobs = await listPrintJobsByUser(orgAId, aUserId);
      expect(jobs.every((j) => j.orgId === orgAId && j.userId === aUserId)).toBe(
        true,
      );
      // org B jobs must never appear for an org A user.
      const orgBIds = jobs.filter((j) => j.orgId === orgBId);
      expect(orgBIds).toHaveLength(0);
      // newest-first ordering
      for (let i = 1; i < jobs.length; i++) {
        expect(jobs[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          jobs[i].createdAt.getTime(),
        );
      }
    });

    it("AC-0237: org A user cannot read org B user's jobs (cross-org isolation)", async () => {
      // Ask for orgB's user's jobs but scoped to orgA → must be empty.
      const leaked = await listPrintJobsByUser(orgAId, bUserId);
      expect(leaked).toHaveLength(0);
      // And the inverse: orgB asking for aUserId's rows → empty.
      const leaked2 = await listPrintJobsByUser(orgBId, aUserId);
      const crossRows = leaked2.filter(
        (j) => j.orgId === orgAId || j.userId === aUserId,
      );
      expect(crossRows).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // listPrintJobsForAdmin — org-scoped report listing + aggregate derivation
  // -------------------------------------------------------------------------
  describe("listPrintJobsForAdmin", () => {
    // Insert deterministic billing rows directly (one COMPLETED-with-discount +
    // one PENDING in org A, one COMPLETED in org B) so the org-scoping and the
    // revenue derivation are provable independent of the submit tests above.
    beforeAll(async () => {
      await testDb.insert(printJobs).values([
        {
          orgId: orgAId,
          userId: aUserId,
          fileName: "report-A-done.pdf",
          pages: 10,
          copies: 1,
          colorMode: "COLOR",
          paperSize: "A4",
          pricePerPageRupiah: 1500,
          discountRupiah: 3000,
          totalRupiah: 12000,
          status: "COMPLETED",
        },
        {
          orgId: orgAId,
          userId: aUserId,
          fileName: "report-A-pending.pdf",
          pages: 4,
          copies: 1,
          colorMode: "BW",
          paperSize: "A4",
          pricePerPageRupiah: 500,
          discountRupiah: 0,
          totalRupiah: 2000,
          status: "PENDING",
        },
        {
          orgId: orgBId,
          userId: bUserId,
          fileName: "report-B-done.pdf",
          pages: 5,
          copies: 1,
          colorMode: "BW",
          paperSize: "A4",
          pricePerPageRupiah: 500,
          discountRupiah: 0,
          totalRupiah: 2500,
          status: "COMPLETED",
        },
      ]);
    });

    it("AC-300: returns only the caller org's jobs, newest first", async () => {
      const rows = await listPrintJobsForAdmin(orgAId);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((j) => j.orgId === orgAId)).toBe(true);
      // org B's COMPLETED job never leaks into org A's report.
      expect(rows.some((j) => j.fileName === "report-B-done.pdf")).toBe(false);
      expect(rows.some((j) => j.fileName === "report-A-done.pdf")).toBe(true);
      // newest-first ordering.
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          rows[i].createdAt.getTime(),
        );
      }
    });

    it("AC-300: org B's COMPLETED revenue never leaks into org A's rows", async () => {
      // The summary derivation itself is unit-owned (AC-301, derive.test.ts);
      // here we prove the org-scoping the report's revenue depends on.
      const rows = await listPrintJobsForAdmin(orgAId);
      const revenue = rows
        .filter((j) => j.status === "COMPLETED")
        .reduce((s, j) => s + j.totalRupiah, 0);
      // The org-A COMPLETED job (12000) is counted; org B's 2500 is not.
      expect(revenue).toBeGreaterThanOrEqual(12000);
      expect(rows.some((j) => j.totalRupiah === 2500)).toBe(false);
    });
  });
});
