// @vitest-environment node
/**
 * [SEC] createBookingAction must not rely on the client checkbox alone —
 * the server independently validates `acceptedPolicy === true` BEFORE any
 * booking write, and records acceptance on the created booking row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn().mockResolvedValue({
    id: "user-1",
    orgId: "org-1",
    role: "MEMBER",
    email: "m@flowspace.test",
  }),
}));
vi.mock("@/lib/db/users", () => ({
  findById: vi.fn().mockResolvedValue({ membershipTier: "REGULAR" }),
}));
const createBookingMock = vi.fn();
vi.mock("@/lib/db/bookings", () => ({
  createBooking: (...args: unknown[]) => createBookingMock(...args),
  facilitiesAvailableInWindow: vi.fn(),
  getFullRoomAvailability: vi.fn(),
  listFacilities: vi.fn(),
}));

import { createBookingAction } from "./actions";
import type { FacilitySeat } from "@/components/member/booking/FloorPlan";

const place: FacilitySeat = {
  id: "fac-1",
  label: "Meja A",
  seatLabel: "A",
  zone: "DESK",
  status: "available",
  ratePerHourRupiah: 20000,
};

beforeEach(() => {
  createBookingMock.mockReset().mockResolvedValue({
    id: "bk-1",
    status: "CONFIRMED",
    paymentStatus: "PAID_ONLINE",
    amountRupiah: 40000,
    baseAmountRupiah: 40000,
    discountRupiah: 0,
    facilityName: "Meja A",
  });
});

describe("createBookingAction — server-side policy acceptance [SEC]", () => {
  it("[SEC] rejects a scheduled booking request with acceptedPolicy: false — no write attempted", async () => {
    await expect(
      createBookingAction({
        bookingType: "scheduled-coworking",
        time: { date: "2026-09-01", startTime: "09:00", durationHours: 2 },
        place,
        paymentMethod: "online",
        acceptedPolicy: false,
      }),
    ).rejects.toThrow(/POLICY_NOT_ACCEPTED/);
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("[SEC] rejects a walk-in booking request with acceptedPolicy: false — no write attempted", async () => {
    await expect(
      createBookingAction({
        bookingType: "walkin-coworking",
        time: { date: "", startTime: "", durationHours: 0 },
        place,
        paymentMethod: "cashier",
        acceptedPolicy: false,
      }),
    ).rejects.toThrow(/POLICY_NOT_ACCEPTED/);
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("accepts and RECORDS acceptance when acceptedPolicy: true (scheduled)", async () => {
    await createBookingAction({
      bookingType: "scheduled-coworking",
      time: { date: "2026-09-01", startTime: "09:00", durationHours: 2 },
      place,
      paymentMethod: "online",
      acceptedPolicy: true,
    });
    expect(createBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedPolicy: true }),
    );
  });
});
