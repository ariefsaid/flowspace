/**
 * The print-pricing matrix editor renders all 6 (BW|COLOR × A4|A3|F4) cells
 * from seeded/unseeded data, saves one cell independently of the others
 * (per-cell pending/success/error), and never lets an in-flight save be
 * mistaken for success (each `it()` title names its own owning acceptance
 * criterion).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrintPricingClient } from "./PrintPricingClient";
import { upsertPrintPricingCellAction } from "./actions";
import type { MatrixCell } from "./toMatrixCells";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ upsertPrintPricingCellAction: vi.fn() }));

function makeCells(overrides: Partial<Record<string, Partial<MatrixCell>>> = {}): MatrixCell[] {
  const base: MatrixCell[] = [
    { colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500, isActive: true, configured: true },
    { colorMode: "BW", paperSize: "A3", pricePerPageRupiah: 1000, isActive: true, configured: true },
    { colorMode: "BW", paperSize: "F4", pricePerPageRupiah: 600, isActive: true, configured: true },
    { colorMode: "COLOR", paperSize: "A4", pricePerPageRupiah: 2000, isActive: true, configured: true },
    { colorMode: "COLOR", paperSize: "A3", pricePerPageRupiah: 3500, isActive: true, configured: true },
    { colorMode: "COLOR", paperSize: "F4", pricePerPageRupiah: 2200, isActive: true, configured: true },
  ];
  return base.map((c) => ({ ...c, ...(overrides[`${c.colorMode}:${c.paperSize}`] ?? {}) }));
}

describe("PrintPricingClient", () => {
  beforeEach(() => {
    vi.mocked(upsertPrintPricingCellAction).mockReset();
  });

  it("AC-P20: renders all 6 matrix cells with their seeded price + active state", () => {
    render(<PrintPricingClient cells={makeCells()} />);
    expect(screen.getByLabelText("Harga Hitam-Putih A4")).toHaveValue(500);
    expect(screen.getByLabelText("Harga Hitam-Putih A3")).toHaveValue(1000);
    expect(screen.getByLabelText("Harga Hitam-Putih F4")).toHaveValue(600);
    expect(screen.getByLabelText("Harga Warna A4")).toHaveValue(2000);
    expect(screen.getByLabelText("Harga Warna A3")).toHaveValue(3500);
    expect(screen.getByLabelText("Harga Warna F4")).toHaveValue(2200);
    expect(screen.getByLabelText("Aktif Hitam-Putih A4")).toHaveAttribute("aria-checked", "true");
  });

  it("AC-P21: an unconfigured cell (empty state) shows a not-configured badge and a zeroed price", () => {
    render(
      <PrintPricingClient
        cells={makeCells({ "COLOR:F4": { configured: false, pricePerPageRupiah: 0, isActive: true } })}
      />,
    );
    expect(screen.getByLabelText("Harga Warna F4")).toHaveValue(0);
    expect(screen.getByText("Belum diatur")).toBeInTheDocument();
  });

  it("AC-P22: editing a cell's price and clicking its Save button saves only that cell, showing pending then saved", async () => {
    let resolveSave: () => void = () => {};
    vi.mocked(upsertPrintPricingCellAction).mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveSave = resolve; }),
    );
    render(<PrintPricingClient cells={makeCells()} />);

    fireEvent.change(screen.getByLabelText("Harga Hitam-Putih A4"), { target: { value: "750" } });
    fireEvent.click(screen.getByLabelText("Simpan Hitam-Putih A4"));

    expect(await screen.findByText("Menyimpan…")).toBeInTheDocument();
    // the untouched COLOR A4 cell's Save button must still be idle (per-cell isolation)
    expect(screen.getByLabelText("Simpan Warna A4")).not.toBeDisabled();

    resolveSave();
    await waitFor(() => expect(screen.getByText("Tersimpan")).toBeInTheDocument());

    expect(upsertPrintPricingCellAction).toHaveBeenCalledWith({
      colorMode: "BW",
      paperSize: "A4",
      pricePerPageRupiah: 750,
      isActive: true,
    });
  });

  it("AC-P23: a rejected save shows an inline error for that cell only, never a false Tersimpan", async () => {
    vi.mocked(upsertPrintPricingCellAction).mockRejectedValueOnce(new Error("INVALID_RATE"));
    render(<PrintPricingClient cells={makeCells()} />);

    fireEvent.click(screen.getByLabelText("Simpan Hitam-Putih A4"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/tidak valid|positif/i);
    expect(screen.queryByText("Tersimpan")).not.toBeInTheDocument();
  });

  it("AC-P24: toggling the Aktif switch flips its state and is included in that cell's save payload", async () => {
    vi.mocked(upsertPrintPricingCellAction).mockResolvedValueOnce(undefined);
    render(<PrintPricingClient cells={makeCells()} />);

    const toggle = screen.getByLabelText("Aktif Hitam-Putih A4");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByLabelText("Simpan Hitam-Putih A4"));
    await waitFor(() =>
      expect(upsertPrintPricingCellAction).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      ),
    );
  });
});
