/**
 * PrintClient component tests (unit/RTL).
 *
 * AC-0239: PrintClient renders the seeded summary (total + Saldo Setelah Print projection).
 * AC-0240: Submitting calls the action; on rejection surfaces an Indonesian error and
 *          keeps the form usable (mirrors the AC-102 cafe error pattern).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrintClient } from "./PrintClient";
import type { PrintJobView } from "./PrintClient";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Mock the server action
vi.mock("@/app/(member)/print/actions", () => ({
  submitPrintJobAction: vi.fn().mockResolvedValue({} as never),
}));

import { submitPrintJobAction } from "@/app/(member)/print/actions";

const sampleJobs: PrintJobView[] = [
  {
    id: "pj_001",
    filename: "kontrak.pdf",
    pages: 5,
    price: 2500,
    status: "WAITING",
    datetime: "2026-06-20T10:00:00Z",
  },
  {
    id: "pj_002",
    filename: "laporan.docx",
    pages: 3,
    price: 1500,
    status: "READY",
    datetime: "2026-06-19T09:00:00Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(submitPrintJobAction).mockResolvedValue({} as never);
});

describe("PrintClient (AC-0239 / AC-0240)", () => {
  // -------------------------------------------------------------------------
  // AC-0239: renders the seeded summary
  // -------------------------------------------------------------------------
  describe("AC-0239: summary rendering", () => {
    it("AC-0239: shows print balance from props", () => {
      render(<PrintClient printBalance={50} jobs={[]} />);
      expect(screen.getByText(/50 lembar/i)).toBeInTheDocument();
    });

    it("AC-0239: shows the calculated total in the summary (default 1 page × 1 copy BW = Rp 500)", () => {
      render(<PrintClient printBalance={50} jobs={[]} />);
      // Default state: 1 page, 1 copy, BW → total Rp 500 displayed in bold teal
      // Multiple "Rp 500" may appear (Harga Dasar + Total) — assert at least one
      const totalEls = screen.getAllByText("Rp 500");
      expect(totalEls.length).toBeGreaterThanOrEqual(1);
    });

    it("AC-0239: Saldo Setelah Print shows correct projection (balance - sheets)", () => {
      // 50 balance - (1 page × 1 copy) = 49 lembar
      render(<PrintClient printBalance={50} jobs={[]} />);
      expect(screen.getByText(/49 lembar/i)).toBeInTheDocument();
    });

    it("AC-0239: shows 'Saldo tidak cukup' when projected balance is negative", () => {
      // balance=0, 1 page × 1 copy → 0-1 = -1 → insufficient
      render(<PrintClient printBalance={0} jobs={[]} />);
      expect(screen.getByText(/saldo tidak cukup/i)).toBeInTheDocument();
    });

    it("AC-0239: renders job history from seeded jobs prop", () => {
      render(<PrintClient printBalance={10} jobs={sampleJobs} />);
      expect(screen.getByText("kontrak.pdf")).toBeInTheDocument();
      expect(screen.getByText("laporan.docx")).toBeInTheDocument();
    });

    it("AC-0239: shows all three Ringkasan section keys", () => {
      render(<PrintClient printBalance={50} jobs={[]} />);
      expect(screen.getByText(/ringkasan/i)).toBeInTheDocument();
      expect(screen.getByText(/total halaman/i)).toBeInTheDocument();
      expect(screen.getByText(/saldo setelah print/i)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // AC-0240: submit behavior + error handling
  // -------------------------------------------------------------------------
  describe("AC-0240: submit + error surface", () => {
    it("AC-0240: clicking 'Submit Print Job' calls submitPrintJobAction", async () => {
      render(<PrintClient printBalance={50} jobs={[]} />);

      const submitBtn = screen.getByRole("button", { name: /submit print job/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(submitPrintJobAction).toHaveBeenCalledTimes(1);
      });
    });

    it("AC-0240: action is called with FormData containing pages/copies/colorMode from current form state", async () => {
      render(<PrintClient printBalance={50} jobs={[]} />);

      // Default: 1 page, 1 copy, BW, A4, no duplex
      const submitBtn = screen.getByRole("button", { name: /submit print job/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(submitPrintJobAction).toHaveBeenCalledTimes(1);
      });

      const arg = vi.mocked(submitPrintJobAction).mock.calls[0][0];
      expect(arg).toBeInstanceOf(FormData);
      const fd = arg as FormData;
      expect(fd.get("pages")).toBe("1");
      expect(fd.get("copies")).toBe("1");
      expect(fd.get("colorMode")).toBe("BW");
    });

    it("AC-0240: on INSUFFICIENT_BALANCE rejection, shows Indonesian error message", async () => {
      vi.mocked(submitPrintJobAction).mockRejectedValue(
        new Error("INSUFFICIENT_BALANCE")
      );

      render(<PrintClient printBalance={50} jobs={[]} />);

      const submitBtn = screen.getByRole("button", { name: /submit print job/i });
      fireEvent.click(submitBtn);

      const errorEl = await screen.findByText(/saldo print tidak cukup/i);
      expect(errorEl).toBeInTheDocument();
    });

    it("AC-0240: on UNAUTHENTICATED rejection, shows session-expired message", async () => {
      vi.mocked(submitPrintJobAction).mockRejectedValue(
        new Error("UNAUTHENTICATED")
      );

      render(<PrintClient printBalance={50} jobs={[]} />);

      fireEvent.click(screen.getByRole("button", { name: /submit print job/i }));

      const errorEl = await screen.findByText(/sesi berakhir/i);
      expect(errorEl).toBeInTheDocument();
    });

    it("AC-0240: on unknown error rejection, shows generic fallback message", async () => {
      vi.mocked(submitPrintJobAction).mockRejectedValue(
        new Error("NETWORK_TIMEOUT")
      );

      render(<PrintClient printBalance={50} jobs={[]} />);

      fireEvent.click(screen.getByRole("button", { name: /submit print job/i }));

      const errorEl = await screen.findByText(/gagal mengirim print job/i);
      expect(errorEl).toBeInTheDocument();
    });

    it("AC-0240: form remains usable after rejection (submit button not permanently disabled)", async () => {
      vi.mocked(submitPrintJobAction).mockRejectedValue(
        new Error("INSUFFICIENT_BALANCE")
      );

      render(<PrintClient printBalance={50} jobs={[]} />);

      const submitBtn = screen.getByRole("button", { name: /submit print job/i });
      fireEvent.click(submitBtn);

      // Error appears
      await screen.findByText(/saldo print tidak cukup/i);

      // Button is re-enabled (not stuck in submitting state)
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /submit print job/i })
        ).not.toBeDisabled();
      });
    });

    it("AC-0240: error clears on the next successful submit", async () => {
      vi.mocked(submitPrintJobAction)
        .mockRejectedValueOnce(new Error("INSUFFICIENT_BALANCE"))
        .mockResolvedValueOnce({} as never);

      render(<PrintClient printBalance={50} jobs={[]} />);

      const submitBtn = screen.getByRole("button", { name: /submit print job/i });
      fireEvent.click(submitBtn);

      // First attempt — error shown
      await screen.findByText(/saldo print tidak cukup/i);

      // Second attempt — success → error disappears
      fireEvent.click(screen.getByRole("button", { name: /submit print job/i }));

      await waitFor(() => {
        expect(
          screen.queryByText(/saldo print tidak cukup/i)
        ).not.toBeInTheDocument();
      });
    });

    it("AC-0240: after a successful submit the action is called exactly once per click", async () => {
      render(<PrintClient printBalance={50} jobs={[]} />);

      const submitBtn = screen.getByRole("button", { name: /submit print job/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(submitPrintJobAction).toHaveBeenCalledTimes(1);
      });

      // A second independent click should call the action again (form is usable)
      vi.mocked(submitPrintJobAction).mockResolvedValueOnce({} as never);
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(submitPrintJobAction).toHaveBeenCalledTimes(2);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Static gate: no lib/mock import
  // -------------------------------------------------------------------------
  it("no-mock-import gate: print page files do not import lib/mock", async () => {
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
        /from\s+["']@\/lib\/mock/,
      );
    }
  });
});
