/**
 * AC-302: PrintReportsClient maps a job row to its presentation (color label,
 *         derived discount %, net/gross strikethrough, status label).
 * AC-303: empty state renders and no table is shown.
 * Static gate: print-reports/ files must not import lib/mock.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  PrintReportsClient,
  colorModeLabel,
  discountPercent,
  statusLabel,
  statusTone,
  type AdminPrintJobView,
  type PrintReportsSummary,
} from "./PrintReportsClient";

const emptySummary: PrintReportsSummary = {
  totalJobs: 0,
  totalPages: 0,
  uniqueUsers: 0,
  totalRevenue: 0,
  completedCount: 0,
};

const discountedJob: AdminPrintJobView = {
  id: "pj-1",
  user: "Budi Santoso",
  fileName: "kontrak-sewa.pdf",
  pages: 10,
  colorMode: "COLOR",
  paperSize: "A4",
  discountRupiah: 3000,
  grossRupiah: 15000,
  netRupiah: 12000,
  datetime: "2026-06-15T15:01:00+07:00",
  status: "COMPLETED",
};

const plainJob: AdminPrintJobView = {
  id: "pj-2",
  user: "Maya Lestari",
  fileName: "surat.docx",
  pages: 4,
  colorMode: "BW",
  paperSize: "F4",
  discountRupiah: 0,
  grossRupiah: 2000,
  netRupiah: 2000,
  datetime: "2026-06-14T09:00:00+07:00",
  status: "PENDING",
};

describe("PrintReportsClient mappers", () => {
  it("AC-302: colorModeLabel maps the enum to the recon label", () => {
    expect(colorModeLabel("COLOR")).toBe("Warna");
    expect(colorModeLabel("BW")).toBe("B/W");
  });

  it("AC-302: discountPercent derives the rounded % and 0 when none", () => {
    expect(discountPercent(3000, 15000)).toBe(20);
    expect(discountPercent(0, 2000)).toBe(0);
    expect(discountPercent(100, 0)).toBe(0); // guards divide-by-zero
  });

  it("AC-302: status maps to Indonesian label + Badge tone", () => {
    expect(statusLabel("PENDING")).toBe("Menunggu");
    expect(statusLabel("READY")).toBe("Siap Ambil");
    expect(statusLabel("COMPLETED")).toBe("Selesai");
    expect(statusTone("PENDING")).toBe("pending");
    expect(statusTone("READY")).toBe("active");
    expect(statusTone("COMPLETED")).toBe("completed");
  });
});

describe("print-reports source hygiene", () => {
  it("no-mock-import gate: print-reports files do not import lib/mock", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.resolve(__dirname);
    const files = await fs.readdir(dir);
    const srcFiles = files.filter(
      (f) =>
        (f.endsWith(".tsx") || f.endsWith(".ts")) &&
        !f.endsWith(".test.tsx") &&
        !f.endsWith(".test.ts"),
    );
    for (const file of srcFiles) {
      const content = await fs.readFile(path.join(dir, file), "utf8");
      expect(content, `${file} must not import lib/mock`).not.toMatch(
        /from\s+["'].*lib\/mock["']/,
      );
    }
  });
});

describe("PrintReportsClient render", () => {
  it("AC-302: renders a discounted row with derived % and struck-through gross", () => {
    render(
      <PrintReportsClient
        jobs={[discountedJob, plainJob]}
        summary={{
          totalJobs: 2,
          totalPages: 14,
          uniqueUsers: 2,
          totalRevenue: 12000,
          completedCount: 1,
        }}
      />,
    );
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    expect(screen.getByText("kontrak-sewa.pdf")).toBeInTheDocument();
    expect(screen.getByText("Warna")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument(); // derived discount
    expect(screen.getByText("Selesai")).toBeInTheDocument();
    // plain row: no discount → em dash, BW label, Menunggu
    expect(screen.getByText("B/W")).toBeInTheDocument();
    expect(screen.getByText("Menunggu")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("AC-303: renders the empty state and no table when there are no jobs", () => {
    render(<PrintReportsClient jobs={[]} summary={emptySummary} />);
    expect(screen.getByText("Belum ada pekerjaan print")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
