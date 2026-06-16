/**
 * AC-ADM-ORDERS-01: Orders list renders in a single outer panel with divider-separated rows
 * AC-ADM-ORDERS-02: Each order row is a plain div (no per-order card border/shadow/rounded)
 * AC-ADM-ORDERS-03: Layout is 2-column: left=order info, right=status select + Hapus button
 * AC-ADM-ORDERS-04: Hapus button is inside right column and has full-width outlined red styling
 * AC-ADM-ORDERS-05: Items section has no bg-slate-50 grey band
 *
 * NOTE: page.tsx is now a server component; tests target OrdersClient (the client leaf).
 */

import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OrdersClient } from "./OrdersClient";
import type { AdminOrderView } from "./OrdersClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(admin)/admin/orders/actions", () => ({
  setOrderStatusAction: vi.fn().mockResolvedValue({}),
}));

const mockOrders: AdminOrderView[] = [
  {
    id: "ao_001",
    code: "#vohwrk",
    customer: "Budi Santoso",
    email: "budi@gmail.com",
    placedAt: "2026-05-06T11:36:00+07:00",
    status: "COMPLETED",
    subtotalRupiah: 28000,
    discountRupiah: 0,
    totalRupiah: 28000,
    items: [{ nameSnapshot: "Item", qty: 1, unitPriceRupiah: 28000 }],
  },
  {
    id: "ao_002",
    code: "#0339xu",
    customer: "Budi Santoso",
    email: "budi@gmail.com",
    placedAt: "2026-04-30T13:54:00+07:00",
    status: "COMPLETED",
    subtotalRupiah: 35000,
    discountRupiah: 1750,
    totalRupiah: 33250,
    items: [{ nameSnapshot: "Item", qty: 1, unitPriceRupiah: 35000 }],
  },
  {
    id: "ao_003",
    code: "#v9smde",
    placedAt: "2026-04-30T13:33:00+07:00",
    status: "COMPLETED",
    guestName: "gfhfghf",
    subtotalRupiah: 28000,
    discountRupiah: 0,
    totalRupiah: 28000,
    items: [{ nameSnapshot: "Item", qty: 1, unitPriceRupiah: 28000 }],
  },
  {
    id: "ao_004",
    code: "#wno2cz",
    customer: "Budi Santoso",
    email: "budi@gmail.com",
    placedAt: "2026-04-08T11:32:00+07:00",
    status: "COMPLETED",
    subtotalRupiah: 40000,
    discountRupiah: 0,
    totalRupiah: 40000,
    items: [{ nameSnapshot: "Item", qty: 1, unitPriceRupiah: 40000 }],
  },
  {
    id: "ao_005",
    code: "#okr5ky",
    customer: "mahestya adhy sanjaya",
    email: "mahestya.a.sanjaya@gmail.com",
    placedAt: "2026-03-22T12:21:00+07:00",
    status: "COMPLETED",
    subtotalRupiah: 32000,
    discountRupiah: 0,
    totalRupiah: 32000,
    items: [{ nameSnapshot: "Item", qty: 1, unitPriceRupiah: 32000 }],
  },
  {
    id: "ao_006",
    code: "#v2vzoa",
    customer: "mahestya adhy sanjaya",
    email: "mahestya.a.sanjaya@gmail.com",
    placedAt: "2026-03-22T12:19:00+07:00",
    status: "COMPLETED",
    subtotalRupiah: 25000,
    discountRupiah: 0,
    totalRupiah: 25000,
    items: [{ nameSnapshot: "Item", qty: 1, unitPriceRupiah: 25000 }],
  },
];

describe("AdminOrdersPage — single-panel divider layout", () => {
  it("AC-ADM-ORDERS-01: renders a single outer panel with Orders heading inside it", () => {
    render(<OrdersClient initialOrders={mockOrders} />);
    const heading = screen.getByRole("heading", { name: /Orders \(\d+\)/i });
    expect(heading).toBeInTheDocument();
    expect(heading.closest("[data-testid='orders-panel']")).toBeInTheDocument();
  });

  it("AC-ADM-ORDERS-02: order rows are plain divs without card styling", () => {
    render(<OrdersClient initialOrders={mockOrders} />);
    const rows = screen.getAllByTestId("order-row");
    rows.forEach((row) => {
      expect(row.tagName).toBe("DIV");
      expect(row.classList.contains("shadow-sm")).toBe(false);
      expect(row.classList.contains("rounded-xl")).toBe(false);
    });
  });

  it("AC-ADM-ORDERS-03: each row has left content column and right action column", () => {
    render(<OrdersClient initialOrders={mockOrders} />);
    const rows = screen.getAllByTestId("order-row");
    rows.forEach((row) => {
      expect(within(row).getByTestId("order-left")).toBeInTheDocument();
      expect(within(row).getByTestId("order-right")).toBeInTheDocument();
    });
  });

  it("AC-ADM-ORDERS-04: Hapus button is inside right column with full-width outlined red styling", () => {
    render(<OrdersClient initialOrders={mockOrders} />);
    const rows = screen.getAllByTestId("order-row");
    rows.forEach((row) => {
      const rightCol = within(row).getByTestId("order-right");
      const hapusBtn = within(rightCol).getByRole("button", { name: /Hapus/i });
      expect(hapusBtn).toBeInTheDocument();
      expect(hapusBtn.classList.contains("w-full")).toBe(true);
      expect(hapusBtn.classList.contains("border")).toBe(true);
    });
  });

  it("AC-ADM-ORDERS-05: Items section has no bg-slate-50 grey band", () => {
    render(<OrdersClient initialOrders={mockOrders} />);
    const itemsSections = screen.getAllByTestId("order-items");
    itemsSections.forEach((section) => {
      expect(section.classList.contains("bg-slate-50")).toBe(false);
    });
  });

  it("empty state shows when filtered to status with no matching orders", () => {
    render(<OrdersClient initialOrders={mockOrders} />);
    // All orders are "COMPLETED"; filtering to "NEW" yields empty
    const filterSelect = screen.getByLabelText(/filter status/i);
    fireEvent.change(filterSelect, { target: { value: "NEW" } });
    expect(screen.getByText(/Belum ada pesanan/i)).toBeInTheDocument();
  });
});
