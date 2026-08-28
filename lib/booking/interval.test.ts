/**
 * Unit tests for the pure half-open interval-overlap helper (I-040, spec
 * 0007). Consumed by both the availability read model and the creation
 * conflict check so AC-848 ("availability semantics match creation conflict
 * semantics") holds by construction — this is the ONE place the boundary
 * rule is asserted.
 */
import { describe, expect, it } from "vitest";
import { intervalsOverlap } from "@/lib/booking/interval";

const d = (iso: string) => new Date(iso);

describe("intervalsOverlap — AC-848 half-open [start, end) semantics", () => {
  it("overlapping intervals overlap", () => {
    expect(
      intervalsOverlap(d("2026-01-01T08:00:00Z"), d("2026-01-01T10:00:00Z"), d("2026-01-01T09:00:00Z"), d("2026-01-01T11:00:00Z")),
    ).toBe(true);
  });

  it("identical intervals overlap", () => {
    const s = d("2026-01-01T08:00:00Z");
    const e = d("2026-01-01T10:00:00Z");
    expect(intervalsOverlap(s, e, s, e)).toBe(true);
  });

  it("one interval fully containing another overlaps", () => {
    expect(
      intervalsOverlap(d("2026-01-01T08:00:00Z"), d("2026-01-01T12:00:00Z"), d("2026-01-01T09:00:00Z"), d("2026-01-01T10:00:00Z")),
    ).toBe(true);
  });

  it("touching boundary (a ends exactly when b starts) does NOT overlap — half-open", () => {
    expect(
      intervalsOverlap(d("2026-01-01T08:00:00Z"), d("2026-01-01T10:00:00Z"), d("2026-01-01T10:00:00Z"), d("2026-01-01T12:00:00Z")),
    ).toBe(false);
  });

  it("touching boundary the other direction (b ends exactly when a starts) does NOT overlap", () => {
    expect(
      intervalsOverlap(d("2026-01-01T10:00:00Z"), d("2026-01-01T12:00:00Z"), d("2026-01-01T08:00:00Z"), d("2026-01-01T10:00:00Z")),
    ).toBe(false);
  });

  it("completely separate, non-adjacent intervals do not overlap", () => {
    expect(
      intervalsOverlap(d("2026-01-01T08:00:00Z"), d("2026-01-01T09:00:00Z"), d("2026-01-01T11:00:00Z"), d("2026-01-01T12:00:00Z")),
    ).toBe(false);
  });
});
