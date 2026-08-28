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
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

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
  getFacilityAvailability,
  getFullRoomAvailability,
  facilitiesAvailableInWindow,
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

  // -------------------------------------------------------------------------
  // Availability read model (I-040, Phase 4) — AC-804/805/806
  // -------------------------------------------------------------------------
  describe("availability read model — AC-804/805/806", () => {
    let availOrgId: string;
    let availUserId: string;
    let availSeatId: string;
    let availSeat2Id: string;
    let availFullRoomId: string;
    const DAY = new Date("2026-08-01T00:00:00Z");
    const dayEnd = (d: Date) => new Date(d.getTime() + 24 * 3_600_000);

    beforeAll(async () => {
      // A dedicated org — NOT orgAId — so these fixtures never interact with
      // the AC-130..135 suite's rows above, in particular the open-ended
      // (endAt=null, ACTIVE-forever) walk-in booking AC-131 deliberately
      // leaves uncompleted: under the current pre-Phase-5 createBooking, a
      // walk-in's null end_at is correctly treated as "occupied indefinitely"
      // by this availability read model, which would otherwise falsely block
      // this org's far-future full-room day checks.
      const [org] = await testDb
        .insert(organizations)
        .values({ name: "Avail Org", slug: "avail-org-test" })
        .returning();
      availOrgId = org.id;
      const [user] = await testDb
        .insert(appUsers)
        .values({ orgId: availOrgId, email: "avail@x.test", name: "Avail User", role: "MEMBER" })
        .returning();
      availUserId = user.id;

      const [seat] = await testDb
        .insert(facilities)
        .values({ orgId: availOrgId, name: "Avail Seat 1", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, available: true })
        .returning();
      availSeatId = seat.id;
      const [seat2] = await testDb
        .insert(facilities)
        .values({ orgId: availOrgId, name: "Avail Seat 2", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, available: true })
        .returning();
      availSeat2Id = seat2.id;
      const [fullRoom] = await testDb
        .insert(facilities)
        .values({ orgId: availOrgId, name: "Avail Full Room", type: "FULL_ROOM", ratePerHourRupiah: 350000, capacity: 20, available: true })
        .returning();
      availFullRoomId = fullRoom.id;

      // Three non-overlapping active-like bookings on the same seat, one
      // per status (AC-804): PENDING [8-9], CONFIRMED [10-11], ACTIVE [12-13].
      const mk = (h0: number, h1: number, status: "PENDING" | "CONFIRMED" | "ACTIVE") => ({
        orgId: availOrgId,
        userId: availUserId,
        facilityType: "COWORKING_SEAT" as const,
        facilityId: availSeatId,
        facilityName: "Avail Seat 1",
        startAt: new Date(DAY.getTime() + h0 * 3_600_000),
        endAt: new Date(DAY.getTime() + h1 * 3_600_000),
        durationHours: h1 - h0,
        ratePerHourRupiah: 20000,
        amountRupiah: (h1 - h0) * 20000,
        status,
        paymentStatus: "WAITING_CASHIER" as const,
      });
      await testDb.insert(bookings).values(mk(8, 9, "PENDING"));
      await testDb.insert(bookings).values(mk(10, 11, "CONFIRMED"));
      await testDb.insert(bookings).values(mk(12, 13, "ACTIVE"));
    }, 30_000);

    it("AC-804: each of the three active-like statuses marks an overlapping window occupied", async () => {
      expect(await getFacilityAvailability(availOrgId, availSeatId, new Date(DAY.getTime() + 8 * 3_600_000), new Date(DAY.getTime() + 9 * 3_600_000))).toBe(false);
      expect(await getFacilityAvailability(availOrgId, availSeatId, new Date(DAY.getTime() + 10 * 3_600_000), new Date(DAY.getTime() + 11 * 3_600_000))).toBe(false);
      expect(await getFacilityAvailability(availOrgId, availSeatId, new Date(DAY.getTime() + 12 * 3_600_000), new Date(DAY.getTime() + 13 * 3_600_000))).toBe(false);
    });

    it("AC-804/AC-848: a genuinely free window on the same seat is available — half-open, touching boundaries are free", async () => {
      // [9,10) touches the PENDING [8,9) and CONFIRMED [10,11) boundaries
      // exactly — half-open semantics mean neither counts as an overlap.
      expect(await getFacilityAvailability(availOrgId, availSeatId, new Date(DAY.getTime() + 9 * 3_600_000), new Date(DAY.getTime() + 10 * 3_600_000))).toBe(true);
    });

    it("AC-804: a different seat with no bookings is available for the same window", async () => {
      expect(await getFacilityAvailability(availOrgId, availSeat2Id, new Date(DAY.getTime() + 8 * 3_600_000), new Date(DAY.getTime() + 9 * 3_600_000))).toBe(true);
    });

    it("AC-805: an individual booking on a calendar day makes the full-room facility unavailable for that whole day", async () => {
      expect(await getFullRoomAvailability(availOrgId, DAY, dayEnd(DAY))).toBe(false);

      // A day with no individual bookings stays available.
      const otherDay = new Date("2026-09-01T00:00:00Z");
      expect(await getFullRoomAvailability(availOrgId, otherDay, dayEnd(otherDay))).toBe(true);
    });

    it("AC-806: a full-room booking makes every individual seat unavailable for its reserved interval", async () => {
      const otherDay = new Date("2026-09-05T00:00:00Z");
      const frStart = new Date(otherDay.getTime() + 14 * 3_600_000);
      const frEnd = new Date(otherDay.getTime() + 16 * 3_600_000);

      // Full-room is bookable online at its catalog rate (OBS-812) before any
      // individual-seat booking exists on that day.
      expect(await getFullRoomAvailability(availOrgId, otherDay, dayEnd(otherDay))).toBe(true);
      await testDb.insert(bookings).values({
        orgId: availOrgId,
        userId: availUserId,
        facilityType: "FULL_ROOM",
        facilityId: availFullRoomId,
        facilityName: "Avail Full Room",
        startAt: frStart,
        endAt: frEnd,
        durationHours: 2,
        ratePerHourRupiah: 350000,
        amountRupiah: 700000,
        status: "CONFIRMED",
        paymentStatus: "PAID_ONLINE",
      });

      // Every individual seat is now unavailable for the full-room's interval...
      expect(await getFacilityAvailability(availOrgId, availSeatId, frStart, frEnd)).toBe(false);
      expect(await getFacilityAvailability(availOrgId, availSeat2Id, frStart, frEnd)).toBe(false);
      // ...but free again just outside that interval (interval-, not day-,
      // granularity — asymmetric with the seat→full-room day-level rule).
      expect(
        await getFacilityAvailability(availOrgId, availSeatId, new Date(frEnd.getTime()), new Date(frEnd.getTime() + 3_600_000)),
      ).toBe(true);
    });

    it("facilitiesAvailableInWindow excludes an occupied seat and includes a free one", async () => {
      const occupiedWindow = { start: new Date(DAY.getTime() + 12 * 3_600_000), end: new Date(DAY.getTime() + 13 * 3_600_000) };
      const list = await facilitiesAvailableInWindow(availOrgId, occupiedWindow.start, occupiedWindow.end);
      const ids = list.map((f) => f.id);
      expect(ids).not.toContain(availSeatId); // ACTIVE [12,13) booking occupies it
      expect(ids).toContain(availSeat2Id); // free
      expect(list.every((f) => f.orgId === availOrgId)).toBe(true);
    });
  });
});
