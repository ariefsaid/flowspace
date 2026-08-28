/**
 * Unit tests for lib/print/page-range.ts (I-043, spec 0009).
 *
 * : `all` on a 12-page document parses to 12 pages; ×2 copies = 24 sheets.
 * : `1-5,8,10-12` parses to 9 pages; ×2 copies = 18 sheets.
 * : reversed/overlapping/duplicate/zero/out-of-bounds ranges reject.
 * : non-integer or non-positive pages/copies reject before any DB work.
 */
import { describe, expect, it } from "vitest";
import { parsePageRange, computeEffectiveSheets } from "./page-range";

describe("parsePageRange", () => {
  it("AC-603: 'all' on a 12-page document returns pageCount 12 (and 2 copies = 24 sheets)", () => {
    const r = parsePageRange("all", 12);
    expect(r.pageCount).toBe(12);
    expect(computeEffectiveSheets(r.pageCount, 2)).toBe(24);
  });

  it("AC-604: '1-5,8,10-12' returns pageCount 9 (and 2 copies = 18 sheets)", () => {
    const r = parsePageRange("1-5,8,10-12", 12);
    expect(r.pageCount).toBe(9); // 5 + 1 + 3
    expect(computeEffectiveSheets(r.pageCount, 2)).toBe(18);
  });

  it(": single pages and mixed tokens parse; normalized output is canonical", () => {
    expect(parsePageRange("3", 12)).toEqual({ pageCount: 1, normalized: "3" });
    expect(parsePageRange("1-5,8,10-12", 12).normalized).toBe("1-5,8,10-12");
    // Unsorted input normalizes to ascending collapsed runs.
    expect(parsePageRange("8,1-3,10,4,11-12", 12).normalized).toBe("1-4,8,10-12");
    // Consecutive singles collapse into one range.
    expect(parsePageRange("1,2,3", 12).normalized).toBe("1-3");
    // Whitespace around tokens is tolerated then trimmed in the normalized form.
    expect(parsePageRange(" 1-5 , 8 , 10-12 ", 12).normalized).toBe("1-5,8,10-12");
  });

  it("AC-605: reversed ranges are rejected", () => {
    for (const bad of ["5-1", "10-2,3", "12-10"]) {
      expect(() => parsePageRange(bad, 12)).toThrow(/INVALID_PAGE_RANGE/);
    }
  });

  it(": overlapping and duplicate pages are rejected", () => {
    for (const bad of ["1-5,3", "1-5,4-6", "3,3", "1-5,1-5", "1,1-2"]) {
      expect(() => parsePageRange(bad, 12)).toThrow(/INVALID_PAGE_RANGE/);
    }
  });

  it(": zero and malformed tokens are rejected", () => {
    for (const bad of ["0", "0-3", "1-0", "a", "1-a", "-5", "1-", "1;2", "1..3", "", "  ", ",", "1,,2", "1.5", "+3", "0x1", "1 - 5"]) {
      expect(() => parsePageRange(bad, 12)).toThrow(/INVALID_PAGE_RANGE/);
    }
  });

  it(": out-of-bounds ranges are rejected against the document page count", () => {
    expect(() => parsePageRange("1-13", 12)).toThrow(/INVALID_PAGE_RANGE/);
    expect(() => parsePageRange("12,14", 12)).toThrow(/INVALID_PAGE_RANGE/);
    expect(parsePageRange("all", 12).pageCount).toBe(12);
    // Boundary: the last page is in-bounds (one selected page).
    expect(parsePageRange("12", 12).pageCount).toBe(1);
  });

  it("AC-606: non-integer or non-positive document page counts reject before any work", () => {
    for (const bad of [0, -1, 2.5, NaN, Infinity]) {
      expect(() => parsePageRange("all", bad)).toThrow(/INVALID_DOCUMENT_PAGES/);
      expect(() => parsePageRange("1-3", bad)).toThrow(/INVALID_DOCUMENT_PAGES/);
    }
  });

  it(": non-integer or non-positive copies reject before any work", () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => computeEffectiveSheets(3, bad)).toThrow(/INVALID_COPIES/);
    }
    // Int4 sheet bound is enforced (total_pages is an int4 column).
    expect(() => computeEffectiveSheets(2_000_000_000, 2)).toThrow(/TOO_MANY_SHEETS/);
    expect(computeEffectiveSheets(1_000_000_000, 2)).toBe(2_000_000_000);
  });
});
