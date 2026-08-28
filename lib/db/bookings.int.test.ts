/**
 * Integration tests for lib/db/bookings.ts (I-040 booking-parity rewrite,
 * spec 0007). Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 *
 * Supersedes spec-0004's AC-130..135 (old ACTIVE-first-create lifecycle,
 * completeBooking) with the locked PENDING-first lifecycle
 * (scheduled PENDING→CONFIRMED→ACTIVE→COMPLETED/CANCELLED, walk-in
 * PENDING→ACTIVE→COMPLETED/CANCELLED) and checkoutBooking.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  appUsers,
  organizations,
  facilities,
  bookings,
  transactions,
  membershipTierConfig,
} from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

/** Dedicated Drizzle + postgres-js client for test DB — never uses the app's singleton. */
const testSql = postgres(TEST_URL, { prepare: false, max: 5 });
const testDb = drizzle(testSql, { schema });

const HOUR = 3_600_000;

// ---------------------------------------------------------------------------
// Import the repository functions under test
// ---------------------------------------------------------------------------
import {
  listFacilities,
  listBookingsByUser,
  getActiveBooking,
  createBooking,
  cancelBooking,
  getFacilityAvailability,
  getFullRoomAvailability,
  facilitiesAvailableInWindow,
  approveAndStartWalkIn,
  approvePayment,
  previewCheckout,
  checkoutBooking,
  extendBooking,
  runStatusSweep,
  listPendingBookings,
} from "@/lib/db/bookings";

// --- test data ---
let orgAId: string;
let orgBId: string;
let aUserId: string; // REGULAR member, org A
let premiumUserId: string; // PREMIUM member, org A (discount-wiring proof)
let bUserId: string; // org B
let seatAId: string;
let seatBId: string;
let meetingRoomId: string;
let fullRoomId: string;
let orgBFacilityId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "time_credit_lots","transactions","bookings","facilities","membership_tier_config","app_users","organizations" RESTART IDENTITY CASCADE`;

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
  const [premium] = await testDb
    .insert(appUsers)
    .values({ orgId: orgAId, email: "booking-premium@x.test", name: "Priya", role: "MEMBER", membershipTier: "PREMIUM" })
    .returning();
  const [userB] = await testDb
    .insert(appUsers)
    .values({ orgId: orgBId, email: "booking-b@x.test", name: "Bob", role: "MEMBER" })
    .returning();
  aUserId = userA.id;
  premiumUserId = premium.id;
  bUserId = userB.id;

  // AC-827 wiring proof: PREMIUM gets a real 10%/15% discount config row.
  await testDb.insert(membershipTierConfig).values({
    orgId: orgAId,
    tier: "PREMIUM",
    coworkingDiscountPct: 10,
    meetingDiscountPct: 15,
    cafeDiscountPct: 0,
    printDiscountPct: 0,
  });

  const [seatA] = await testDb
    .insert(facilities)
    .values({ orgId: orgAId, name: "Meja A", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, capacity: 1, seatLabel: "A", zone: "DESK", maxHoursCap: 4, available: true })
    .returning();
  seatAId = seatA.id;
  const [seatB] = await testDb
    .insert(facilities)
    .values({ orgId: orgAId, name: "Meja B", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, capacity: 1, seatLabel: "B", zone: "DESK", maxHoursCap: 4, available: true })
    .returning();
  seatBId = seatB.id;
  const [meetingRoom] = await testDb
    .insert(facilities)
    .values({ orgId: orgAId, name: "Meeting Room A", type: "MEETING_ROOM", ratePerHourRupiah: 120000, capacity: 8, zone: "MEETING", available: true })
    .returning();
  meetingRoomId = meetingRoom.id;
  const [fullRoom] = await testDb
    .insert(facilities)
    .values({ orgId: orgAId, name: "Full Room Event", type: "FULL_ROOM", ratePerHourRupiah: 350000, capacity: 20, zone: "FULL_ROOM", available: true })
    .returning();
  fullRoomId = fullRoom.id;

  const [orgBFac] = await testDb
    .insert(facilities)
    .values({ orgId: orgBId, name: "Meja A", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, available: true })
    .returning();
  orgBFacilityId = orgBFac.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "time_credit_lots","transactions","bookings","facilities","membership_tier_config","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

async function bookingRowCount(orgId: string): Promise<number> {
  const [{ count }] = await testSql`select count(*)::int as count from bookings where org_id = ${orgId}`;
  return count as number;
}

describe("lib/db/bookings", () => {
  // -------------------------------------------------------------------------
  // listFacilities
  // -------------------------------------------------------------------------
  describe("listFacilities", () => {
    it("returns only the caller org's bookable facilities, optionally filtered by type", async () => {
      const seats = await listFacilities(orgAId, "COWORKING_SEAT");
      expect(seats.every((f) => f.orgId === orgAId)).toBe(true);
      expect(seats.map((f) => f.name)).toContain("Meja A");
      expect(seats.every((f) => f.type === "COWORKING_SEAT")).toBe(true);

      const bList = await listFacilities(orgBId);
      expect(bList.every((f) => f.orgId === orgBId)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // createBooking — scheduled (money path, 3 payment methods)
  // -------------------------------------------------------------------------
  describe("createBooking — scheduled", () => {
    it("AC-808: online payment is CONFIRMED/PAID_ONLINE with server-priced amount", async () => {
      const startAt = new Date("2026-07-01T09:00:00Z");
      const endAt = new Date("2026-07-01T11:00:00Z"); // 2h

      const booking = await createBooking({
        orgId: orgAId,
        userId: aUserId,
        tier: "REGULAR",
        facilityType: "COWORKING_SEAT",
        facilityId: seatAId,
        facilityName: "Meja A",
        startAt,
        endAt,
        paymentMethod: "online",
      });

      expect(booking.orgId).toBe(orgAId);
      expect(booking.facilityId).toBe(seatAId);
      expect(booking.ratePerHourRupiah).toBe(20000); // from DB row
      expect(booking.durationHours).toBe(2);
      expect(booking.baseAmountRupiah).toBe(40000);
      expect(booking.discountRupiah).toBe(0); // REGULAR — no config row, fail-safe 0%
      expect(booking.amountRupiah).toBe(40000);
      expect(booking.status).toBe("CONFIRMED");
      expect(booking.paymentStatus).toBe("PAID_ONLINE");
      expect(booking.bookingMode).toBe("SCHEDULED");
      expect(booking.paymentMethod).toBe("online");

      const [txn] = await testDb.select().from(transactions).where(eq(transactions.bookingId, booking.id));
      expect(txn).toBeDefined();
      expect(txn.type).toBe("BOOKING");
      expect(txn.amountRupiah).toBe(40000);
      expect(txn.status).toBe("COMPLETED");
      expect(txn.paymentMethod).toBe("online");
    });

    it("AC-809: cashier payment is PENDING/WAITING_CASHIER with a pending ledger row", async () => {
      const booking = await createBooking({
        orgId: orgAId,
        userId: aUserId,
        tier: "REGULAR",
        facilityType: "COWORKING_SEAT",
        facilityId: seatAId,
        facilityName: "Meja A",
        startAt: new Date("2026-07-02T09:00:00Z"),
        endAt: new Date("2026-07-02T10:00:00Z"),
        paymentMethod: "cashier",
      });

      expect(booking.status).toBe("PENDING");
      expect(booking.paymentStatus).toBe("WAITING_CASHIER");
      expect(booking.paymentMethod).toBe("cashier");

      const [txn] = await testDb.select().from(transactions).where(eq(transactions.bookingId, booking.id));
      expect(txn.status).toBe("PENDING");
      expect(txn.paymentMethod).toBeNull(); // unsettled — settled at approvePayment
    });

    it("AC-827 wiring: a PREMIUM member's coworking booking applies the configured 10% discount", async () => {
      const booking = await createBooking({
        orgId: orgAId,
        userId: premiumUserId,
        tier: "PREMIUM",
        facilityType: "COWORKING_SEAT",
        facilityId: seatAId,
        facilityName: "Meja A",
        startAt: new Date("2026-07-03T09:00:00Z"),
        endAt: new Date("2026-07-03T11:00:00Z"), // 2h × 20000 = 40000
        paymentMethod: "online",
      });
      expect(booking.baseAmountRupiah).toBe(40000);
      expect(booking.discountRupiah).toBe(4000); // 10%
      expect(booking.amountRupiah).toBe(36000);
    });

    it("AC-827 wiring: a PREMIUM member's meeting-room booking applies the configured 15% discount", async () => {
      const booking = await createBooking({
        orgId: orgAId,
        userId: premiumUserId,
        tier: "PREMIUM",
        facilityType: "MEETING_ROOM",
        facilityId: meetingRoomId,
        facilityName: "Meeting Room A",
        startAt: new Date("2026-07-03T14:00:00Z"),
        endAt: new Date("2026-07-03T15:00:00Z"), // 1h × 120000
        paymentMethod: "online",
      });
      expect(booking.baseAmountRupiah).toBe(120000);
      expect(booking.discountRupiah).toBe(18000); // 15%
      expect(booking.amountRupiah).toBe(102000);
    });

    it("AC-806: FULL_ROOM is bookable online at its catalog rate on a day with no individual bookings", async () => {
      const startAt = new Date("2026-07-10T14:00:00Z");
      const endAt = new Date("2026-07-10T16:00:00Z");
      const booking = await createBooking({
        orgId: orgAId,
        userId: aUserId,
        tier: "REGULAR",
        facilityType: "FULL_ROOM",
        facilityId: fullRoomId,
        facilityName: "Full Room Event",
        startAt,
        endAt,
        paymentMethod: "online",
      });
      expect(booking.facilityType).toBe("FULL_ROOM");
      expect(booking.status).toBe("CONFIRMED");
      expect(booking.amountRupiah).toBe(700000); // 2h × 350000
      expect(booking.discountRupiah).toBe(0); // FULL_ROOM owns no discount dimension (AC-827 fail-safe)

      // Every individual seat is now unavailable for that interval (OBS-812/AC-806).
      expect(await getFacilityAvailability(orgAId, seatAId, startAt, endAt)).toBe(false);
      expect(await getFacilityAvailability(orgAId, seatBId, startAt, endAt)).toBe(false);
    });

    it("AC-833/834: rejects a facility name that does not exist in the org (no write)", async () => {
      const before = await bookingRowCount(orgAId);
      await expect(
        createBooking({
          orgId: orgAId,
          userId: aUserId,
          tier: "REGULAR",
          facilityType: "COWORKING_SEAT",
          facilityName: "Meja Does Not Exist",
          startAt: new Date("2026-07-11T09:00:00Z"),
          endAt: new Date("2026-07-11T10:00:00Z"),
          paymentMethod: "online",
        }),
      ).rejects.toThrow(/INVALID_FACILITY/);
      expect(await bookingRowCount(orgAId)).toBe(before);
    });

    it("AC-834: a cross-org facility id is rejected before any write", async () => {
      const before = await bookingRowCount(orgAId);
      await expect(
        createBooking({
          orgId: orgAId,
          userId: aUserId,
          tier: "REGULAR",
          facilityType: "COWORKING_SEAT",
          facilityId: orgBFacilityId, // belongs to org B
          facilityName: "Meja A",
          startAt: new Date("2026-07-12T09:00:00Z"),
          endAt: new Date("2026-07-12T10:00:00Z"),
          paymentMethod: "online",
        }),
      ).rejects.toThrow(/INVALID_FACILITY/);
      expect(await bookingRowCount(orgAId)).toBe(before);
    });

    it("[SEC] rejects a booking whose interval crosses a calendar-day boundary", async () => {
      // The org-day advisory lock + full-room day-window logic are keyed by a
      // SINGLE calendar day (calendarDayOf(startAt)) — a booking spanning two
      // calendar days would escape that day's lock/exclusivity window for its
      // tail end. Simplest safe fix: reject cross-midnight intervals outright.
      const before = await bookingRowCount(orgAId);
      await expect(
        createBooking({
          orgId: orgAId, userId: aUserId, tier: "REGULAR",
          facilityType: "COWORKING_SEAT", facilityId: seatAId, facilityName: "Meja A",
          startAt: new Date("2026-07-14T23:00:00Z"), endAt: new Date("2026-07-15T07:00:00Z"),
          paymentMethod: "online",
        }),
      ).rejects.toThrow(/CROSS_MIDNIGHT_NOT_ALLOWED/);
      expect(await bookingRowCount(orgAId)).toBe(before);
    });

    it("[SEC] facility-type confusion: a desk id submitted as FULL_ROOM is rejected (no underpay)", async () => {
      // Exploit: client sends facilityId=<a COWORKING_SEAT row> but
      // facilityType="FULL_ROOM" — if the server trusted the client's type,
      // the booking would be recorded as FULL_ROOM (occupying the whole day/
      // every seat) but priced at the desk's cheap per-seat rate.
      const before = await bookingRowCount(orgAId);
      await expect(
        createBooking({
          orgId: orgAId, userId: aUserId, tier: "REGULAR",
          facilityType: "FULL_ROOM", facilityId: seatAId, facilityName: "Meja A",
          startAt: new Date("2026-07-13T13:00:00Z"), endAt: new Date("2026-07-13T14:00:00Z"),
          paymentMethod: "online",
        }),
      ).rejects.toThrow(/FACILITY_TYPE_MISMATCH/);
      expect(await bookingRowCount(orgAId)).toBe(before);
    });

    it("AC-845: overlapping the same facility+window is rejected before any write (no lock race — single request)", async () => {
      const startAt = new Date("2026-07-13T09:00:00Z");
      const endAt = new Date("2026-07-13T10:00:00Z");
      await createBooking({
        orgId: orgAId, userId: aUserId, tier: "REGULAR",
        facilityType: "COWORKING_SEAT", facilityId: seatAId, facilityName: "Meja A",
        startAt, endAt, paymentMethod: "online",
      });
      const before = await bookingRowCount(orgAId);
      await expect(
        createBooking({
          orgId: orgAId, userId: aUserId, tier: "REGULAR",
          facilityType: "COWORKING_SEAT", facilityId: seatAId, facilityName: "Meja A",
          startAt, endAt, paymentMethod: "online",
        }),
      ).rejects.toThrow(/FACILITY_UNAVAILABLE/);
      expect(await bookingRowCount(orgAId)).toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // createBooking — walk-in
  // -------------------------------------------------------------------------
  describe("createBooking — walk-in", () => {
    it("AC-810: opens PENDING/WAITING_CASHIER with endAt null and a server-fixed rate", async () => {
      const booking = await createBooking({
        orgId: orgAId,
        userId: aUserId,
        tier: "REGULAR",
        facilityType: "WALKIN_COWORKING",
        facilityName: "Walk-in Coworking",
        paymentMethod: "cashier",
      });

      expect(booking.facilityType).toBe("WALKIN_COWORKING");
      expect(booking.facilityId).toBeNull();
      expect(booking.endAt).toBeNull();
      expect(booking.durationHours).toBeNull();
      expect(booking.amountRupiah).toBe(0);
      expect(booking.ratePerHourRupiah).toBe(15000); // server-fixed walk-in coworking rate
      expect(booking.status).toBe("PENDING");
      expect(booking.paymentStatus).toBe("WAITING_CASHIER");
      expect(booking.bookingMode).toBe("WALKIN");
      expect(booking.paymentMethod).toBe("cashier");

      const [txn] = await testDb.select().from(transactions).where(eq(transactions.bookingId, booking.id));
      expect(txn.type).toBe("BOOKING");
      expect(txn.amountRupiah).toBe(0);
      expect(txn.status).toBe("PENDING");
    });

    it("uses the server-fixed walk-in meeting rate for WALKIN_MEETING", async () => {
      const booking = await createBooking({
        orgId: orgAId, userId: aUserId, tier: "REGULAR",
        facilityType: "WALKIN_MEETING", facilityName: "Walk-in Meeting Room",
        paymentMethod: "cashier",
      });
      expect(booking.ratePerHourRupiah).toBe(120000);
    });
  });

  // -------------------------------------------------------------------------
  // AC-815/AC-816 — genuine concurrent-create race proofs
  // -------------------------------------------------------------------------
  describe("createBooking — concurrency (AC-815/AC-816)", () => {
    it("AC-815: two concurrent creates for the same facility+window — at most one succeeds", async () => {
      const startAt = new Date("2026-07-20T09:00:00Z");
      const endAt = new Date("2026-07-20T10:00:00Z");
      const attempt = () =>
        createBooking({
          orgId: orgAId, userId: aUserId, tier: "REGULAR",
          facilityType: "COWORKING_SEAT", facilityId: seatAId, facilityName: "Meja A",
          startAt, endAt, paymentMethod: "online",
        });

      const results = await Promise.allSettled([attempt(), attempt()]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/FACILITY_UNAVAILABLE/);

      const rows = await testDb
        .select()
        .from(bookings)
        .where(and(eq(bookings.orgId, orgAId), eq(bookings.facilityId, seatAId), eq(bookings.startAt, startAt)));
      expect(rows).toHaveLength(1); // no lost/duplicate write
    });

    it("AC-816: a full-room create and an overlapping individual-seat create on the same day — at most one exclusivity class succeeds", async () => {
      const day = "2026-07-21";
      const frStart = new Date(`${day}T10:00:00Z`);
      const frEnd = new Date(`${day}T12:00:00Z`);
      const seatStart = new Date(`${day}T10:30:00Z`); // inside the full-room's window
      const seatEnd = new Date(`${day}T11:30:00Z`);

      const fullRoomAttempt = () =>
        createBooking({
          orgId: orgAId, userId: aUserId, tier: "REGULAR",
          facilityType: "FULL_ROOM", facilityId: fullRoomId, facilityName: "Full Room Event",
          startAt: frStart, endAt: frEnd, paymentMethod: "online",
        });
      const seatAttempt = () =>
        createBooking({
          orgId: orgAId, userId: aUserId, tier: "REGULAR",
          facilityType: "COWORKING_SEAT", facilityId: seatBId, facilityName: "Meja B",
          startAt: seatStart, endAt: seatEnd, paymentMethod: "online",
        });

      const results = await Promise.allSettled([fullRoomAttempt(), seatAttempt()]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/FACILITY_UNAVAILABLE/);

      // Exactly one of the two facility ids has a row on that day, never both.
      const dayRows = await testDb.select().from(bookings).where(eq(bookings.orgId, orgAId));
      const thatDay = dayRows.filter((b) => b.startAt.toISOString().slice(0, 10) === day);
      expect(thatDay).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // approveAndStartWalkIn (AC-811/AC-847)
  // -------------------------------------------------------------------------
  describe("approveAndStartWalkIn", () => {
    it("AC-811/AC-847: PENDING walk-in → ACTIVE, start_at = approval time, end_at stays null (no +24h placeholder)", async () => {
      const created = await createBooking({
        orgId: orgAId, userId: aUserId, tier: "REGULAR",
        facilityType: "WALKIN_COWORKING", facilityName: "Walk-in Coworking",
        paymentMethod: "cashier",
      });
      const before = Date.now();
      const started = await approveAndStartWalkIn(orgAId, created.id);
      expect(started.status).toBe("ACTIVE");
      expect(started.startAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(started.endAt).toBeNull();
    });

    it("AC-845: approving an already-ACTIVE walk-in is rejected without a state change", async () => {
      const created = await createBooking({
        orgId: orgAId, userId: aUserId, tier: "REGULAR",
        facilityType: "WALKIN_COWORKING", facilityName: "Walk-in Coworking",
        paymentMethod: "cashier",
      });
      await approveAndStartWalkIn(orgAId, created.id);
      await expect(approveAndStartWalkIn(orgAId, created.id)).rejects.toThrow(/INVALID_TRANSITION/);
    });

    it("AC-835-adjacent: cross-org id resolves to NOT_FOUND, no write", async () => {
      const created = await createBooking({
        orgId: orgBId, userId: bUserId, tier: "REGULAR",
        facilityType: "WALKIN_COWORKING", facilityName: "Walk-in Coworking",
        paymentMethod: "cashier",
      });
      await expect(approveAndStartWalkIn(orgAId, created.id)).rejects.toThrow(/NOT_FOUND/);
      const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, created.id));
      expect(fresh.status).toBe("PENDING");
    });
  });

  // -------------------------------------------------------------------------
  // approvePayment — scheduled cashier settlement (PENDING→CONFIRMED)
  // -------------------------------------------------------------------------
  describe("approvePayment — scheduled settlement", () => {
    it("settles a cashier-paid scheduled booking to CONFIRMED/PAID_CASHIER and completes its ledger row", async () => {
      const created = await createBooking({
        orgId: orgAId, userId: aUserId, tier: "REGULAR",
        facilityType: "COWORKING_SEAT", facilityId: seatAId, facilityName: "Meja A",
        startAt: new Date("2026-07-25T09:00:00Z"), endAt: new Date("2026-07-25T10:00:00Z"),
        paymentMethod: "cashier",
      });
      const approved = await approvePayment(orgAId, created.id);
      expect(approved.status).toBe("CONFIRMED");
      expect(approved.paymentStatus).toBe("PAID_CASHIER");

      const [txn] = await testDb.select().from(transactions).where(eq(transactions.bookingId, created.id));
      expect(txn.status).toBe("COMPLETED");
    });

    it("rejects approving a walk-in (not a scheduled cashier booking)", async () => {
      const created = await createBooking({
        orgId: orgAId, userId: aUserId, tier: "REGULAR",
        facilityType: "WALKIN_COWORKING", facilityName: "Walk-in Coworking",
        paymentMethod: "cashier",
      });
      await expect(approvePayment(orgAId, created.id)).rejects.toThrow(/INVALID_TRANSITION/);
    });

    it("cross-org booking id throws NOT_FOUND, no write", async () => {
      const created = await createBooking({
        orgId: orgBId, userId: bUserId, tier: "REGULAR",
        facilityType: "COWORKING_SEAT", facilityId: orgBFacilityId, facilityName: "Meja A",
        startAt: new Date("2026-07-26T09:00:00Z"), endAt: new Date("2026-07-26T10:00:00Z"),
        paymentMethod: "cashier",
      });
      await expect(approvePayment(orgAId, created.id)).rejects.toThrow(/NOT_FOUND/);
      const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, created.id));
      expect(fresh.status).toBe("PENDING");
    });
  });

  // -------------------------------------------------------------------------
  // previewCheckout / checkoutBooking
  // -------------------------------------------------------------------------
  describe("previewCheckout + checkoutBooking", () => {
    it("AC-812/AC-844 (checkout wiring): a walk-in elapsed 62 minutes bills ceil(62/60)=2h; >4h caps at 4", async () => {
      const [openShort] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "WALKIN_COWORKING", facilityId: null,
        facilityName: "Walk-in Coworking", startAt: new Date(Date.now() - 62 * 60_000), endAt: null,
        durationHours: null, ratePerHourRupiah: 15000, amountRupiah: 0, baseAmountRupiah: 0, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "WAITING_CASHIER", bookingMode: "WALKIN", paymentMethod: "cashier",
      }).returning();
      const previewShort = await previewCheckout(orgAId, openShort.id);
      expect(previewShort.billedHours).toBe(2);
      expect(previewShort.amountRupiah).toBe(30000);

      const [openLong] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "WALKIN_COWORKING", facilityId: null,
        facilityName: "Walk-in Coworking", startAt: new Date(Date.now() - 5 * HOUR), endAt: null,
        durationHours: null, ratePerHourRupiah: 15000, amountRupiah: 0, baseAmountRupiah: 0, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "WAITING_CASHIER", bookingMode: "WALKIN", paymentMethod: "cashier",
      }).returning();
      const previewLong = await previewCheckout(orgAId, openLong.id);
      expect(previewLong.billedHours).toBe(4); // capped
      expect(previewLong.amountRupiah).toBe(60000);
    });

    it("AC-813: a scheduled ACTIVE booking bills its booked duration regardless of elapsed time", async () => {
      const [active] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: new Date(Date.now() - 10 * HOUR), endAt: new Date(Date.now() - 8 * HOUR),
        durationHours: 2, ratePerHourRupiah: 20000, amountRupiah: 40000, baseAmountRupiah: 40000, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();
      const preview = await previewCheckout(orgAId, active.id);
      expect(preview.billedHours).toBe(2);
      expect(preview.amountRupiah).toBe(40000);
    });

    it("AC-820: checkout with cash → COMPLETED/PAID_CASHIER, ledger settled with payment_method cash", async () => {
      const [active] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "WALKIN_COWORKING", facilityId: null,
        facilityName: "Walk-in Coworking", startAt: new Date(Date.now() - 90 * 60_000), endAt: null,
        durationHours: null, ratePerHourRupiah: 15000, amountRupiah: 0, baseAmountRupiah: 0, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "WAITING_CASHIER", bookingMode: "WALKIN", paymentMethod: "cashier",
      }).returning();
      await testDb.insert(transactions).values({
        orgId: orgAId, userId: aUserId, type: "BOOKING", description: "Booking Walk-in Coworking",
        amountRupiah: 0, status: "PENDING", bookingId: active.id,
      });

      const completed = await checkoutBooking(orgAId, active.id, "cash");
      expect(completed.status).toBe("COMPLETED");
      expect(completed.paymentStatus).toBe("PAID_CASHIER");
      expect(completed.durationHours).toBe(2); // ceil(90/60)
      expect(completed.amountRupiah).toBe(30000);
      expect(completed.endAt).not.toBeNull();

      const [txn] = await testDb.select().from(transactions).where(eq(transactions.bookingId, active.id));
      expect(txn.status).toBe("COMPLETED");
      expect(txn.amountRupiah).toBe(30000);
      expect(txn.paymentMethod).toBe("cash");
    });

    it("AC-821: checkout with qris → COMPLETED/PAID_CASHIER, ledger records qris", async () => {
      const [active] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "WALKIN_COWORKING", facilityId: null,
        facilityName: "Walk-in Coworking", startAt: new Date(Date.now() - 60 * 60_000), endAt: null,
        durationHours: null, ratePerHourRupiah: 15000, amountRupiah: 0, baseAmountRupiah: 0, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "WAITING_CASHIER", bookingMode: "WALKIN", paymentMethod: "cashier",
      }).returning();
      await testDb.insert(transactions).values({
        orgId: orgAId, userId: aUserId, type: "BOOKING", description: "Booking Walk-in Coworking",
        amountRupiah: 0, status: "PENDING", bookingId: active.id,
      });
      const completed = await checkoutBooking(orgAId, active.id, "qris");
      expect(completed.status).toBe("COMPLETED");
      expect(completed.paymentStatus).toBe("PAID_CASHIER");
      const [txn] = await testDb.select().from(transactions).where(eq(transactions.bookingId, active.id));
      expect(txn.paymentMethod).toBe("qris");
    });

    it("AC-822/AC-828: checkout with time_credits FIFO-debits lots and settles COMPLETED/PAID_ONLINE atomically; amount counts toward revenue", async () => {
      // Give the member a sufficient credit lot (10h, far expiry).
      await testDb.insert(schema.timeCreditLots).values({
        orgId: orgAId, userId: aUserId, totalHours: 10, remainingHours: 10,
        expiresAt: new Date(Date.now() + 90 * 24 * HOUR),
      });

      const [active] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: new Date(Date.now() - 3 * HOUR), endAt: new Date(),
        durationHours: 3, ratePerHourRupiah: 20000, amountRupiah: 60000, baseAmountRupiah: 60000, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();
      await testDb.insert(transactions).values({
        orgId: orgAId, userId: aUserId, type: "BOOKING", description: "Booking Meja A",
        amountRupiah: 60000, status: "COMPLETED", bookingId: active.id,
      });

      const completed = await checkoutBooking(orgAId, active.id, "time_credits");
      expect(completed.status).toBe("COMPLETED");
      expect(completed.paymentStatus).toBe("PAID_ONLINE");

      const [lot] = await testDb.select().from(schema.timeCreditLots).where(eq(schema.timeCreditLots.userId, aUserId));
      expect(lot.remainingHours).toBe(7); // 10 - 3

      const [txn] = await testDb.select().from(transactions).where(eq(transactions.bookingId, active.id));
      expect(txn.paymentMethod).toBe("time_credits");
      expect(txn.status).toBe("COMPLETED");
    });

    it("AC-823: insufficient credits — checkout rolls back atomically (no lot/booking/ledger change)", async () => {
      const [poorUser] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: "poor@x.test", name: "Poor", role: "MEMBER" })
        .returning();
      await testDb.insert(schema.timeCreditLots).values({
        orgId: orgAId, userId: poorUser.id, totalHours: 1, remainingHours: 1,
        expiresAt: new Date(Date.now() + 90 * 24 * HOUR),
      });
      const [active] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: poorUser.id, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: new Date(Date.now() - 3 * HOUR), endAt: new Date(),
        durationHours: 3, ratePerHourRupiah: 20000, amountRupiah: 60000, baseAmountRupiah: 60000, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();
      await testDb.insert(transactions).values({
        orgId: orgAId, userId: poorUser.id, type: "BOOKING", description: "Booking Meja A",
        amountRupiah: 60000, status: "COMPLETED", bookingId: active.id,
      });

      await expect(checkoutBooking(orgAId, active.id, "time_credits")).rejects.toThrow(/INSUFFICIENT_CREDITS/);

      const [freshBooking] = await testDb.select().from(bookings).where(eq(bookings.id, active.id));
      expect(freshBooking.status).toBe("ACTIVE"); // unchanged
      const [freshLot] = await testDb.select().from(schema.timeCreditLots).where(eq(schema.timeCreditLots.userId, poorUser.id));
      expect(freshLot.remainingHours).toBe(1); // unchanged
      const [freshTxn] = await testDb.select().from(transactions).where(eq(transactions.bookingId, active.id));
      expect(freshTxn.status).toBe("COMPLETED"); // still the create-time ledger row, unchanged
    });

    it("AC-836/AC-845: checkout on a non-ACTIVE booking is rejected, no state/ledger mutation (CAS)", async () => {
      const [pending] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: new Date(), endAt: new Date(Date.now() + HOUR),
        durationHours: 1, ratePerHourRupiah: 20000, amountRupiah: 20000, baseAmountRupiah: 20000, discountRupiah: 0,
        status: "PENDING", paymentStatus: "WAITING_CASHIER", bookingMode: "SCHEDULED", paymentMethod: "cashier",
      }).returning();
      await expect(checkoutBooking(orgAId, pending.id, "cash")).rejects.toThrow(/INVALID_TRANSITION/);
      const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, pending.id));
      expect(fresh.status).toBe("PENDING");
    });

    it("AC-836: two concurrent checkouts on the same ACTIVE booking — the loser gets a transition error, no double-settle", async () => {
      const [active] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "WALKIN_COWORKING", facilityId: null,
        facilityName: "Walk-in Coworking", startAt: new Date(Date.now() - HOUR), endAt: null,
        durationHours: null, ratePerHourRupiah: 15000, amountRupiah: 0, baseAmountRupiah: 0, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "WAITING_CASHIER", bookingMode: "WALKIN", paymentMethod: "cashier",
      }).returning();
      await testDb.insert(transactions).values({
        orgId: orgAId, userId: aUserId, type: "BOOKING", description: "Booking Walk-in Coworking",
        amountRupiah: 0, status: "PENDING", bookingId: active.id,
      });

      const results = await Promise.allSettled([
        checkoutBooking(orgAId, active.id, "cash"),
        checkoutBooking(orgAId, active.id, "qris"),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/INVALID_TRANSITION/);
    });
  });

  // -------------------------------------------------------------------------
  // extendBooking (AC-817/AC-818/AC-819)
  // -------------------------------------------------------------------------
  describe("extendBooking", () => {
    it("AC-819: a non-ACTIVE booking is rejected with no write", async () => {
      const [pending] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: new Date("2026-08-10T09:00:00Z"), endAt: new Date("2026-08-10T10:00:00Z"),
        durationHours: 1, ratePerHourRupiah: 20000, amountRupiah: 20000, baseAmountRupiah: 20000, discountRupiah: 0,
        status: "PENDING", paymentStatus: "WAITING_CASHIER", bookingMode: "SCHEDULED", paymentMethod: "cashier",
      }).returning();
      await expect(extendBooking(orgAId, pending.id, 1)).rejects.toThrow(/INVALID_TRANSITION/);
      const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, pending.id));
      expect(fresh.endAt?.toISOString()).toBe(new Date("2026-08-10T10:00:00Z").toISOString());
    });

    it("AC-818: extends within the 4h cap and a clear 60-min gap — end/duration update atomically with a new PENDING extension ledger row", async () => {
      const start = new Date("2026-08-11T09:00:00Z");
      const [active] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: start, endAt: new Date(start.getTime() + 2 * HOUR),
        durationHours: 2, ratePerHourRupiah: 20000, amountRupiah: 40000, baseAmountRupiah: 40000, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();

      const extended = await extendBooking(orgAId, active.id, 1); // 2h -> 3h, within 4h cap
      expect(extended.durationHours).toBe(3);
      expect(extended.endAt?.toISOString()).toBe(new Date(start.getTime() + 3 * HOUR).toISOString());
      expect(extended.amountRupiah).toBe(60000); // 40000 + 1h×20000

      const txns = await testDb.select().from(transactions).where(eq(transactions.bookingId, active.id));
      const extensionTxn = txns.find((t) => t.status === "PENDING");
      expect(extensionTxn).toBeDefined();
      expect(extensionTxn!.amountRupiah).toBe(20000);
    });

    it("AC-818: extension total is capped at 4 hours", async () => {
      const start = new Date("2026-08-12T09:00:00Z");
      const [active] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: start, endAt: new Date(start.getTime() + 3 * HOUR),
        durationHours: 3, ratePerHourRupiah: 20000, amountRupiah: 60000, baseAmountRupiah: 60000, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();
      const extended = await extendBooking(orgAId, active.id, 3); // 3h+3h=6h -> capped at 4h
      expect(extended.durationHours).toBe(4);
      expect(extended.amountRupiah).toBe(80000); // 60000 + 1h×20000
    });

    it("AC-818: extension already at the 4h cap is rejected (no further extension possible)", async () => {
      const start = new Date("2026-08-13T09:00:00Z");
      const [active] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: start, endAt: new Date(start.getTime() + 4 * HOUR),
        durationHours: 4, ratePerHourRupiah: 20000, amountRupiah: 80000, baseAmountRupiah: 80000, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();
      await expect(extendBooking(orgAId, active.id, 1)).rejects.toThrow(/EXTENSION_LIMIT_REACHED/);
    });

    it("AC-817: a later booking starting less than 60 minutes after the proposed end blocks the extension, unchanged", async () => {
      const start = new Date("2026-08-14T09:00:00Z");
      const [active] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: start, endAt: new Date(start.getTime() + 2 * HOUR), // ends 11:00
        durationHours: 2, ratePerHourRupiah: 20000, amountRupiah: 40000, baseAmountRupiah: 40000, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();
      // Proposed end for +1h extension = 12:00. A booking starting at 12:30 is
      // within 60 minutes of that proposed end → blocks.
      await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: new Date(start.getTime() + 3.5 * HOUR), endAt: new Date(start.getTime() + 4.5 * HOUR),
        durationHours: 1, ratePerHourRupiah: 20000, amountRupiah: 20000, baseAmountRupiah: 20000, discountRupiah: 0,
        status: "CONFIRMED", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      });

      await expect(extendBooking(orgAId, active.id, 1)).rejects.toThrow(/EXTENSION_BLOCKED_BY_NEXT_BOOKING/);
      const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, active.id));
      expect(fresh.durationHours).toBe(2); // unchanged
      const txns = await testDb.select().from(transactions).where(eq(transactions.bookingId, active.id));
      expect(txns).toHaveLength(0); // no extension ledger row written
    });

    it("a later booking starting ≥60 minutes after the proposed end does NOT block the extension", async () => {
      const start = new Date("2026-08-15T09:00:00Z");
      const [active] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: start, endAt: new Date(start.getTime() + 2 * HOUR), // ends 11:00
        durationHours: 2, ratePerHourRupiah: 20000, amountRupiah: 40000, baseAmountRupiah: 40000, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();
      // Proposed end for +1h = 12:00. A booking starting exactly at 13:00 (60min gap, half-open) is free.
      await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: new Date(start.getTime() + 4 * HOUR), endAt: new Date(start.getTime() + 5 * HOUR),
        durationHours: 1, ratePerHourRupiah: 20000, amountRupiah: 20000, baseAmountRupiah: 20000, discountRupiah: 0,
        status: "CONFIRMED", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      });

      const extended = await extendBooking(orgAId, active.id, 1);
      expect(extended.durationHours).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // runStatusSweep (AC-838/AC-839)
  // -------------------------------------------------------------------------
  describe("runStatusSweep", () => {
    it("AC-838: activates paid CONFIRMED rows at start, cancels expired unactivated CONFIRMED rows, reports overtime", async () => {
      const now = new Date("2026-08-20T12:00:00Z");

      const [toActivate] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatAId,
        facilityName: "Meja A", startAt: new Date(now.getTime() - 5 * 60_000), endAt: new Date(now.getTime() + HOUR),
        durationHours: 1, ratePerHourRupiah: 20000, amountRupiah: 20000, baseAmountRupiah: 20000, discountRupiah: 0,
        status: "CONFIRMED", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();

      const [toCancel] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "COWORKING_SEAT", facilityId: seatBId,
        facilityName: "Meja B", startAt: new Date(now.getTime() - 3 * HOUR), endAt: new Date(now.getTime() - HOUR),
        durationHours: 2, ratePerHourRupiah: 20000, amountRupiah: 40000, baseAmountRupiah: 40000, discountRupiah: 0,
        status: "CONFIRMED", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();

      const [overdue] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "MEETING_ROOM", facilityId: meetingRoomId,
        facilityName: "Meeting Room A", startAt: new Date(now.getTime() - 3 * HOUR), endAt: new Date(now.getTime() - HOUR),
        durationHours: 2, ratePerHourRupiah: 120000, amountRupiah: 240000, baseAmountRupiah: 240000, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();

      const result = await runStatusSweep(orgAId, now);
      expect(result.activated).toBeGreaterThanOrEqual(1);
      expect(result.cancelled).toBeGreaterThanOrEqual(1);
      expect(result.overtime).toContain(overdue.id);

      const [freshActivated] = await testDb.select().from(bookings).where(eq(bookings.id, toActivate.id));
      expect(freshActivated.status).toBe("ACTIVE");
      const [freshCancelled] = await testDb.select().from(bookings).where(eq(bookings.id, toCancel.id));
      expect(freshCancelled.status).toBe("CANCELLED");
    });

    it("AC-839: an overdue ACTIVE booking remains ACTIVE across repeated sweeps (never auto-completed)", async () => {
      const now = new Date("2026-08-21T12:00:00Z");
      const [overdue] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "MEETING_ROOM", facilityId: meetingRoomId,
        facilityName: "Meeting Room A", startAt: new Date(now.getTime() - 3 * HOUR), endAt: new Date(now.getTime() - HOUR),
        durationHours: 2, ratePerHourRupiah: 120000, amountRupiah: 240000, baseAmountRupiah: 240000, discountRupiah: 0,
        status: "ACTIVE", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();

      await runStatusSweep(orgAId, now);
      const result2 = await runStatusSweep(orgAId, new Date(now.getTime() + HOUR));
      expect(result2.overtime).toContain(overdue.id);
      const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, overdue.id));
      expect(fresh.status).toBe("ACTIVE");
    });

    it("is org-scoped: sweeping org A never touches org B's rows", async () => {
      const now = new Date("2026-08-22T12:00:00Z");
      const [orgBRow] = await testDb.insert(bookings).values({
        orgId: orgBId, userId: bUserId, facilityType: "COWORKING_SEAT", facilityId: orgBFacilityId,
        facilityName: "Meja A", startAt: new Date(now.getTime() - 5 * 60_000), endAt: new Date(now.getTime() + HOUR),
        durationHours: 1, ratePerHourRupiah: 20000, amountRupiah: 20000, baseAmountRupiah: 20000, discountRupiah: 0,
        status: "CONFIRMED", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      }).returning();
      await runStatusSweep(orgAId, now);
      const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, orgBRow.id));
      expect(fresh.status).toBe("CONFIRMED"); // untouched by org A's sweep
    });
  });

  // -------------------------------------------------------------------------
  // listPendingBookings — WAITING_CASHIER (PENDING only, not CANCELLED)
  // -------------------------------------------------------------------------
  describe("listPendingBookings", () => {
    it("lists only PENDING/WAITING_CASHIER rows, org-scoped, excludes cancelled", async () => {
      const created = await createBooking({
        orgId: orgAId, userId: aUserId, tier: "REGULAR",
        facilityType: "WALKIN_COWORKING", facilityName: "Walk-in Coworking",
        paymentMethod: "cashier",
      });
      const pending = await listPendingBookings(orgAId);
      expect(pending.map((b) => b.id)).toContain(created.id);
      expect(pending.every((b) => b.orgId === orgAId && b.status === "PENDING" && b.paymentStatus === "WAITING_CASHIER")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // reads + cancel — org scoping
  // -------------------------------------------------------------------------
  describe("reads + cancel — org scoping", () => {
    it("listBookingsByUser returns only the caller org+user's bookings", async () => {
      const list = await listBookingsByUser(orgAId, aUserId);
      expect(list.every((b) => b.orgId === orgAId && b.userId === aUserId)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    });

    it("getActiveBooking returns null when the user has no ACTIVE booking, and cross-org id resolves null", async () => {
      const none = await getActiveBooking(orgAId, "00000000-0000-0000-0000-000000000000");
      expect(none).toBeNull();
    });

    it("cancelBooking is org-scoped (cross-org id → NOT_FOUND, no write)", async () => {
      const [b] = await testDb.insert(bookings).values({
        orgId: orgBId, userId: bUserId, facilityType: "WALKIN_COWORKING", facilityId: null,
        facilityName: "Walk-in Coworking", startAt: new Date(), endAt: null, durationHours: null,
        ratePerHourRupiah: 15000, amountRupiah: 0, baseAmountRupiah: 0, discountRupiah: 0,
        status: "PENDING", paymentStatus: "WAITING_CASHIER", bookingMode: "WALKIN", paymentMethod: "cashier",
      }).returning();
      await expect(cancelBooking(orgAId, b.id)).rejects.toThrow(/NOT_FOUND/);
      const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, b.id));
      expect(fresh.status).toBe("PENDING");
    });

    it("cancelBooking flips a PENDING booking in the caller org to CANCELLED", async () => {
      const [b] = await testDb.insert(bookings).values({
        orgId: orgAId, userId: aUserId, facilityType: "WALKIN_COWORKING", facilityId: null,
        facilityName: "Walk-in Coworking", startAt: new Date(), endAt: null, durationHours: null,
        ratePerHourRupiah: 15000, amountRupiah: 0, baseAmountRupiah: 0, discountRupiah: 0,
        status: "PENDING", paymentStatus: "WAITING_CASHIER", bookingMode: "WALKIN", paymentMethod: "cashier",
      }).returning();
      const cancelled = await cancelBooking(orgAId, b.id);
      expect(cancelled.status).toBe("CANCELLED");
    });
  });

  // -------------------------------------------------------------------------
  // Availability read model (I-040, Phase 4) — AC-804/805/806 (already green,
  // re-asserted here unchanged after the tx-aware refactor).
  // -------------------------------------------------------------------------
  describe("availability read model — AC-804/805/806", () => {
    let availOrgId: string;
    let availUserId: string;
    let availSeatId: string;
    let availSeat2Id: string;
    let availFullRoomId: string;
    const DAY = new Date("2026-09-01T00:00:00Z");
    const dayEnd = (d: Date) => new Date(d.getTime() + 24 * HOUR);

    beforeAll(async () => {
      const [org] = await testDb.insert(organizations).values({ name: "Avail Org", slug: "avail-org-test" }).returning();
      availOrgId = org.id;
      const [user] = await testDb.insert(appUsers).values({ orgId: availOrgId, email: "avail@x.test", name: "Avail User", role: "MEMBER" }).returning();
      availUserId = user.id;

      const [seat] = await testDb.insert(facilities).values({ orgId: availOrgId, name: "Avail Seat 1", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, available: true }).returning();
      availSeatId = seat.id;
      const [seat2] = await testDb.insert(facilities).values({ orgId: availOrgId, name: "Avail Seat 2", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, available: true }).returning();
      availSeat2Id = seat2.id;
      const [fullRoom] = await testDb.insert(facilities).values({ orgId: availOrgId, name: "Avail Full Room", type: "FULL_ROOM", ratePerHourRupiah: 350000, capacity: 20, available: true }).returning();
      availFullRoomId = fullRoom.id;

      const mk = (h0: number, h1: number, status: "PENDING" | "CONFIRMED" | "ACTIVE") => ({
        orgId: availOrgId, userId: availUserId, facilityType: "COWORKING_SEAT" as const, facilityId: availSeatId,
        facilityName: "Avail Seat 1", startAt: new Date(DAY.getTime() + h0 * HOUR), endAt: new Date(DAY.getTime() + h1 * HOUR),
        durationHours: h1 - h0, ratePerHourRupiah: 20000, amountRupiah: (h1 - h0) * 20000,
        baseAmountRupiah: (h1 - h0) * 20000, discountRupiah: 0,
        status, paymentStatus: "WAITING_CASHIER" as const, bookingMode: "SCHEDULED" as const,
      });
      await testDb.insert(bookings).values(mk(8, 9, "PENDING"));
      await testDb.insert(bookings).values(mk(10, 11, "CONFIRMED"));
      await testDb.insert(bookings).values(mk(12, 13, "ACTIVE"));
    }, 30_000);

    it("each of the three active-like statuses marks an overlapping window occupied", async () => {
      expect(await getFacilityAvailability(availOrgId, availSeatId, new Date(DAY.getTime() + 8 * HOUR), new Date(DAY.getTime() + 9 * HOUR))).toBe(false);
      expect(await getFacilityAvailability(availOrgId, availSeatId, new Date(DAY.getTime() + 10 * HOUR), new Date(DAY.getTime() + 11 * HOUR))).toBe(false);
      expect(await getFacilityAvailability(availOrgId, availSeatId, new Date(DAY.getTime() + 12 * HOUR), new Date(DAY.getTime() + 13 * HOUR))).toBe(false);
    });

    it("AC-848: half-open semantics — a genuinely free touching window on the same seat is available", async () => {
      expect(await getFacilityAvailability(availOrgId, availSeatId, new Date(DAY.getTime() + 9 * HOUR), new Date(DAY.getTime() + 10 * HOUR))).toBe(true);
    });

    it("a different seat with no bookings is available for the same window", async () => {
      expect(await getFacilityAvailability(availOrgId, availSeat2Id, new Date(DAY.getTime() + 8 * HOUR), new Date(DAY.getTime() + 9 * HOUR))).toBe(true);
    });

    it("AC-805: an individual booking on a calendar day makes the full-room facility unavailable for that whole day", async () => {
      expect(await getFullRoomAvailability(availOrgId, DAY, dayEnd(DAY))).toBe(false);
      const otherDay = new Date("2026-10-01T00:00:00Z");
      expect(await getFullRoomAvailability(availOrgId, otherDay, dayEnd(otherDay))).toBe(true);
    });

    it("AC-806: a full-room booking makes every individual seat unavailable for its reserved interval only", async () => {
      const otherDay = new Date("2026-10-05T00:00:00Z");
      const frStart = new Date(otherDay.getTime() + 14 * HOUR);
      const frEnd = new Date(otherDay.getTime() + 16 * HOUR);
      expect(await getFullRoomAvailability(availOrgId, otherDay, dayEnd(otherDay))).toBe(true);
      await testDb.insert(bookings).values({
        orgId: availOrgId, userId: availUserId, facilityType: "FULL_ROOM", facilityId: availFullRoomId,
        facilityName: "Avail Full Room", startAt: frStart, endAt: frEnd, durationHours: 2,
        ratePerHourRupiah: 350000, amountRupiah: 700000, baseAmountRupiah: 700000, discountRupiah: 0,
        status: "CONFIRMED", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
      });
      expect(await getFacilityAvailability(availOrgId, availSeatId, frStart, frEnd)).toBe(false);
      expect(await getFacilityAvailability(availOrgId, availSeat2Id, frStart, frEnd)).toBe(false);
      expect(await getFacilityAvailability(availOrgId, availSeatId, new Date(frEnd.getTime()), new Date(frEnd.getTime() + HOUR))).toBe(true);
    });

    it("facilitiesAvailableInWindow excludes an occupied seat and includes a free one", async () => {
      const occupiedWindow = { start: new Date(DAY.getTime() + 12 * HOUR), end: new Date(DAY.getTime() + 13 * HOUR) };
      const list = await facilitiesAvailableInWindow(availOrgId, occupiedWindow.start, occupiedWindow.end);
      const ids = list.map((f) => f.id);
      expect(ids).not.toContain(availSeatId);
      expect(ids).toContain(availSeat2Id);
      expect(list.every((f) => f.orgId === availOrgId)).toBe(true);
    });
  });
});
