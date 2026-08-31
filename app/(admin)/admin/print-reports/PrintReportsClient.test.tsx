/**
 * AC-302: PrintReportsClient maps a job row to its presentation (color label,
 *         derived discount %, net/gross strikethrough, status label).
 * AC-303: empty state renders and no table is shown.
 * I-047: the filter bar re-queries the server (via router.push on the current
 *   pathname + the new searchParams) instead of refetching client-side.
 * Static gate: print-reports/ files must not import lib/mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/admin/print-reports",
}));

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
  pendingCount: 0,
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
  it("AC-626: renders every status with effective pages, printer, and available action", () => {
    const statuses = ["PENDING", "PROCESSING", "READY", "COMPLETED", "FAILED"] as const;
    render(<PrintReportsClient jobs={statuses.map((status, index) => ({
      id: `p-${index}`, user: "Budi", fileName: `${status}.pdf`, pages: 6, copies: 2,
      pageRange: "1-3", printer: "Printer Lobi", colorMode: "BW", paperSize: "A4", discountRupiah: 100, grossRupiah: 3100,
      netRupiah: 3000, datetime: "2026-06-15T10:00:00Z", status,
      processedBy: "agent", processedAt: "2026-06-15T10:01:00Z", completedAt: null,
      canAdvance: status !== "COMPLETED",
    }))} summary={{ totalJobs: 5, totalPages: 15, uniqueUsers: 1, totalRevenue: 3000, completedCount: 0, pendingCount: 3 }} />);
    // Scoped to the table: the I-047 filter bar's status <select> also
    // renders these Indonesian status labels as <option> text.
    const table = screen.getByRole("table");
    expect(screen.getByText("PROCESSING")).toBeInTheDocument();
    expect(within(table).getByText("Diproses")).toBeInTheDocument();
    expect(within(table).getByText("Gagal")).toBeInTheDocument();
    expect(screen.getAllByText("Printer Lobi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("6 lembar")).toHaveLength(5);
  });
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
          pendingCount: 1,
        }}
      />,
    );
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    expect(screen.getByText("kontrak-sewa.pdf")).toBeInTheDocument();
    // I-047: the "Menunggu Proses" (pending+processing) tile replaces the old
    // "Pengguna Aktif" tile (ORIG parity).
    expect(screen.getByText("Menunggu Proses")).toBeInTheDocument();
    expect(screen.queryByText("Pengguna Aktif")).not.toBeInTheDocument();
    expect(screen.getByText("Warna")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument(); // derived discount
    // Scoped to the table: the I-047 filter bar's status <select> also
    // renders these Indonesian status labels as <option> text.
    const table = screen.getByRole("table");
    expect(within(table).getByText("Selesai")).toBeInTheDocument();
    // plain row: no discount → em dash, BW label, Menunggu
    expect(screen.getByText("B/W")).toBeInTheDocument();
    expect(within(table).getByText("Menunggu")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("AC-303: renders the empty state and no table when there are no jobs", () => {
    render(<PrintReportsClient jobs={[]} summary={emptySummary} />);
    expect(screen.getByText("Belum ada pekerjaan print")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("PrintReportsClient filter bar (I-047)", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  const filters = { search: "", status: "ALL" as const, dateFrom: "", dateTo: "" };

  it("changing the status select re-queries the server with the new status", () => {
    render(<PrintReportsClient jobs={[]} summary={emptySummary} filters={filters} />);
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: "FAILED" } });
    expect(pushMock).toHaveBeenCalledWith("/admin/print-reports?status=FAILED");
  });

  it("committing a search term (Enter) re-queries with the search param", () => {
    render(<PrintReportsClient jobs={[]} summary={emptySummary} filters={filters} />);
    const search = screen.getByLabelText(/cari/i);
    fireEvent.change(search, { target: { value: "kontrak" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(pushMock).toHaveBeenCalledWith("/admin/print-reports?search=kontrak");
  });

  it("changing the date-range inputs re-queries with dateFrom/dateTo", () => {
    render(<PrintReportsClient jobs={[]} summary={emptySummary} filters={filters} />);
    fireEvent.change(screen.getByLabelText(/dari tanggal/i), { target: { value: "2026-06-01" } });
    expect(pushMock).toHaveBeenCalledWith("/admin/print-reports?dateFrom=2026-06-01");
    fireEvent.change(screen.getByLabelText(/sampai tanggal/i), { target: { value: "2026-06-30" } });
    expect(pushMock).toHaveBeenCalledWith("/admin/print-reports?dateTo=2026-06-30");
  });

  it("combines multiple active filters into one query string", () => {
    render(
      <PrintReportsClient
        jobs={[]}
        summary={emptySummary}
        filters={{ search: "budi", status: "READY", dateFrom: "", dateTo: "" }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: "COMPLETED" } });
    expect(pushMock).toHaveBeenCalledWith("/admin/print-reports?search=budi&status=COMPLETED");
  });

  it("Reset Filter clears every filter and navigates to the bare pathname", () => {
    render(
      <PrintReportsClient
        jobs={[]}
        summary={emptySummary}
        filters={{ search: "budi", status: "READY", dateFrom: "2026-06-01", dateTo: "2026-06-30" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /reset filter/i }));
    expect(pushMock).toHaveBeenCalledWith("/admin/print-reports");
  });

  it("reflects the server-provided filter state in the controls (post-navigation re-render)", () => {
    render(
      <PrintReportsClient
        jobs={[]}
        summary={emptySummary}
        filters={{ search: "budi", status: "FAILED", dateFrom: "2026-06-01", dateTo: "2026-06-30" }}
      />,
    );
    expect(screen.getByLabelText(/cari/i)).toHaveValue("budi");
    expect(screen.getByLabelText(/status/i)).toHaveValue("FAILED");
    expect(screen.getByLabelText(/dari tanggal/i)).toHaveValue("2026-06-01");
    expect(screen.getByLabelText(/sampai tanggal/i)).toHaveValue("2026-06-30");
  });
});
