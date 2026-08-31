/**
 * Facility admin actions (I-042). Each is ADMIN-only — a non-ADMIN caller is
 * denied (FORBIDDEN) with no repo write — and forwards the session orgId +
 * the repo's rejection (e.g. INVALID_RATE) without swallowing it (each
 * `it()` title names its own owning acceptance).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSession = vi.fn();
const createFacility = vi.fn();
const updateFacility = vi.fn();
const archiveFacility = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireSession: () => requireSession(),
}));
vi.mock("@/lib/db/facilities-admin", () => ({
  createFacility: (...a: unknown[]) => createFacility(...a),
  updateFacility: (...a: unknown[]) => updateFacility(...a),
  archiveFacility: (...a: unknown[]) => archiveFacility(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createFacilityAction,
  updateFacilityAction,
  archiveFacilityAction,
} from "./actions";

const input = {
  name: "Meeting Room A",
  type: "MEETING_ROOM" as const,
  ratePerHourRupiah: 50000,
  capacity: 6,
  seatLabel: null,
  zone: null,
  maxHoursCap: null,
  available: true,
};

describe("createFacilityAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    createFacility.mockReset();
  });

  it("denies a non-ADMIN caller (FORBIDDEN), no write", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
    await expect(createFacilityAction(input)).rejects.toThrow("FORBIDDEN");
    expect(createFacility).not.toHaveBeenCalled();
  });

  it("an ADMIN caller creates the facility with the session orgId", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    createFacility.mockResolvedValue({ id: "f1", ...input });
    await createFacilityAction(input);
    expect(createFacility).toHaveBeenCalledWith("o1", input);
  });

  it("forwards the repo's INVALID_RATE rejection without swallowing it", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    createFacility.mockRejectedValue(new Error("INVALID_RATE"));
    await expect(createFacilityAction(input)).rejects.toThrow("INVALID_RATE");
  });
});

describe("updateFacilityAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    updateFacility.mockReset();
  });

  it("denies a non-ADMIN caller (FORBIDDEN), no write", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "BARISTA", orgId: "o1" });
    await expect(updateFacilityAction("f1", input)).rejects.toThrow("FORBIDDEN");
    expect(updateFacility).not.toHaveBeenCalled();
  });

  it("an ADMIN caller updates the facility with the session orgId", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await updateFacilityAction("f1", input);
    expect(updateFacility).toHaveBeenCalledWith("o1", "f1", input);
  });

  it("forwards the repo's INVALID_CAPACITY rejection without swallowing it", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    updateFacility.mockRejectedValue(new Error("INVALID_CAPACITY"));
    await expect(updateFacilityAction("f1", input)).rejects.toThrow("INVALID_CAPACITY");
  });
});

describe("archiveFacilityAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    archiveFacility.mockReset();
  });

  it("denies a non-ADMIN caller (FORBIDDEN), no write", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
    await expect(archiveFacilityAction("f1")).rejects.toThrow("FORBIDDEN");
    expect(archiveFacility).not.toHaveBeenCalled();
  });

  it("an ADMIN caller soft-archives the facility with the session orgId", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await archiveFacilityAction("f1");
    expect(archiveFacility).toHaveBeenCalledWith("o1", "f1");
  });
});
