/**
 * HistoryClient (unit/RTL) — member history presentational leaf.
 *
 * Renders both tabs (Booking / Transaksi) from props, with the right counts and
 * row content per tab. Verifies the surface does not import lib/mock.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  HistoryClient,
  type BookingHistoryView,
  type TransactionHistoryView,
} from "./HistoryClient";

const bookings: BookingHistoryView[] = [
  {
    id: "bk_1",
    facility: "Meeting Room A",
    start: "2026-06-10T13:25:00+07:00",
    end: "2026-06-10T15:25:00+07:00",
    durationHours: 2,
    status: "COMPLETED",
    payment: "PAID_ONLINE",
  },
  {
    id: "bk_2",
    facility: "Meja B",
    start: "2026-04-08T15:10:00+07:00",
    end: "2026-04-08T18:10:00+07:00",
    durationHours: 3,
    status: "COMPLETED",
    payment: "PAID_CASHIER",
  },
];

const transactions: TransactionHistoryView[] = [
  {
    id: "trx_1",
    kind: "cafe",
    description: "Pesanan Cafe",
    amount: 89000,
    datetime: "2026-06-15T13:12:00+07:00",
    status: "COMPLETED",
  },
  {
    id: "trx_2",
    kind: "package",
    description: "Purchased 20 Hours package",
    amount: 260000,
    datetime: "2026-06-15T11:47:00+07:00",
    status: "COMPLETED",
  },
];

describe("HistoryClient", () => {
  it("renders the Booking tab by default with the count + booking rows", () => {
    render(<HistoryClient bookings={bookings} transactions={transactions} />);

    // Tab labels with counts
    expect(screen.getByText("Booking (2)")).toBeInTheDocument();
    expect(screen.getByText("Transaksi (2)")).toBeInTheDocument();

    // Booking tab content (default)
    expect(screen.getByText("Meeting Room A")).toBeInTheDocument();
    expect(screen.getByText("Meja B")).toBeInTheDocument();
    // Duration line
    expect(screen.getAllByText(/Durasi:/)).toHaveLength(2);
    // Booking status + payment badges
    expect(screen.getAllByText("COMPLETED")).toHaveLength(2);
    expect(screen.getByText("PAID ONLINE")).toBeInTheDocument();
    expect(screen.getByText("PAID CASHIER")).toBeInTheDocument();
  });

  it("switches to the Transaksi tab and renders transaction rows", () => {
    render(<HistoryClient bookings={bookings} transactions={transactions} />);

    // Transaction descriptions are NOT in the booking tab.
    expect(screen.queryByText("Pesanan Cafe")).toBeNull();

    fireEvent.click(screen.getByText("Transaksi (2)"));

    expect(screen.getByText("Pesanan Cafe")).toBeInTheDocument();
    expect(
      screen.getByText("Purchased 20 Hours package"),
    ).toBeInTheDocument();
    // Amount formatting (Rp 89.000 / Rp 260.000)
    expect(screen.getByText("Rp 89.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 260.000")).toBeInTheDocument();
    // Booking-only content disappears on the transaction tab.
    expect(screen.queryByText("Meeting Room A")).toBeNull();
  });

  it("no-mock-import gate: history surface files do not import lib/mock", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.resolve(__dirname);
    const files = (await fs.readdir(dir)).filter(
      (f) =>
        (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.endsWith(".test.tsx"),
    );
    for (const file of files) {
      const content = await fs.readFile(path.join(dir, file), "utf8");
      expect(content, `${file} must not import lib/mock`).not.toMatch(
        /from\s+["']@\/lib\/mock/,
      );
    }
  });
});
