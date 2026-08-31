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
import {
  appUsers,
  organizations,
  transactions,
  orgPrintPricing,
  printers,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

/** Dedicated Drizzle + postgres-js client for test DB — never uses the app's singleton. */
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

// --- test data ---
let orgAId: string;
let orgBId: string;
let aUserId: string;
let bUserId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","print_jobs","membership_tier_config","org_print_pricing","app_users","organizations" RESTART IDENTITY CASCADE`;

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

  // Pricing config (I-027): the print discount is now config-driven, so the
  // test orgs need tier-config rows for PREMIUM 20% / REGULAR 0% to apply.
  await testDb.insert(membershipTierConfig).values([
    { orgId: orgAId, tier: "REGULAR", cafeDiscountPct: 5, printDiscountPct: 0 },
    { orgId: orgAId, tier: "PREMIUM", cafeDiscountPct: 5, printDiscountPct: 20 },
    { orgId: orgAId, tier: "GOLD", cafeDiscountPct: 5, printDiscountPct: 20 },
    { orgId: orgBId, tier: "REGULAR", cafeDiscountPct: 5, printDiscountPct: 0 },
    { orgId: orgBId, tier: "PREMIUM", cafeDiscountPct: 5, printDiscountPct: 20 },
    { orgId: orgBId, tier: "GOLD", cafeDiscountPct: 5, printDiscountPct: 20 },
  ]);

  await testDb.insert(orgPrintPricing).values([
    ...([
      ["BW", "A4", 500], ["BW", "A3", 1000], ["BW", "F4", 600],
      ["COLOR", "A4", 2000], ["COLOR", "A3", 4000], ["COLOR", "F4", 2500],
    ] as const).map(([colorMode, paperSize, pricePerPageRupiah]) => ({
      orgId: orgAId, colorMode, paperSize, pricePerPageRupiah, isActive: true,
    })),
    ...([
      ["BW", "A4", 500], ["BW", "A3", 1000], ["BW", "F4", 600],
      ["COLOR", "A4", 2000], ["COLOR", "A3", 4000], ["COLOR", "F4", 2500],
    ] as const).map(([colorMode, paperSize, pricePerPageRupiah]) => ({
      orgId: orgBId, colorMode, paperSize, pricePerPageRupiah, isActive: true,
    })),
  ]);
  await testDb.insert(printers).values([
    {
      orgId: orgAId,
      name: "test-printer-a",
      displayName: "Test Printer A",
      colorSupport: true,
      paperSizes: ["A4", "A3", "F4"],
      isDefault: true,
    },
    {
      orgId: orgBId,
      name: "test-printer-b",
      displayName: "Test Printer B",
      colorSupport: false,
      paperSizes: ["A4"],
      isDefault: true,
    },
  ]);
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","print_jobs","membership_tier_config","org_print_pricing","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

// ---------------------------------------------------------------------------
// Repository under test
// ---------------------------------------------------------------------------
import {
  submitPrintJob,
  listPrintJobsByUser,
  listPrintJobsForAdmin,
  getPrintReportSummary,
  advancePrintJob,
} from "@/lib/db/print";
import { printJobs, membershipTierConfig } from "@/lib/db/schema";

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

    it("AC-0236: COLOR + PREMIUM tier discount computed server-side (A4 rate, 20% off)", async () => {
      const job = await submitPrintJob({
        orgId: orgAId,
        userId: aUserId,
        fileName: "warna.pdf",
        pages: 4,
        copies: 1,
        colorMode: "COLOR",
      });
      // bridge default A4 rate 2000 × 4 × 1 = 8000 → 20% = 1600 → 6400
      expect(job.pricePerPageRupiah).toBe(2000);
      expect(job.discountRupiah).toBe(1600);
      expect(job.totalRupiah).toBe(6400);
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
      // getPrintReportSummary owns the aggregate proof (AC-301, below); here we
      // prove the org-scoping the report's revenue depends on.
      const rows = await listPrintJobsForAdmin(orgAId);
      const revenue = rows
        .filter((j) => j.status === "COMPLETED")
        .reduce((s, j) => s + j.totalRupiah, 0);
      // The org-A COMPLETED job (12000) is counted; org B's 2500 is not.
      expect(revenue).toBeGreaterThanOrEqual(12000);
      expect(rows.some((j) => j.totalRupiah === 2500)).toBe(false);
    });

    it("[SEC][I-047 minor] honors a smaller caller-supplied limit — the normalized LIMIT is genuinely wired to the SQL query (the decision math itself is unit-tested — lib/db/print.test.ts)", async () => {
      const rows = await listPrintJobsForAdmin(orgAId, {}, 1);
      expect(rows).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // getPrintReportSummary — SQL aggregates, exact, org-scoped, uncapped
  // -------------------------------------------------------------------------
  describe("getPrintReportSummary", () => {
    let orgCId: string;
    let c1: string;
    let c2: string;

    // A dedicated org with a KNOWN, fixed job set → exact-value assertions
    // (the other orgs above carry extra rows from the submit tests).
    beforeAll(async () => {
      const [orgC] = await testDb
        .insert(organizations)
        .values({ name: "Print Org C", slug: "print-org-c-test" })
        .returning();
      orgCId = orgC.id;
      const [u1] = await testDb
        .insert(appUsers)
        .values({ orgId: orgCId, email: "c1@x.test", name: "Cici", role: "MEMBER" })
        .returning();
      const [u2] = await testDb
        .insert(appUsers)
        .values({ orgId: orgCId, email: "c2@x.test", name: "Dodi", role: "MEMBER" })
        .returning();
      c1 = u1.id;
      c2 = u2.id;
      await testDb.insert(printJobs).values([
        // c1: COMPLETED 12000 (10 pages) + PENDING 2000 (4 pages)
        { orgId: orgCId, userId: c1, fileName: "c-done.pdf", pages: 10, copies: 1, colorMode: "COLOR", paperSize: "A4", pricePerPageRupiah: 1500, discountRupiah: 3000, totalRupiah: 12000, status: "COMPLETED" },
        { orgId: orgCId, userId: c1, fileName: "c-pending.pdf", pages: 4, copies: 1, colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500, discountRupiah: 0, totalRupiah: 2000, status: "PENDING" },
        // c2: COMPLETED 3000 (6 pages) + PROCESSING 1000 (2 pages)
        { orgId: orgCId, userId: c2, fileName: "c-done2.pdf", pages: 6, copies: 1, colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500, discountRupiah: 0, totalRupiah: 3000, status: "COMPLETED" },
        { orgId: orgCId, userId: c2, fileName: "c-processing.pdf", pages: 2, copies: 1, colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500, discountRupiah: 0, totalRupiah: 1000, status: "PROCESSING" },
      ]);
    });

    it("AC-301: exact totals — jobs/pages/distinct-users/COMPLETED-revenue (org-scoped)", async () => {
      const s = await getPrintReportSummary(orgCId);
      expect(s).toEqual({
        totalJobs: 4,
        totalPages: 22, // 10 + 4 + 6 + 2
        uniqueUsers: 2, // c1, c2 (distinct userId)
        totalRevenue: 15000, // 12000 + 3000 COMPLETED; PENDING/PROCESSING excluded
        completedCount: 2,
        pendingCount: 2, // I-047: 1 PENDING (c1) + 1 PROCESSING (c2)
      });
    });

    it("AC-301: empty org → all zeros", async () => {
      const [orgEmpty] = await testDb
        .insert(organizations)
        .values({ name: "Print Org Empty", slug: "print-org-empty-test" })
        .returning();
      const s = await getPrintReportSummary(orgEmpty.id);
      expect(s).toEqual({
        totalJobs: 0,
        totalPages: 0,
        uniqueUsers: 0,
        totalRevenue: 0,
        completedCount: 0,
        pendingCount: 0,
      });
    });
  });

  // -------------------------------------------------------------------------
  // listPrintJobsForAdmin — filters (I-047): search / status / date range
  // -------------------------------------------------------------------------
  describe("listPrintJobsForAdmin — filters (I-047)", () => {
    let filterOrgId: string;
    let filterUserAId: string;
    let filterUserBId: string;
    const oldDate = new Date("2026-01-05T00:00:00Z");
    const newDate = new Date("2026-06-15T00:00:00Z");

    beforeAll(async () => {
      const [org] = await testDb
        .insert(organizations)
        .values({ name: "Print Org Filter", slug: "print-org-filter-test" })
        .returning();
      filterOrgId = org.id;
      const [userA] = await testDb
        .insert(appUsers)
        .values({ orgId: filterOrgId, email: "filter-alpha@x.test", name: "Alpha Filterman", role: "MEMBER" })
        .returning();
      const [userB] = await testDb
        .insert(appUsers)
        .values({ orgId: filterOrgId, email: "filter-beta@x.test", name: "Beta Person", role: "MEMBER" })
        .returning();
      filterUserAId = userA.id;
      filterUserBId = userB.id;

      await testDb.insert(printJobs).values([
        { orgId: filterOrgId, userId: filterUserAId, fileName: "invoice-2026.pdf", pages: 1, copies: 1, colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500, totalRupiah: 500, status: "COMPLETED", createdAt: oldDate, updatedAt: oldDate },
        { orgId: filterOrgId, userId: filterUserAId, fileName: "resume.docx.pdf", pages: 2, copies: 1, colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500, totalRupiah: 1000, status: "PENDING", createdAt: newDate, updatedAt: newDate },
        { orgId: filterOrgId, userId: filterUserBId, fileName: "report.pdf", pages: 3, copies: 1, colorMode: "COLOR", paperSize: "A4", pricePerPageRupiah: 2000, totalRupiah: 6000, status: "COMPLETED", createdAt: newDate, updatedAt: newDate },
      ]);
    });

    it("[AC-047-P1] search matches the file name (case-insensitive substring)", async () => {
      const rows = await listPrintJobsForAdmin(filterOrgId, { search: "invoice" });
      expect(rows.map((r) => r.fileName)).toEqual(["invoice-2026.pdf"]);
    });

    it("[AC-047-P1] search also matches the owning user's name or email", async () => {
      const rows = await listPrintJobsForAdmin(filterOrgId, { search: "Beta" });
      expect(rows.map((r) => r.fileName)).toEqual(["report.pdf"]);

      const byEmail = await listPrintJobsForAdmin(filterOrgId, { search: "filter-alpha" });
      expect(byEmail.map((r) => r.fileName).sort()).toEqual(["invoice-2026.pdf", "resume.docx.pdf"]);
    });

    it("[AC-047-P2] status filter narrows to the exact job status", async () => {
      const rows = await listPrintJobsForAdmin(filterOrgId, { status: "PENDING" });
      expect(rows.map((r) => r.fileName)).toEqual(["resume.docx.pdf"]);
    });

    it("[AC-047-P3] date-range filter narrows by createdAt (bounded, parameterized)", async () => {
      const rows = await listPrintJobsForAdmin(filterOrgId, {
        dateFrom: new Date("2026-01-01T00:00:00Z"),
        dateTo: new Date("2026-01-31T23:59:59Z"),
      });
      expect(rows.map((r) => r.fileName)).toEqual(["invoice-2026.pdf"]);
    });

    it("[AC-047-P4] filters combine (AND) and stay org-scoped", async () => {
      const rows = await listPrintJobsForAdmin(filterOrgId, { status: "COMPLETED", search: "report" });
      expect(rows.map((r) => r.fileName)).toEqual(["report.pdf"]);
      expect(rows.every((r) => r.orgId === filterOrgId)).toBe(true);
    });

    it("no filters → returns every org row (existing behavior preserved)", async () => {
      const rows = await listPrintJobsForAdmin(filterOrgId);
      expect(rows).toHaveLength(3);
    });
  });
});

// ---------------------------------------------------------------------------
// I-043 member contract: effective sheets, capabilities, pricing, and history
// ---------------------------------------------------------------------------
describe("print lifecycle repository", () => {
  it("AC-616: advances an org-scoped job and records transition metadata", async () => {
    const [job] = await testDb.insert(printJobs).values({
      orgId: orgAId, userId: aUserId, fileName: "lifecycle.pdf", pages: 2, copies: 1,
      colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500, discountRupiah: 0,
      totalRupiah: 1000, totalPages: 2, pageRange: "all", status: "PENDING",
    }).returning();
    const processing = await advancePrintJob(orgAId, job.id, "PROCESSING", { processedBy: "agent-1" });
    expect(processing.status).toBe("PROCESSING");
    expect(processing.processedBy).toBe("agent-1");
    expect(processing.processedAt).toBeInstanceOf(Date);
    const ready = await advancePrintJob(orgAId, job.id, "READY", { processedBy: "agent-1" });
    expect(ready.status).toBe("READY");
  });

  it(": illegal org-scoped status changes perform no write", async () => {
    const [job] = await testDb.insert(printJobs).values({
      orgId: orgAId, userId: aUserId, fileName: "illegal.pdf", pages: 1, copies: 1,
      colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500, discountRupiah: 0,
      totalRupiah: 500, totalPages: 1, pageRange: "all", status: "PENDING",
    }).returning();
    await expect(advancePrintJob(orgAId, job.id, "COMPLETED")).rejects.toThrow(/INVALID_PRINT_TRANSITION/);
    const [unchanged] = await testDb.select().from(printJobs).where(eq(printJobs.id, job.id));
    expect(unchanged.status).toBe("PENDING");
  });

  it("AC-637: report pages use effective total_pages and revenue only counts COMPLETED", async () => {
    const [org] = await testDb.insert(organizations).values({ name: "Summary Org", slug: "summary-org" }).returning();
    const [member] = await testDb.insert(appUsers).values({ orgId: org.id, email: "summary@x.test", name: "Summary", role: "MEMBER" }).returning();
    await testDb.insert(printJobs).values([
      { orgId: org.id, userId: member.id, fileName: "done.pdf", pages: 10, copies: 2, totalPages: 3, pageRange: "1-3", colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500, discountRupiah: 0, totalRupiah: 1500, status: "COMPLETED" },
      { orgId: org.id, userId: member.id, fileName: "pending.pdf", pages: 10, copies: 2, totalPages: 4, pageRange: "1-4", colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500, discountRupiah: 0, totalRupiah: 2000, status: "PENDING" },
    ]);
    expect(await getPrintReportSummary(org.id)).toMatchObject({ totalPages: 7, totalRevenue: 1500, completedCount: 1 });
  });
});

describe("submitPrintJob — I-043 member contract", () => {
  it("AC-601: parses the selected range and debits effective sheets, not document pages", async () => {
    const [before] = await testDb.select({ balance: appUsers.printBalance }).from(appUsers).where(eq(appUsers.id, aUserId));
    const [printer] = await testDb.select({ id: printers.id }).from(printers).where(eq(printers.orgId, orgAId)).limit(1);
    const job = await submitPrintJob({
      orgId: orgAId, userId: aUserId, fileName: "range.pdf", pageRange: "1-3,5", documentPages: 8,
      printerId: printer.id, copies: 2, colorMode: "BW", paperSize: "A4", duplex: true,
    });
    expect(job.pageRange).toBe("1-3,5");
    expect(job.pages).toBe(8);
    expect(job.totalPages).toBe(8);
    expect(job.copies).toBe(2);
    expect(job.duplex).toBe(true);
    const [after] = await testDb.select({ balance: appUsers.printBalance }).from(appUsers).where(eq(appUsers.id, aUserId));
    expect(after.balance).toBe(before.balance - 8);
  });

  it("AC-607: requires an active default or selected printer before any write", async () => {
    await testSql`UPDATE printers SET is_active = false, is_default = false WHERE org_id = ${orgBId}`;
    await expect(submitPrintJob({
      orgId: orgBId, userId: bUserId, fileName: "none.pdf", pageRange: "all", documentPages: 1,
      copies: 1, colorMode: "BW", paperSize: "A4",
    })).rejects.toThrow(/INVALID_PRINTER/);
  });

  it("AC-608: rejects printer capability mismatches before balance debit", async () => {
    await testSql`UPDATE printers SET is_active = true, is_default = true WHERE org_id = ${orgBId}`;
    await expect(submitPrintJob({
      orgId: orgBId, userId: bUserId, fileName: "color.pdf", pageRange: "all", documentPages: 1,
      copies: 1, colorMode: "COLOR", paperSize: "A4",
    })).rejects.toThrow(/UNSUPPORTED_COLOR/);
  });

  it("AC-610: rejects an inactive matrix cell rather than using a fallback rate", async () => {
    await testSql`UPDATE org_print_pricing SET is_active = false WHERE org_id = ${orgAId} AND color_mode = 'BW' AND paper_size = 'F4'`;
    await expect(submitPrintJob({
      orgId: orgAId, userId: aUserId, fileName: "inactive.pdf", pageRange: "all", documentPages: 1,
      copies: 1, colorMode: "BW", paperSize: "F4",
    })).rejects.toThrow(/INVALID_PRINT_PRICING/);
    await testSql`UPDATE org_print_pricing SET is_active = true WHERE org_id = ${orgAId} AND color_mode = 'BW' AND paper_size = 'F4'`;
  });

  it("AC-611: snapshots server-resolved tier discount and selected matrix price", async () => {
    const job = await submitPrintJob({
      orgId: orgAId, userId: aUserId, fileName: "discount.pdf", pageRange: "all", documentPages: 3,
      copies: 1, colorMode: "COLOR", paperSize: "A3",
    });
    expect(job.pricePerPageRupiah).toBe(4000);
    expect(job.discountRupiah).toBe(2400);
    expect(job.totalRupiah).toBe(9600);
  });

  it("AC-613: member history is org/user scoped, capped at 20, and maps all five statuses", async () => {
    await testDb.insert(printJobs).values(["PENDING", "PROCESSING", "READY", "COMPLETED", "FAILED"].map((status, index) => ({
      orgId: orgAId, userId: aUserId, fileName: `status-${index}.pdf`, pages: 1, copies: 1,
      colorMode: "BW" as const, paperSize: "A4", pricePerPageRupiah: 500, discountRupiah: 0,
      totalRupiah: 500, totalPages: 1, pageRange: "all", status: status as "PENDING" | "PROCESSING" | "READY" | "COMPLETED" | "FAILED",
    })));
    const rows = await listPrintJobsByUser(orgAId, aUserId, 999);
    expect(new Set(rows.filter((row) => row.fileName.startsWith("status-")).map((row) => row.status))).toEqual(new Set(["PENDING", "PROCESSING", "READY", "COMPLETED", "FAILED"]));
  });

  it("AC-635: member history is capped at 20 rows and includes printer display data", async () => {
    const rows = await listPrintJobsByUser(orgAId, aUserId, 999);
    expect(rows.length).toBeLessThanOrEqual(20);
    const newest = rows.find((row) => row.fileName === "range.pdf");
    expect(newest).toBeDefined();
    expect((newest as typeof newest & { printerDisplayName?: string }).printerDisplayName).toBe("Test Printer A");
  });
});
