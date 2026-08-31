/**
 * parseFacilityFieldError maps the facilities-admin repo's INVALID_* error
 * messages to the offending form field + an inline Indonesian message, so a
 * rejected save never fails silently (I-042, money-adjacent rate field).
 */
import { describe, it, expect } from "vitest";
import { parseFacilityFieldError } from "./facilityErrors";

describe("parseFacilityFieldError", () => {
  it("maps INVALID_RATE to the ratePerHourRupiah field with an inline message", () => {
    expect(parseFacilityFieldError(new Error("INVALID_RATE"))).toEqual({
      field: "ratePerHourRupiah",
      message: "Tarif per jam harus angka bulat ≥ 0.",
    });
  });

  it("maps INVALID_CAPACITY to the capacity field", () => {
    expect(parseFacilityFieldError(new Error("INVALID_CAPACITY"))).toEqual({
      field: "capacity",
      message: "Kapasitas harus angka bulat ≥ 0.",
    });
  });

  it("maps INVALID_MAX_HOURS_CAP to the maxHoursCap field", () => {
    expect(parseFacilityFieldError(new Error("INVALID_MAX_HOURS_CAP"))).toEqual({
      field: "maxHoursCap",
      message: "Maks jam billing harus angka bulat ≥ 0.",
    });
  });

  it("returns null for an unrecognized error (caller falls back to a generic message)", () => {
    expect(parseFacilityFieldError(new Error("FORBIDDEN"))).toBeNull();
  });

  it("returns null for a non-Error value", () => {
    expect(parseFacilityFieldError("boom")).toBeNull();
  });
});
