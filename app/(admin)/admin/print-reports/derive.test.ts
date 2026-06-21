/**
 * AC-301: buildSummary aggregates (jobs, pages, distinct users by userId,
 *         revenue = Σ net over COMPLETED) over a fixed job set.
 * AC-302: toView maps a persisted row to the billing view (gross/net derivation).
 */
import { describe, it, expect } from "vitest";
import { toView, buildSummary } from "./derive";
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

describe("buildSummary", () => {
  it("AC-301: totals, distinct users (by userId), and COMPLETED revenue", () => {
    const rows = [
      job({ userId: "u1", pages: 10, totalRupiah: 12000, status: "COMPLETED" }),
      job({ userId: "u1", pages: 4, totalRupiah: 2000, status: "PENDING" }),
      job({ userId: "u2", pages: 6, totalRupiah: 3000, status: "COMPLETED" }),
    ];
    expect(buildSummary(rows)).toEqual({
      totalJobs: 3,
      totalPages: 20,
      uniqueUsers: 2, // u1 (x2) + u2 — counted by id, not name
      totalRevenue: 15000, // 12000 + 3000 (COMPLETED only; PENDING 2000 excluded)
      completedCount: 2,
    });
  });

  it("AC-301: empty input → all zeros", () => {
    expect(buildSummary([])).toEqual({
      totalJobs: 0,
      totalPages: 0,
      uniqueUsers: 0,
      totalRevenue: 0,
      completedCount: 0,
    });
  });
});
