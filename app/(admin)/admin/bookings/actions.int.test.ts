/**
 * Integration tests for app/(admin)/admin/bookings/actions.ts (I-047 additions).
 *
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL. Only
 * `requireSession` is mocked — every repository write is real, so the
 * ADMIN gate, org-scoping, and server-side pricing are proven against the
 * actual stack.
 *
 * AC-047-B4: cancelBookingAction — ADMIN-gated wiring of cancelBooking.
 * AC-047-B5: activateBookingAction — ADMIN-gated wiring of activateConfirmedBooking.
 * AC-047-B6: createBookingAsAdminAction [MONEY] — admin creates a booking for
 *   a target member, tenancy-checked, server-priced.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { appUsers, organizations, facilities, bookings } from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireSession: () => requireSession() }));

import { cancelBookingAction, activateBookingAction, createBookingAsAdminAction } from "./actions";
import { createBooking } from "@/lib/db/bookings";

let orgAId: string;
let orgBId: string;
let memberAId: string;
let memberBId: string;
let seatAId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","bookings","facilities","app_users","organizations" RESTART IDENTITY CASCADE`;
  const [orgA] = await testDb.insert(organizations).values({ name: "BookingActions Org A", slug: "booking-actions-org-a-test" }).returning();
  const [orgB] = await testDb.insert(organizations).values({ name: "BookingActions Org B", slug: "booking-actions-org-b-test" }).returning();
  orgAId = orgA.id;
  orgBId = orgB.id;
  const [memberA] = await testDb.insert(appUsers).values({ orgId: orgAId, email: "ba-member-a@x.test", name: "Alice", role: "MEMBER" }).returning();
  const [memberB] = await testDb.insert(appUsers).values({ orgId: orgBId, email: "ba-member-b@x.test", name: "Bob", role: "MEMBER" }).returning();
  memberAId = memberA.id;
  memberBId = memberB.id;
  const [seatA] = await testDb.insert(facilities).values({ orgId: orgAId, name: "Meja Aksi", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, available: true }).returning();
  seatAId = seatA.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","bookings","facilities","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

beforeEach(() => {
  requireSession.mockReset();
});

describe("cancelBookingAction", () => {
  it("[AC-047-B4] an ADMIN session cancels a same-org PENDING booking", async () => {
    const created = await createBooking({
      orgId: orgAId, userId: memberAId, tier: "REGULAR",
      facilityType: "COWORKING_SEAT", facilityId: seatAId, facilityName: "Meja Aksi",
      startAt: new Date("2026-09-01T09:00:00Z"), endAt: new Date("2026-09-01T10:00:00Z"),
      paymentMethod: "cashier",
    });
    requireSession.mockResolvedValue({ id: "admin1", orgId: orgAId, role: "ADMIN" });
    const cancelled = await cancelBookingAction(created.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("[SEC] a non-ADMIN session is denied before any write", async () => {
    const created = await createBooking({
      orgId: orgAId, userId: memberAId, tier: "REGULAR",
      facilityType: "COWORKING_SEAT", facilityId: seatAId, facilityName: "Meja Aksi",
      startAt: new Date("2026-09-02T09:00:00Z"), endAt: new Date("2026-09-02T10:00:00Z"),
      paymentMethod: "cashier",
    });
    requireSession.mockResolvedValue({ id: "member1", orgId: orgAId, role: "MEMBER" });
    await expect(cancelBookingAction(created.id)).rejects.toThrow("FORBIDDEN");
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, created.id));
    expect(fresh.status).toBe("PENDING");
  });
});

describe("activateBookingAction", () => {
  it("[AC-047-B5] an ADMIN session activates a same-org CONFIRMED booking", async () => {
    const created = await createBooking({
      orgId: orgAId, userId: memberAId, tier: "REGULAR",
      facilityType: "COWORKING_SEAT", facilityId: seatAId, facilityName: "Meja Aksi",
      startAt: new Date("2026-09-03T09:00:00Z"), endAt: new Date("2026-09-03T10:00:00Z"),
      paymentMethod: "online", // → CONFIRMED
    });
    requireSession.mockResolvedValue({ id: "admin1", orgId: orgAId, role: "ADMIN" });
    const activated = await activateBookingAction(created.id);
    expect(activated.status).toBe("ACTIVE");
  });

  it("[SEC] a non-ADMIN session is denied before any write", async () => {
    const created = await createBooking({
      orgId: orgAId, userId: memberAId, tier: "REGULAR",
      facilityType: "COWORKING_SEAT", facilityId: seatAId, facilityName: "Meja Aksi",
      startAt: new Date("2026-09-04T09:00:00Z"), endAt: new Date("2026-09-04T10:00:00Z"),
      paymentMethod: "online",
    });
    requireSession.mockResolvedValue({ id: "member1", orgId: orgAId, role: "MEMBER" });
    await expect(activateBookingAction(created.id)).rejects.toThrow("FORBIDDEN");
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, created.id));
    expect(fresh.status).toBe("CONFIRMED");
  });
});

describe("createBookingAsAdminAction", () => {
  it("[AC-047-B6][MONEY] an ADMIN session creates a server-priced booking for a same-org member", async () => {
    requireSession.mockResolvedValue({ id: "admin1", orgId: orgAId, role: "ADMIN" });
    const booking = await createBookingAsAdminAction({
      userId: memberAId,
      facilityType: "COWORKING_SEAT",
      facilityId: seatAId,
      facilityName: "Meja Aksi",
      startAt: new Date("2026-09-05T09:00:00Z"),
      endAt: new Date("2026-09-05T11:00:00Z"), // 2h
      paymentMethod: "cashier",
    });
    expect(booking.userId).toBe(memberAId);
    expect(booking.orgId).toBe(orgAId);
    expect(booking.amountRupiah).toBe(40000); // 2h * 20000 rate, server-derived
  });

  it("[SEC] a non-ADMIN session is denied before any write", async () => {
    requireSession.mockResolvedValue({ id: "member1", orgId: orgAId, role: "MEMBER" });
    await expect(
      createBookingAsAdminAction({
        userId: memberAId,
        facilityType: "COWORKING_SEAT",
        facilityId: seatAId,
        facilityName: "Meja Aksi",
        startAt: new Date("2026-09-06T09:00:00Z"),
        endAt: new Date("2026-09-06T10:00:00Z"),
        paymentMethod: "cashier",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("[SEC] a target userId from a DIFFERENT org is rejected — USER_NOT_FOUND, no write", async () => {
    requireSession.mockResolvedValue({ id: "admin1", orgId: orgAId, role: "ADMIN" });
    await expect(
      createBookingAsAdminAction({
        userId: memberBId, // belongs to orgB, session org is orgA
        facilityType: "COWORKING_SEAT",
        facilityId: seatAId,
        facilityName: "Meja Aksi",
        startAt: new Date("2026-09-07T09:00:00Z"),
        endAt: new Date("2026-09-07T10:00:00Z"),
        paymentMethod: "cashier",
      }),
    ).rejects.toThrow("USER_NOT_FOUND");
  });
});
