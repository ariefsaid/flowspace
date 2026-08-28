/**
 * Integration tests for the admin vertical: pending payments + cashier approve
 * (lib/db/bookings.ts), the SoD role gate (lib/admin/authz.ts), and the revenue
 * sum (lib/db/transactions.ts). Runs against the Supabase local Postgres via
 * TEST_DATABASE_URL.
 *
 * I-040: fixtures migrated to the PENDING-first lifecycle (OBS-813) —
 * WAITING_CASHIER now always pairs with a PENDING booking (scheduled or
 * walk-in), never a COMPLETED one. Adds AC-835 (non-ADMIN approve/start/
 * checkout is FORBIDDEN before any write).
 *
 * AC-ADM-01: approvePaymentAsActor denies a non-ADMIN actor (FORBIDDEN) — no write
 *            to the booking or its ledger row (SoD no-write proof).
 * AC-ADM-02: listPendingBookings is org-scoped (org A never sees org B's pending).
 * AC-ADM-03: sumRevenueSince sums COMPLETED transaction amounts only (PENDING excluded).
 * AC-ADM-04: approvePayment (ADMIN) sets CONFIRMED/PAID_CASHIER and settles the linked
 *            BOOKING ledger row to COMPLETED atomically; the amount then counts toward revenue.
 * AC-ADM-05: approvePayment on a cross-org booking id throws NOT_FOUND, no write.
 * AC-835:    non-ADMIN approveAndStartWalkIn/checkoutBooking are FORBIDDEN, no write.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  appUsers,
  organizations,
  facilities,
  bookings,
  transactions,
} from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

/** Dedicated Drizzle + postgres-js client for test DB — never uses the app's singleton. */
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

// --- test data ---
let orgAId: string;
let orgBId: string;
let aMemberId: string;
let aAdminId: string;
let bMemberId: string;
let bookingA1Id: string; // org A scheduled booking awaiting cashier settlement (45000)
let bookingB1Id: string; // org B scheduled booking awaiting cashier settlement (60000)
let bookingA2Id: string; // org A ACTIVE walk-in (for AC-835 checkout FORBIDDEN)
let bookingA3Id: string; // org A PENDING walk-in (for AC-835 approve-and-start FORBIDDEN)

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","bookings","facilities","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Admin Org A", slug: "admin-org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Admin Org B", slug: "admin-org-b-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [aMember] = await testDb
    .insert(appUsers)
    .values({ orgId: orgAId, email: "admin-a-member@x.test", name: "Alice", role: "MEMBER" })
    .returning();
  const [aAdmin] = await testDb
    .insert(appUsers)
    .values({ orgId: orgAId, email: "admin-a-admin@x.test", name: "AdminA", role: "ADMIN" })
    .returning();
  const [bMember] = await testDb
    .insert(appUsers)
    .values({ orgId: orgBId, email: "admin-b-member@x.test", name: "Bob", role: "MEMBER" })
    .returning();
  aMemberId = aMember.id;
  aAdminId = aAdmin.id;
  bMemberId = bMember.id;

  const [facA] = await testDb
    .insert(facilities)
    .values({ orgId: orgAId, name: "Meja A", type: "COWORKING_SEAT", ratePerHourRupiah: 45000, available: true })
    .returning();
  const [facB] = await testDb
    .insert(facilities)
    .values({ orgId: orgBId, name: "Meja A", type: "COWORKING_SEAT", ratePerHourRupiah: 60000, available: true })
    .returning();

  // A PENDING scheduled booking in org A awaiting cashier settlement (45000, WAITING_CASHIER).
  const [bookingA1] = await testDb
    .insert(bookings)
    .values({
      orgId: orgAId,
      userId: aMemberId,
      facilityType: "COWORKING_SEAT",
      facilityId: facA.id,
      facilityName: "Meja A",
      startAt: new Date(Date.now() + 3_600_000),
      endAt: new Date(Date.now() + 2 * 3_600_000),
      durationHours: 1,
      ratePerHourRupiah: 45000,
      amountRupiah: 45000,
      baseAmountRupiah: 45000,
      discountRupiah: 0,
      status: "PENDING",
      paymentStatus: "WAITING_CASHIER",
      bookingMode: "SCHEDULED",
      paymentMethod: "cashier",
    })
    .returning();
  bookingA1Id = bookingA1.id;

  // Linked PENDING BOOKING ledger row (amount 45000) — must settle to COMPLETED on approve.
  await testDb.insert(transactions).values({
    orgId: orgAId,
    userId: aMemberId,
    type: "BOOKING",
    description: "Booking Meja A",
    amountRupiah: 45000,
    status: "PENDING",
    bookingId: bookingA1Id,
  });

  // A PENDING scheduled booking in org B awaiting cashier settlement (must NOT leak to org A).
  const [bookingB1] = await testDb
    .insert(bookings)
    .values({
      orgId: orgBId,
      userId: bMemberId,
      facilityType: "COWORKING_SEAT",
      facilityId: facB.id,
      facilityName: "Meja A",
      startAt: new Date(Date.now() + 3_600_000),
      endAt: new Date(Date.now() + 2 * 3_600_000),
      durationHours: 1,
      ratePerHourRupiah: 60000,
      amountRupiah: 60000,
      baseAmountRupiah: 60000,
      discountRupiah: 0,
      status: "PENDING",
      paymentStatus: "WAITING_CASHIER",
      bookingMode: "SCHEDULED",
      paymentMethod: "cashier",
    })
    .returning();
  bookingB1Id = bookingB1.id;

  await testDb.insert(transactions).values({
    orgId: orgBId,
    userId: bMemberId,
    type: "BOOKING",
    description: "Booking Meja A",
    amountRupiah: 60000,
    status: "PENDING",
    bookingId: bookingB1Id,
  });

  // Standalone org-A ledger rows for the revenue-sum test.
  await testDb.insert(transactions).values({
    orgId: orgAId,
    userId: aMemberId,
    type: "BOOKING",
    description: "Settled booking (revenue)",
    amountRupiah: 50000,
    status: "COMPLETED",
  });
  await testDb.insert(transactions).values({
    orgId: orgAId,
    userId: aMemberId,
    type: "BOOKING",
    description: "Still-pending booking (excluded from revenue)",
    amountRupiah: 30000,
    status: "PENDING",
  });

  // AC-835 fixtures: an ACTIVE walk-in (checkout target) and a PENDING walk-in (approve-and-start target).
  const [bookingA2] = await testDb
    .insert(bookings)
    .values({
      orgId: orgAId,
      userId: aMemberId,
      facilityType: "WALKIN_COWORKING",
      facilityId: null,
      facilityName: "Walk-in Coworking",
      startAt: new Date(Date.now() - 3_600_000),
      endAt: null,
      durationHours: null,
      ratePerHourRupiah: 15000,
      amountRupiah: 0,
      baseAmountRupiah: 0,
      discountRupiah: 0,
      status: "ACTIVE",
      paymentStatus: "WAITING_CASHIER",
      bookingMode: "WALKIN",
      paymentMethod: "cashier",
    })
    .returning();
  bookingA2Id = bookingA2.id;
  await testDb.insert(transactions).values({
    orgId: orgAId,
    userId: aMemberId,
    type: "BOOKING",
    description: "Booking Walk-in Coworking",
    amountRupiah: 0,
    status: "PENDING",
    bookingId: bookingA2Id,
  });

  const [bookingA3] = await testDb
    .insert(bookings)
    .values({
      orgId: orgAId,
      userId: aMemberId,
      facilityType: "WALKIN_COWORKING",
      facilityId: null,
      facilityName: "Walk-in Coworking",
      startAt: new Date(),
      endAt: null,
      durationHours: null,
      ratePerHourRupiah: 15000,
      amountRupiah: 0,
      baseAmountRupiah: 0,
      discountRupiah: 0,
      status: "PENDING",
      paymentStatus: "WAITING_CASHIER",
      bookingMode: "WALKIN",
      paymentMethod: "cashier",
    })
    .returning();
  bookingA3Id = bookingA3.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","bookings","facilities","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

// ---------------------------------------------------------------------------
// Import the repository functions + authz seam under test
// ---------------------------------------------------------------------------
import { listPendingBookings, approvePayment } from "@/lib/db/bookings";
import { sumRevenueSince } from "@/lib/db/transactions";
import { approvePaymentAsActor, checkoutBookingAsActor, approveAndStartWalkInAsActor } from "@/lib/admin/authz";

const YEAR_AGO = new Date(Date.now() - 365 * 86_400_000);

describe("admin vertical — pending payments + approve (SoD) + revenue", () => {
  it("AC-ADM-01: approvePaymentAsActor denies a non-ADMIN actor (FORBIDDEN), no write", async () => {
    const beforeBooking = await testDb
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingA1Id));
    const beforeTxn = await testDb
      .select()
      .from(transactions)
      .where(eq(transactions.bookingId, bookingA1Id));

    await expect(
      approvePaymentAsActor(
        { id: aMemberId, role: "MEMBER", orgId: orgAId },
        bookingA1Id,
      ),
    ).rejects.toThrow(/FORBIDDEN/);

    const afterBooking = await testDb
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingA1Id));
    const afterTxn = await testDb
      .select()
      .from(transactions)
      .where(eq(transactions.bookingId, bookingA1Id));

    // No write: status/paymentStatus unchanged, ledger status unchanged.
    expect(afterBooking[0].status).toBe(beforeBooking[0].status);
    expect(afterBooking[0].status).toBe("PENDING");
    expect(afterBooking[0].paymentStatus).toBe("WAITING_CASHIER");
    expect(afterTxn[0].status).toBe(beforeTxn[0].status);
    expect(afterTxn[0].status).toBe("PENDING");
  });

  it("AC-ADM-02: listPendingBookings is org-scoped (org A never sees org B's pending)", async () => {
    const pending = await listPendingBookings(orgAId);
    expect(pending.every((b) => b.orgId === orgAId)).toBe(true);
    expect(pending.map((b) => b.id)).toContain(bookingA1Id);
    expect(pending.map((b) => b.id)).toContain(bookingA3Id);
    expect(pending.map((b) => b.id)).not.toContain(bookingB1Id);
  });

  it("AC-ADM-03: sumRevenueSince sums COMPLETED amounts only (PENDING excluded)", async () => {
    // Seeded org-A COMPLETED = 50000; the 45000 (bookingA1) + 30000 are PENDING → excluded.
    const revenue = await sumRevenueSince(orgAId, YEAR_AGO);
    expect(revenue).toBe(50000);
  });

  it("AC-ADM-04: approvePayment (ADMIN) sets CONFIRMED/PAID_CASHIER and settles the linked ledger row to COMPLETED", async () => {
    const approved = await approvePaymentAsActor(
      { id: aAdminId, role: "ADMIN", orgId: orgAId },
      bookingA1Id,
    );
    expect(approved.status).toBe("CONFIRMED");
    expect(approved.paymentStatus).toBe("PAID_CASHIER");

    const [txn] = await testDb
      .select()
      .from(transactions)
      .where(eq(transactions.bookingId, bookingA1Id));
    expect(txn.status).toBe("COMPLETED");
    expect(txn.amountRupiah).toBe(45000);

    // The settled amount now counts toward revenue (50000 + 45000).
    const revenue = await sumRevenueSince(orgAId, YEAR_AGO);
    expect(revenue).toBe(95000);
  });

  it("AC-ADM-05: approvePayment on a cross-org booking id throws NOT_FOUND, no write", async () => {
    const before = await testDb
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingB1Id));
    await expect(approvePayment(orgAId, bookingB1Id)).rejects.toThrow(/NOT_FOUND/);
    const after = await testDb
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingB1Id));
    expect(after[0].paymentStatus).toBe(before[0].paymentStatus);
    expect(after[0].paymentStatus).toBe("WAITING_CASHIER");
  });

  it("AC-835: checkoutBookingAsActor denies a non-ADMIN actor (FORBIDDEN), no write", async () => {
    await expect(
      checkoutBookingAsActor({ id: aMemberId, role: "MEMBER", orgId: orgAId }, bookingA2Id, "cash"),
    ).rejects.toThrow(/FORBIDDEN/);
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, bookingA2Id));
    expect(fresh.status).toBe("ACTIVE"); // unchanged
  });

  it("AC-835: approveAndStartWalkInAsActor denies a non-ADMIN actor (FORBIDDEN), no write", async () => {
    await expect(
      approveAndStartWalkInAsActor({ id: aMemberId, role: "BARISTA", orgId: orgAId }, bookingA3Id),
    ).rejects.toThrow(/FORBIDDEN/);
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, bookingA3Id));
    expect(fresh.status).toBe("PENDING"); // unchanged
  });

  it("AC-835: an ADMIN actor is allowed through the gate (positive control)", async () => {
    const started = await approveAndStartWalkInAsActor({ id: aAdminId, role: "ADMIN", orgId: orgAId }, bookingA3Id);
    expect(started.status).toBe("ACTIVE");
    const completed = await checkoutBookingAsActor({ id: aAdminId, role: "ADMIN", orgId: orgAId }, bookingA2Id, "cash");
    expect(completed.status).toBe("COMPLETED");
  });
});
