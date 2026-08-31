/**
 * AC-302: toView maps a persisted row to the billing view (gross/net derivation).
 * (Summary aggregates — AC-301 — are SQL-owned: see lib/db/print.int.test.ts.)
 * I-047: parseFilterParams/toDbFilters/toQueryString drive the print-reports
 *   filter bar's server-side re-query via URL searchParams.
 */
import { describe, it, expect } from "vitest";
import { toView, parseFilterParams, toDbFilters, toQueryString, EMPTY_FILTER_STATE } from "./derive";
import type { PrintJob } from "@/lib/db/schema";

/** Minimal PrintJob factory — only the fields the derivation reads. */
function job(p: Partial<PrintJob>): PrintJob {
  return {
    id: "pj",
    orgId: "o1",
    userId: "u1",
    fileName: "f.pdf",
    pages: 1,
    copies: 1,
    colorMode: "BW",
    paperSize: "A4",
    duplex: false,
    pricePerPageRupiah: 500,
    discountRupiah: 0,
    totalRupiah: 500,
    storagePath: null,
    status: "PENDING",
    createdAt: new Date("2026-06-15T10:00:00Z"),
    updatedAt: new Date("2026-06-15T10:00:00Z"),
    ...p,
  } as PrintJob;
}

describe("toView", () => {
  it("AC-614: maps effective sheets, copies, printer, and lifecycle metadata", () => {
    const v = toView(job({
      pages: 12, copies: 2, totalPages: 6, pageRange: "1-3,8-10", printerId: "p1",
      processedBy: "agent-1", processedAt: new Date("2026-06-15T09:00:00Z"),
      completedAt: new Date("2026-06-15T09:05:00Z"), status: "FAILED",
    }), "Budi", { name: "CUPS-1", displayName: "Printer Lobi" });
    expect(v).toMatchObject({ pages: 6, copies: 2, pageRange: "1-3,8-10", printer: "Printer Lobi", processedBy: "agent-1", status: "FAILED" });
    expect(v.processedAt).toBe("2026-06-15T09:00:00.000Z");
    expect(v.completedAt).toBe("2026-06-15T09:05:00.000Z");
  });

  it("AC-625: preserves persisted gross, discount, and net money values", () => {
    const v = toView(job({ totalPages: 3, copies: 2, discountRupiah: 500, totalRupiah: 4500 }), "Budi");
    expect(v).toMatchObject({ grossRupiah: 5000, discountRupiah: 500, netRupiah: 4500 });
  });

  it("AC-302: derives gross = total + discount, net = total, ISO datetime", () => {
    const v = toView(
      job({
        id: "pj-1",
        fileName: "kontrak.pdf",
        pages: 10,
        colorMode: "COLOR",
        discountRupiah: 3000,
        totalRupiah: 12000,
        status: "COMPLETED",
        createdAt: new Date("2026-06-15T08:01:00Z"),
      }),
      "Budi",
    );
    expect(v).toMatchObject({
      id: "pj-1",
      user: "Budi",
      fileName: "kontrak.pdf",
      colorMode: "COLOR",
      discountRupiah: 3000,
      grossRupiah: 15000, // 12000 + 3000
      netRupiah: 12000,
      status: "COMPLETED",
    });
    expect(v.datetime).toBe("2026-06-15T08:01:00.000Z");
  });
});

describe("parseFilterParams (I-047 filter bar)", () => {
  it("defaults to the empty filter state when no params are present", () => {
    expect(parseFilterParams({})).toEqual(EMPTY_FILTER_STATE);
  });

  it("trims search and passes through a valid status", () => {
    expect(parseFilterParams({ search: "  budi  ", status: "READY" })).toEqual({
      search: "budi",
      status: "READY",
      dateFrom: "",
      dateTo: "",
    });
  });

  it("falls back to ALL for an invalid/unknown status (never trusts the raw param)", () => {
    expect(parseFilterParams({ status: "BOGUS" }).status).toBe("ALL");
  });

  it("takes the first value when Next hands an array param", () => {
    expect(parseFilterParams({ search: ["a", "b"], status: ["COMPLETED"] })).toMatchObject({
      search: "a",
      status: "COMPLETED",
    });
  });

  it("passes through dateFrom/dateTo strings", () => {
    expect(parseFilterParams({ dateFrom: "2026-06-01", dateTo: "2026-06-30" })).toEqual({
      search: "",
      status: "ALL",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
    });
  });
});

describe("toDbFilters (I-047 filter bar)", () => {
  it("returns an empty filters object for the empty state", () => {
    expect(toDbFilters(EMPTY_FILTER_STATE)).toEqual({});
  });

  it("omits status when ALL, includes it otherwise", () => {
    expect(toDbFilters({ ...EMPTY_FILTER_STATE, status: "FAILED" })).toEqual({ status: "FAILED" });
  });

  it("converts dateFrom to an inclusive start-of-day, dateTo to an inclusive end-of-day", () => {
    const filters = toDbFilters({ ...EMPTY_FILTER_STATE, dateFrom: "2026-06-01", dateTo: "2026-06-30" });
    expect(filters.dateFrom).toEqual(new Date("2026-06-01T00:00:00"));
    expect(filters.dateTo).toEqual(new Date("2026-06-30T23:59:59.999"));
  });

  it("includes a trimmed search term", () => {
    expect(toDbFilters({ ...EMPTY_FILTER_STATE, search: "kontrak" })).toEqual({ search: "kontrak" });
  });
});

describe("toQueryString (I-047 filter bar)", () => {
  it("returns an empty string for the empty state (no trailing '?')", () => {
    expect(toQueryString(EMPTY_FILTER_STATE)).toBe("");
  });

  it("serializes only the set fields", () => {
    expect(toQueryString({ search: "budi", status: "READY", dateFrom: "2026-06-01", dateTo: "" })).toBe(
      "?search=budi&status=READY&dateFrom=2026-06-01",
    );
  });

  it("omits status=ALL from the query string", () => {
    expect(toQueryString({ ...EMPTY_FILTER_STATE, status: "ALL", search: "x" })).toBe("?search=x");
  });
});
