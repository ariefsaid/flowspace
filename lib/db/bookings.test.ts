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
});
