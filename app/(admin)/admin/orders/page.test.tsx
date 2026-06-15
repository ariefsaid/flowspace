/**
 * AC-ADM-ORDERS-01: Orders list renders in a single outer panel with divider-separated rows
 * AC-ADM-ORDERS-02: Each order row is a plain div (no per-order card border/shadow)
 * AC-ADM-ORDERS-03: Layout is 2-column: left=order info, right=status select + Hapus button
 * AC-ADM-ORDERS-04: Hapus button is inside right column and has full-width outlined red styling
 * AC-ADM-ORDERS-05: Items section has no bg-slate-50 grey band
 */

import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AdminOrdersPage from "./page";

describe("AdminOrdersPage — single-panel divider layout", () => {
  it("AC-ADM-ORDERS-01: renders a single outer panel with Orders heading inside it", () => {
    render(<AdminOrdersPage />);
    const heading = screen.getByRole("heading", { name: /Orders \(\d+\)/i });
    expect(heading).toBeInTheDocument();
    expect(heading.closest("[data-testid='orders-panel']")).toBeInTheDocument();
  });

  it("AC-ADM-ORDERS-02: order rows are plain divs without card styling", () => {
    render(<AdminOrdersPage />);
    const rows = screen.getAllByTestId("order-row");
    rows.forEach((row) => {
      expect(row.tagName).toBe("DIV");
      expect(row.classList.contains("shadow-sm")).toBe(false);
      expect(row.classList.contains("rounded-xl")).toBe(false);
    });
  });

  it("AC-ADM-ORDERS-03: each row has left content column and right action column", () => {
    render(<AdminOrdersPage />);
    const rows = screen.getAllByTestId("order-row");
    rows.forEach((row) => {
      expect(within(row).getByTestId("order-left")).toBeInTheDocument();
      expect(within(row).getByTestId("order-right")).toBeInTheDocument();
    });
  });

  it("AC-ADM-ORDERS-04: Hapus button is inside right column with full-width outlined red styling", () => {
    render(<AdminOrdersPage />);
    const rows = screen.getAllByTestId("order-row");
    rows.forEach((row) => {
      const rightCol = within(row).getByTestId("order-right");
      const hapusBtn = within(rightCol).getByRole("button", { name: /Hapus/i });
      expect(hapusBtn).toBeInTheDocument();
      expect(hapusBtn.classList.contains("w-full")).toBe(true);
      expect(hapusBtn.classList.contains("border")).toBe(true);
      expect(hapusBtn.classList.contains("text-red-600")).toBe(true);
    });
  });

  it("AC-ADM-ORDERS-05: Items section has no bg-slate-50 grey band", () => {
    render(<AdminOrdersPage />);
    const itemsSections = screen.getAllByTestId("order-items");
    itemsSections.forEach((section) => {
      expect(section.classList.contains("bg-slate-50")).toBe(false);
    });
  });

  it("deleting an order reduces the count in the heading", () => {
    render(<AdminOrdersPage />);
    expect(screen.getByRole("heading", { name: /Orders \(6\)/i })).toBeInTheDocument();
    const firstHapus = screen.getAllByRole("button", { name: /Hapus/i })[0];
    fireEvent.click(firstHapus);
    expect(screen.getByRole("heading", { name: /Orders \(5\)/i })).toBeInTheDocument();
  });

  it("empty state shows when filtered to status with no matching orders", () => {
    render(<AdminOrdersPage />);
    // All orders in mock data are "completed"; filtering to "new" yields empty
    const filterSelect = screen.getByLabelText(/filter status/i);
    fireEvent.change(filterSelect, { target: { value: "new" } });
    expect(screen.getByText(/Belum ada pesanan/i)).toBeInTheDocument();
  });
});
