/**
 * Unit tests for lib/db/print.ts's pure decision helpers — the layer that
 * owns the actual DoS-bound math (ADR-0010: push a decision AC to the lowest
 * sufficient layer). `listPrintJobsForAdmin` itself (the DB wiring) is
 * integration-tested (lib/db/print.int.test.ts).
 */
import { describe, expect, it } from "vitest";
import { normalizePrintReportLimit } from "@/lib/db/print";

describe("normalizePrintReportLimit [SEC][I-047 minor]", () => {
  it("passes through a valid positive integer under the hard ceiling", () => {
    expect(normalizePrintReportLimit(50)).toBe(50);
  });

  it("[SEC] clamps a value above the hard ceiling (500) — never honored as-is", () => {
    expect(normalizePrintReportLimit(10_000)).toBe(500);
  });

  it("[SEC] falls back to the safe default for a negative value — never omits the LIMIT clause outright", () => {
    expect(normalizePrintReportLimit(-1)).toBe(500);
  });

  it("[SEC] falls back to the safe default for zero", () => {
    expect(normalizePrintReportLimit(0)).toBe(500);
  });

  it("[SEC] falls back to the safe default for NaN/Infinity — Drizzle omits LIMIT entirely for a non-finite value", () => {
    expect(normalizePrintReportLimit(NaN)).toBe(500);
    expect(normalizePrintReportLimit(Infinity)).toBe(500);
    expect(normalizePrintReportLimit(-Infinity)).toBe(500);
  });

  it("floors a fractional value", () => {
    expect(normalizePrintReportLimit(10.9)).toBe(10);
  });
});
