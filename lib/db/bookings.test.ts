/**
 * Unit test for lib/db/bookings.ts's listPendingBookings hard clamp (I-040
 * fix round 2, finding E). Mocks the Drizzle client — no real DB needed to
 * prove the clamp value passed to `.limit(...)`, matching the pattern in
 * lib/db/tier-config.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { select, limit } = vi.hoisted(() => {
  const limit = vi.fn().mockResolvedValue([]);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, limit };
});

vi.mock("@/lib/db/drizzle", () => ({
  db: { select },
}));

import { listPendingBookings } from "@/lib/db/bookings";

describe("listPendingBookings — hard clamp (I-040 fix round 2, finding E)", () => {
  beforeEach(() => limit.mockClear());

  it("[SEC] clamps an oversized caller-supplied limit to the 500 hard cap", async () => {
    await listPendingBookings("org-1", 999_999);
    expect(limit).toHaveBeenCalledWith(500);
  });

  it("honors a caller limit that is already within the 500 cap", async () => {
    await listPendingBookings("org-1", 50);
    expect(limit).toHaveBeenCalledWith(50);
  });

  it("clamps the default limit's ceiling too, if ever raised above 500 by mistake", async () => {
    await listPendingBookings("org-1");
    expect(limit).toHaveBeenCalledWith(200); // current default — within the cap
  });

  it("[SEC] a negative limit never bypasses the cap — falls back to the safe default", async () => {
    // Math.min(-1, 500) === -1, and Drizzle OMITS the SQL LIMIT clause
    // entirely for a negative/non-finite value — an unbounded query, exactly
    // the DoS the hard cap exists to prevent.
    await listPendingBookings("org-1", -1);
    const called = limit.mock.calls[0][0];
    expect(Number.isFinite(called)).toBe(true);
    expect(called).toBeGreaterThan(0);
    expect(called).toBeLessThanOrEqual(500);
  });

  it("[SEC] NaN never bypasses the cap — falls back to the safe default", async () => {
    await listPendingBookings("org-1", NaN);
    const called = limit.mock.calls[0][0];
    expect(Number.isFinite(called)).toBe(true);
    expect(called).toBeGreaterThan(0);
    expect(called).toBeLessThanOrEqual(500);
  });

  it("[SEC] a zero limit never bypasses the cap — falls back to the safe default", async () => {
    await listPendingBookings("org-1", 0);
    const called = limit.mock.calls[0][0];
    expect(Number.isFinite(called)).toBe(true);
    expect(called).toBeGreaterThan(0);
    expect(called).toBeLessThanOrEqual(500);
  });

  it("[SEC] a huge limit (1000) is bounded at the 500 cap", async () => {
    await listPendingBookings("org-1", 1000);
    expect(limit).toHaveBeenCalledWith(500);
  });
});
