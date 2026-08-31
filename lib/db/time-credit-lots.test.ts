/**
 * Unit tests for the pure FIFO lot-selection helper (I-040, OBS-825).
 * lib/db/time-credit-lots.ts's spendTimeCredits (integration-tested,
 * lib/db/time-credit-lots.int.test.ts) delegates the "which lots, how much"
 * decision to this pure function so it can be proven without a DB.
 */
import { describe, expect, it } from "vitest";
import { selectLotsToSpend, assertValidCreditDelta, type SpendableLot } from "@/lib/db/time-credit-lots";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function lot(id: string, remainingHours: number, expiresInDays: number): SpendableLot {
  return {
    id,
    remainingHours,
    expiresAt: new Date(NOW.getTime() + expiresInDays * 86_400_000),
  };
}

describe("selectLotsToSpend", () => {
  it("picks the soonest-expiring lot first (OBS-825)", () => {
    const lots = [lot("far", 5, 60), lot("soon", 5, 10)];
    const picks = selectLotsToSpend(lots, 3, NOW);
    expect(picks).toEqual([{ id: "soon", hoursToDebit: 3 }]);
  });

  it("spans multiple lots, soonest-first, when one lot is insufficient alone", () => {
    const lots = [lot("far", 10, 60), lot("soon", 2, 10)];
    const picks = selectLotsToSpend(lots, 5, NOW);
    expect(picks).toEqual([
      { id: "soon", hoursToDebit: 2 },
      { id: "far", hoursToDebit: 3 },
    ]);
  });

  it("skips an expired lot even if it expires 'soonest' in raw date order", () => {
    const lots = [lot("expired", 10, -1), lot("valid", 10, 30)];
    const picks = selectLotsToSpend(lots, 4, NOW);
    expect(picks).toEqual([{ id: "valid", hoursToDebit: 4 }]);
  });

  it("skips an empty (remainingHours = 0) lot", () => {
    const lots = [lot("empty", 0, 5), lot("valid", 10, 30)];
    const picks = selectLotsToSpend(lots, 4, NOW);
    expect(picks).toEqual([{ id: "valid", hoursToDebit: 4 }]);
  });

  it("throws INSUFFICIENT_CREDITS when the usable total is short — no partial picks returned", () => {
    const lots = [lot("a", 2, 30), lot("expired", 100, -1)];
    expect(() => selectLotsToSpend(lots, 5, NOW)).toThrow(/INSUFFICIENT_CREDITS/);
  });

  it("rejects a non-positive spend request", () => {
    expect(() => selectLotsToSpend([lot("a", 10, 30)], 0, NOW)).toThrow(/INVALID_HOURS/);
    expect(() => selectLotsToSpend([lot("a", 10, 30)], -1, NOW)).toThrow(/INVALID_HOURS/);
  });
});

// ---------------------------------------------------------------------------
// assertValidCreditDelta [SEC][I-047 fix-3] — the shared int4/business-cap
// guard for every manual credit/print-balance delta (users.ts's adjustCredits
// AND this module's own adjustTimeCreditsForAdmin, defense-in-depth).
// ---------------------------------------------------------------------------
describe("assertValidCreditDelta", () => {
  it("accepts an in-range positive/negative integer, and zero", () => {
    expect(() => assertValidCreditDelta(5)).not.toThrow();
    expect(() => assertValidCreditDelta(-5)).not.toThrow();
    expect(() => assertValidCreditDelta(0)).not.toThrow();
  });

  it("[SEC] rejects a non-integer delta", () => {
    expect(() => assertValidCreditDelta(1.5)).toThrow(/INVALID_DELTA/);
  });

  it("[SEC] rejects a non-finite delta (NaN, Infinity) — never silently treated as zero/no-op", () => {
    expect(() => assertValidCreditDelta(NaN)).toThrow(/INVALID_DELTA/);
    expect(() => assertValidCreditDelta(Infinity)).toThrow(/INVALID_DELTA/);
    expect(() => assertValidCreditDelta(-Infinity)).toThrow(/INVALID_DELTA/);
  });

  it("[SEC][MONEY] rejects a delta beyond the business cap, well before it could ever approach the Postgres int4 bound (2,147,483,647)", () => {
    expect(() => assertValidCreditDelta(1_000_001)).toThrow(/INVALID_DELTA/);
    expect(() => assertValidCreditDelta(-1_000_001)).toThrow(/INVALID_DELTA/);
    expect(() => assertValidCreditDelta(2_147_483_647)).toThrow(/INVALID_DELTA/);
  });

  it("accepts exactly the cap boundary", () => {
    expect(() => assertValidCreditDelta(1_000_000)).not.toThrow();
    expect(() => assertValidCreditDelta(-1_000_000)).not.toThrow();
  });
});
