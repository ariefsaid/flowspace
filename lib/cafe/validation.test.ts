/**
 * Unit tests for lib/cafe/validation.ts (I-044, FR-724, NFR-044-03).
 */
import { describe, it, expect } from "vitest";
import { normalizeOrderNotes, assertOrderLineQuantity } from "@/lib/cafe/validation";

describe("normalizeOrderNotes", () => {
  it("AC-712: undefined normalizes to null", () => {
    expect(normalizeOrderNotes(undefined)).toBeNull();
  });

  it("AC-712: blank/whitespace-only notes normalize to null", () => {
    expect(normalizeOrderNotes("   ")).toBeNull();
    expect(normalizeOrderNotes("")).toBeNull();
  });

  it("AC-712: trims surrounding whitespace on a non-blank value", () => {
    expect(normalizeOrderNotes("  less sugar please  ")).toBe("less sugar please");
  });

  it("AC-712: exactly 500 Unicode code points is accepted", () => {
    const notes = "a".repeat(500);
    expect(normalizeOrderNotes(notes)).toBe(notes);
  });

  it("AC-712: 501 Unicode code points is rejected", () => {
    const notes = "a".repeat(501);
    expect(() => normalizeOrderNotes(notes)).toThrow(/INVALID_NOTES/);
  });

  it("AC-712: counts Unicode code points, not UTF-16 code units (emoji surrogate pairs)", () => {
    // 500 astral-plane emoji code points, each 2 UTF-16 units (1000 units total).
    const notes = "😀".repeat(500);
    expect(Array.from(notes).length).toBe(500);
    expect(normalizeOrderNotes(notes)).toBe(notes);
  });
});

describe("assertOrderLineQuantity", () => {
  it("AC-725: qty 99 succeeds (no throw)", () => {
    expect(() => assertOrderLineQuantity(99)).not.toThrow();
  });

  it("AC-725: qty 100 is rejected", () => {
    expect(() => assertOrderLineQuantity(100)).toThrow(/INVALID_QUANTITY/);
  });

  it("AC-725: qty 0, negative, and fractional are rejected", () => {
    for (const bad of [0, -1, 1.5]) {
      expect(() => assertOrderLineQuantity(bad)).toThrow(/INVALID_QUANTITY/);
    }
  });

  it("AC-725: a non-number qty is rejected", () => {
    expect(() => assertOrderLineQuantity("5" as unknown as number)).toThrow(/INVALID_QUANTITY/);
  });
});
