/**
 * AC-101: OrdersClient renders DB-provided orders (unit/RTL).
 * Also verifies status filter narrows displayed rows.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrdersClient } from "./OrdersClient";
import type { AdminOrderView } from "./OrdersClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(admin)/admin/orders/actions", () => ({
  setOrderStatusAction: vi.fn().mockResolvedValue({}),
}));

const completedOrder: AdminOrderView = {
  id: "ord-1",
  code: "#vohwrk",
  customer: "Budi Santoso",
  email: "budi@test.com",
  placedAt: new Date("2026-05-06T11:36:00Z").toISOString(),
  status: "COMPLETED",
  subtotalRupiah: 28000,
  discountRupiah: 0,
  totalRupiah: 28000,
  items: [{ nameSnapshot: "Americano", qty: 1, unitPriceRupiah: 28000 }],
};

const newOrder: AdminOrderView = {
  id: "ord-2",
  code: "#xyz999",
  customer: undefined,
  email: undefined,
  placedAt: new Date("2026-05-07T09:00:00Z").toISOString(),
  status: "NEW",
  subtotalRupiah: 32000,
  discountRupiah: 0,
  totalRupiah: 32000,
  items: [{ nameSnapshot: "Latte", qty: 1, unitPriceRupiah: 32000 }],
  guestName: "Sari",
};

/** Guest order: no customer, only guestName */
const guestOnlyOrder: AdminOrderView = {
  id: "ord-3",
  code: "#guest01",
  customer: undefined,
  email: undefined,
  guestName: "Rini",
  placedAt: new Date("2026-05-08T10:00:00Z").toISOString(),
  status: "NEW",
  subtotalRupiah: 25000,
  discountRupiah: 0,
  totalRupiah: 25000,
  items: [{ nameSnapshot: "Croissant", qty: 1, unitPriceRupiah: 25000 }],
};

describe("OrdersClient (AC-101)", () => {
  it("AC-101: renders order code from props (DB-sourced)", () => {
    render(<OrdersClient initialOrders={[completedOrder, newOrder]} />);
    expect(screen.getByText("#vohwrk")).toBeInTheDocument();
    expect(screen.getByText("#xyz999")).toBeInTheDocument();
  });

  it("AC-101: renders total from persisted fields", () => {
    render(<OrdersClient initialOrders={[completedOrder]} />);
    // The total value appears (may appear multiple times: item line + totals row)
    const totals = screen.getAllByText("Rp 28.000");
    expect(totals.length).toBeGreaterThanOrEqual(1);
  });

  it("filter by status narrows displayed orders", () => {
    render(<OrdersClient initialOrders={[completedOrder, newOrder]} />);
    const select = screen.getByLabelText(/filter status/i);
    fireEvent.change(select, { target: { value: "COMPLETED" } });
    expect(screen.getByText("#vohwrk")).toBeInTheDocument();
    expect(screen.queryByText("#xyz999")).not.toBeInTheDocument();
  });

  it("shows empty state when no orders match filter", () => {
    render(<OrdersClient initialOrders={[completedOrder]} />);
    const select = screen.getByLabelText(/filter status/i);
    fireEvent.change(select, { target: { value: "NEW" } });
    expect(screen.getByText(/belum ada pesanan/i)).toBeInTheDocument();
  });

  it("member order shows customer name and email from joined AppUser", () => {
    render(<OrdersClient initialOrders={[completedOrder]} />);
    // completedOrder has customer="Budi Santoso" and email="budi@test.com"
    expect(screen.getByText(/Budi Santoso/)).toBeInTheDocument();
    expect(screen.getByText(/budi@test\.com/)).toBeInTheDocument();
  });

  it("guest order shows 'Guest: <name>' and no member email", () => {
    render(<OrdersClient initialOrders={[guestOnlyOrder]} />);
    expect(screen.getByText(/Guest: Rini/)).toBeInTheDocument();
    // no email line rendered for guests
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("order with customerUserId set does not show 'Guest:' prefix", () => {
    render(<OrdersClient initialOrders={[completedOrder]} />);
    expect(screen.queryByText(/Guest:/)).not.toBeInTheDocument();
  });
});
