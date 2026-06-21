/**
 * Unit tests for lib/admin/authz — the SoD role gate.
 *
 * canAdminBookings is a pure predicate. The *AsActor seams throw FORBIDDEN for
 * a non-admin role BEFORE any DB write (the gate is evaluated first), so the
 * rejection path is unit-testable without a database.
 */
import { describe, it, expect } from "vitest";
import {
  canAdminBookings,
  approvePaymentAsActor,
  completeBookingAsActor,
} from "@/lib/admin/authz";

describe("lib/admin/authz — role gate", () => {
  it("canAdminBookings is true only for ADMIN", () => {
    expect(canAdminBookings("ADMIN")).toBe(true);
    expect(canAdminBookings("MEMBER")).toBe(false);
    expect(canAdminBookings("BARISTA")).toBe(false);
  });

  it("approvePaymentAsActor throws FORBIDDEN for a MEMBER (before any DB write)", async () => {
    await expect(
      approvePaymentAsActor(
        { id: "u1", role: "MEMBER", orgId: "org1" },
        "bk_1",
      ),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("completeBookingAsActor throws FORBIDDEN for a BARISTA (before any DB write)", async () => {
    await expect(
      completeBookingAsActor(
        { id: "u2", role: "BARISTA", orgId: "org1" },
        "bk_2",
      ),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
