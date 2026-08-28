/**
 * AC-302: toView maps a persisted row to the billing view (gross/net derivation).
 * (Summary aggregates — AC-301 — are SQL-owned: see lib/db/print.int.test.ts.)
 */
import { describe, it, expect } from "vitest";
import { toView } from "./derive";
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
