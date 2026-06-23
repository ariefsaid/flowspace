import { describe, it, expect } from "vitest";
import { WALKIN_MAX_HOURS, isWalkin, isScheduled } from "@/lib/booking/walkin";
import { BOOKING_FACILITY_TYPES } from "@/lib/db/enums";

describe("booking walk-in predicates", () => {
  it("classifies walk-in vs scheduled facility types", () => {
    expect(isWalkin("WALKIN_COWORKING")).toBe(true);
    expect(isWalkin("WALKIN_MEETING")).toBe(true);
    expect(isWalkin("COWORKING_SEAT")).toBe(false);
    expect(isScheduled("MEETING_ROOM")).toBe(true);
    expect(isScheduled("WALKIN_COWORKING")).toBe(false);
  });

  it("walk-in and scheduled partition the non-FULL_ROOM types (no overlap)", () => {
    for (const t of BOOKING_FACILITY_TYPES) {
      expect(isWalkin(t) && isScheduled(t)).toBe(false); // mutually exclusive
    }
  });

  it("the walk-in cap is 4 hours", () => {
    expect(WALKIN_MAX_HOURS).toBe(4);
  });
});
