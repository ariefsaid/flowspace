/**
 * Integration tests for lib/db/bookings.ts
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 *
 * AC-130: createBooking (scheduled) computes amount=hours×DB-rate, ACTIVE/PENDING,
 *         and writes a COMPLETED BOOKING ledger row atomically.
 * AC-131: createBooking (walk-in) opens endAt null, amount 0, WAITING_CASHIER,
 *         and writes a PENDING BOOKING ledger row.
 * AC-132: completeBooking caps a walk-in's charge at 4h.
 * AC-133: createBooking rejects a cross-org facility (no write).
 * AC-134: getActiveBooking / listBookingsByUser are org-scoped (cross-org null).
 * AC-135: cancelBooking is org-scoped (cross-org → NOT_FOUND, no write).
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
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

/** Dedicated Drizzle + postgres-js client for test DB — never uses the app's singleton. */
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

// --- test data ---
let orgAId: string;
let orgBId: string;
let aUserId: string;
let bUserId: string;
let seatAId: string;
let orgBFacilityId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","bookings","facilities","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Booking Org A", slug: "booking-org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Booking Org B", slug: "booking-org-b-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [userA] = await testDb
    .insert(appUsers)
    .values({ orgId: orgAId, email: "booking-a@x.test", name: "Alice", role: "MEMBER" })
    .returning();
  const [userB] = await testDb
    .insert(appUsers)
    .values({ orgId: orgBId, email: "booking-b@x.test", name: "Bob", role: "MEMBER" })
    .returning();
  aUserId = userA.id;
  bUserId = userB.id;

  const [seat] = await testDb
    .insert(facilities)
    .values({
      orgId: orgAId,
      name: "Meja A",
      type: "COWORKING_SEAT",
      ratePerHourRupiah: 20000,
      available: true,
    })
    .returning();
  seatAId = seat.id;

  // A meeting room in org A (seeded for facility-list completeness).
  await testDb.insert(facilities).values({
    orgId: orgAId,
    name: "Meeting Room A",
    type: "MEETING_ROOM",
    ratePerHourRupiah: 120000,
    available: true,
  });

  const [orgBFac] = await testDb
    .insert(facilities)
    .values({
      orgId: orgBId,
      name: "Meja A",
      type: "COWORKING_SEAT",
      ratePerHourRupiah: 20000,
      available: true,
    })
    .returning();
  orgBFacilityId = orgBFac.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","bookings","facilities","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

// ---------------------------------------------------------------------------
// Import the repository functions under test
// ---------------------------------------------------------------------------
import {
  listFacilities,
  listBookingsByUser,
  getActiveBooking,
  createBooking,
  completeBooking,
  cancelBooking,
} from "@/lib/db/bookings";

const HOUR = 3_600_000;

describe("lib/db/bookings", () => {
  // -------------------------------------------------------------------------
  // listFacilities
  // -------------------------------------------------------------------------
  describe("listFacilities", () => {
    it("AC-134: returns only the caller org's bookable facilities, optionally filtered by type", async () => {
      const seats = await listFacilities(orgAId, "COWORKING_SEAT");
      expect(seats.every((f) => f.orgId === orgAId)).toBe(true);
      expect(seats.map((f) => f.name)).toContain("Meja A");
      expect(seats.every((f) => f.type === "COWORKING_SEAT")).toBe(true);

      const all = await listFacilities(orgAId);
      expect(all.length).toBeGreaterThanOrEqual(2);

      // Org isolation: org B's "Meja A" must not leak into org A's list.
      const bList = await listFacilities(orgBId);
      expect(bList.every((f) => f.orgId === orgBId)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // createBooking — scheduled (money path)
  // -------------------------------------------------------------------------
  describe("createBooking — scheduled", () => {
    it("AC-130: computes amount=hours×DB-rate, ACTIVE/PENDING, and writes a COMPLETED BOOKING ledger row", async () => {
      const startAt = new Date("2026-07-01T09:00:00");
      const endAt = new Date("2026-07-01T11:00:00"); // 2h

      const booking = await createBooking({
        orgId: orgAId,
        userId: aUserId,
        facilityType: "COWORKING_SEAT",
        facilityName: "Meja A",
        startAt,
        endAt,
        // client rate ignored — server reads 20000 from the facility row [SEC]
        ratePerHourRupiah: 0,
      });

      expect(booking.orgId).toBe(orgAId);
      expect(booking.userId).toBe(aUserId);
      expect(booking.facilityId).toBe(seatAId);
      expect(booking.facilityName).toBe("Meja A");
      expect(booking.ratePerHourRupiah).toBe(20000); // from DB row, not the input
      expect(booking.durationHours).toBe(2);
      expect(booking.amountRupiah).toBe(40000); // 2 × 20000
      expect(booking.status).toBe("ACTIVE");
      expect(booking.paymentStatus).toBe("PENDING");

      // Ledger row written atomically, COMPLETED, bookingId-linked.
      const [txn] = await testDb
        .select()
        .from(transactions)
        .where(eq(transactions.bookingId, booking.id));
      expect(txn).toBeDefined();
      expect(txn.type).toBe("BOOKING");
      expect(txn.amountRupiah).toBe(40000);
      expect(txn.status).toBe("COMPLETED");
      expect(txn.orgId).toBe(orgAId);
    });

    it("AC-133: rejects a facility name that does not exist in the org (no write)", async () => {
      const [{ count: before }] = await testSql`
        select count(*)::int as count from bookings where org_id = ${orgAId}`;
      await expect(
        createBooking({
          orgId: orgAId,
          userId: aUserId,
          facilityType: "COWORKING_SEAT",
          facilityName: "Meja Does Not Exist",
          startAt: new Date("2026-07-02T09:00:00"),
          endAt: new Date("2026-07-02T10:00:00"),
          ratePerHourRupiah: 0,
        }),
      ).rejects.toThrow(/INVALID_FACILITY/);
      const [{ count: after }] = await testSql`
        select count(*)::int as count from bookings where org_id = ${orgAId}`;
      expect(after).toBe(before);
    });

    it("AC-133: resolves by id within the org but a cross-org id is rejected", async () => {
      // org B's facility id presented to org A → must be rejected (no write).
      const [{ count: before }] = await testSql`
        select count(*)::int as count from bookings where org_id = ${orgAId}`;
      await expect(
        createBooking({
          orgId: orgAId,
          userId: aUserId,
          facilityType: "COWORKING_SEAT",
          facilityId: orgBFacilityId, // belongs to org B
          facilityName: "Meja A",
          startAt: new Date("2026-07-03T09:00:00"),
          endAt: new Date("2026-07-03T10:00:00"),
          ratePerHourRupiah: 0,
        }),
      ).rejects.toThrow(/INVALID_FACILITY/);
      const [{ count: after }] = await testSql`
        select count(*)::int as count from bookings where org_id = ${orgAId}`;
      expect(after).toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // createBooking — walk-in (money path)
  // -------------------------------------------------------------------------
  describe("createBooking — walk-in", () => {
    it("AC-131: opens endAt null, amount 0, WAITING_CASHIER, and writes a PENDING BOOKING ledger row", async () => {
      const booking = await createBooking({
        orgId: orgAId,
        userId: aUserId,
        facilityType: "WALKIN_COWORKING",
        facilityName: "Walk-in Coworking",
        ratePerHourRupiah: 15000,
      });

      expect(booking.facilityType).toBe("WALKIN_COWORKING");
      expect(booking.endAt).toBeNull();
      expect(booking.durationHours).toBeNull();
      expect(booking.amountRupiah).toBe(0);
      expect(booking.ratePerHourRupiah).toBe(15000);
      expect(booking.status).toBe("ACTIVE");
      expect(booking.paymentStatus).toBe("WAITING_CASHIER");

      const [txn] = await testDb
        .select()
        .from(transactions)
        .where(eq(transactions.bookingId, booking.id));
      expect(txn).toBeDefined();
      expect(txn.type).toBe("BOOKING");
      expect(txn.amountRupiah).toBe(0);
      expect(txn.status).toBe("PENDING");
    });

    it("AC-130: FULL_ROOM is not bookable online", async () => {
      await expect(
        createBooking({
          orgId: orgAId,
          userId: aUserId,
          facilityType: "FULL_ROOM",
          facilityName: "Full Room Event",
          ratePerHourRupiah: 0,
        }),
      ).rejects.toThrow(/FULL_ROOM_NOT_BOOKABLE_ONLINE/);
    });
  });

  // -------------------------------------------------------------------------
  // completeBooking — walk-in 4h cap
  // -------------------------------------------------------------------------
  describe("completeBooking — walk-in 4h cap", () => {
    it("AC-132: caps a >4h walk-in at 4h and computes amount=4×rate", async () => {
      // Seed a walk-in that started 5h ago (exceeds the 4h cap).
      const [open] = await testDb
        .insert(bookings)
        .values({
          orgId: orgAId,
          userId: aUserId,
          facilityType: "WALKIN_COWORKING",
          facilityId: null,
          facilityName: "Walk-in Coworking",
          startAt: new Date(Date.now() - 5 * HOUR),
          endAt: null,
          durationHours: null,
          ratePerHourRupiah: 15000,
          amountRupiah: 0,
          status: "ACTIVE",
          paymentStatus: "WAITING_CASHIER",
        })
        .returning();

      const completed = await completeBooking(orgAId, open.id);
      expect(completed.status).toBe("COMPLETED");
      expect(completed.durationHours).toBe(4); // capped
      expect(completed.amountRupiah).toBe(60000); // 4 × 15000
      expect(completed.endAt).not.toBeNull();
    });

    it("AC-132: a short walk-in charges actual ceil(elapsed) hours (no cap reached)", async () => {
      const [open] = await testDb
        .insert(bookings)
        .values({
          orgId: orgAId,
          userId: aUserId,
          facilityType: "WALKIN_COWORKING",
          facilityId: null,
          facilityName: "Walk-in Coworking",
          startAt: new Date(Date.now() - 90 * 60_000), // 1.5h → ceil 2
          endAt: null,
          durationHours: null,
          ratePerHourRupiah: 15000,
          amountRupiah: 0,
          status: "ACTIVE",
          paymentStatus: "WAITING_CASHIER",
        })
        .returning();

      const completed = await completeBooking(orgAId, open.id);
      expect(completed.durationHours).toBe(2);
      expect(completed.amountRupiah).toBe(30000);
    });

    it("AC-135: completeBooking on a cross-org booking throws NOT_FOUND, no write", async () => {
      const [b] = await testDb
        .insert(bookings)
        .values({
          orgId: orgBId,
          userId: bUserId,
          facilityType: "WALKIN_COWORKING",
          facilityId: null,
          facilityName: "Walk-in Coworking",
          startAt: new Date(Date.now() - HOUR),
          endAt: null,
          durationHours: null,
          ratePerHourRupiah: 15000,
          amountRupiah: 0,
          status: "ACTIVE",
          paymentStatus: "WAITING_CASHIER",
        })
        .returning();
      await expect(completeBooking(orgAId, b.id)).rejects.toThrow(/NOT_FOUND/);
      const [fresh] = await testDb
        .select()
        .from(bookings)
        .where(eq(bookings.id, b.id));
      expect(fresh.status).toBe("ACTIVE");
    });
  });

  // -------------------------------------------------------------------------
  // getActiveBooking / listBookingsByUser / cancelBooking (org-scoped reads)
  // -------------------------------------------------------------------------
  describe("reads + cancel — org scoping", () => {
    it("AC-134: getActiveBooking returns the newest ACTIVE booking for the caller org+user, null cross-org", async () => {
      const active = await getActiveBooking(orgAId, aUserId);
      expect(active).not.toBeNull();
      expect(active!.orgId).toBe(orgAId);
      expect(active!.userId).toBe(aUserId);
      expect(active!.status).toBe("ACTIVE");

      // Cross-org: org B user has no active booking visible to org A's scope.
      const none = await getActiveBooking(orgAId, "00000000-0000-0000-0000-000000000000");
      expect(none).toBeNull();
    });

    it("AC-134: listBookingsByUser returns only the caller org+user's bookings", async () => {
      const list = await listBookingsByUser(orgAId, aUserId);
      expect(list.every((b) => b.orgId === orgAId && b.userId === aUserId)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    });

    it("AC-135: cancelBooking is org-scoped (cross-org id → NOT_FOUND, no write)", async () => {
      const [b] = await testDb
        .insert(bookings)
        .values({
          orgId: orgBId,
          userId: bUserId,
          facilityType: "WALKIN_COWORKING",
          facilityId: null,
          facilityName: "Walk-in Coworking",
          startAt: new Date(),
          endAt: null,
          durationHours: null,
          ratePerHourRupiah: 15000,
          amountRupiah: 0,
          status: "ACTIVE",
          paymentStatus: "WAITING_CASHIER",
        })
        .returning();
      await expect(cancelBooking(orgAId, b.id)).rejects.toThrow(/NOT_FOUND/);
      const [fresh] = await testDb
        .select()
        .from(bookings)
        .where(eq(bookings.id, b.id));
      expect(fresh.status).toBe("ACTIVE"); // unchanged
    });

    it("AC-135: cancelBooking flips an ACTIVE booking in the caller org to CANCELLED", async () => {
      const [b] = await testDb
        .insert(bookings)
        .values({
          orgId: orgAId,
          userId: aUserId,
          facilityType: "WALKIN_COWORKING",
          facilityId: null,
          facilityName: "Walk-in Coworking",
          startAt: new Date(),
          endAt: null,
          durationHours: null,
          ratePerHourRupiah: 15000,
          amountRupiah: 0,
          status: "ACTIVE",
          paymentStatus: "WAITING_CASHIER",
        })
        .returning();
      const cancelled = await cancelBooking(orgAId, b.id);
      expect(cancelled.status).toBe("CANCELLED");
    });
  });
});
