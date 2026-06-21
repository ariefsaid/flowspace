/**
 * BookingsClient — renders DB-provided bookings + wires "Selesaikan Sesi & Bayar"
 * on an active walk-in to completeBookingAction (unit/RTL).
 *
 * AC-ADM-BK-01: renders active booking card(s) in the "Booking Aktif" section
 * AC-ADM-BK-02: renders history rows in the table (COMPLETED/CANCELLED)
 * AC-ADM-BK-03: "Selesaikan Sesi & Bayar" calls completeBookingAction then refresh
 * AC-ADM-BK-04: pending/active count pills reflect the data
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BookingsClient } from "./BookingsClient";
import type { AdminBookingView } from "./BookingsClient";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const completeSpy = vi.fn().mockResolvedValue({});
vi.mock("@/app/(admin)/admin/bookings/actions", () => ({
  completeBookingAction: (id: string) => completeSpy(id),
}));

const bookings: AdminBookingView[] = [
  {
    id: "bk_active",
    facility: "Walk-in Coworking",
    facilityType: "WALKIN_COWORKING",
    start: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    end: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    durationHours: 0,
    status: "ACTIVE",
    payment: "WAITING_CASHIER",
    amount: 0,
    member: { name: "Budi Santoso", email: "budi@x.test", tier: "PREMIUM" },
  },
  {
    id: "bk_done",
    facility: "Meja A",
    facilityType: "COWORKING_SEAT",
    start: "2026-06-10T16:44:00+07:00",
    end: "2026-06-10T18:44:00+07:00",
    durationHours: 2,
    status: "COMPLETED",
    payment: "PAID_CASHIER",
    amount: 40000,
    member: { name: "Sari Wijaya", email: "sari@x.test", tier: "GOLD" },
  },
];

describe("BookingsClient", () => {
  it("AC-ADM-BK-01: renders the active booking card with its facility + member", () => {
    render(<BookingsClient bookings={bookings} />);
    // Default filter is "active" → only the active card section renders.
    // "Booking Aktif" appears both as the section heading and a filter option,
    // so target the heading role specifically.
    expect(
      screen.getByRole("heading", { name: "Booking Aktif" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Walk-in Coworking")).toBeInTheDocument();
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Selesaikan Sesi & Bayar/i }),
    ).toBeInTheDocument();
  });

  it("AC-ADM-BK-04: count pills reflect the data (1 pending, 1 active)", () => {
    const { container } = render(<BookingsClient bookings={bookings} />);
    // The count sits in a nested <span> inside each label span, so match on
    // the three stats-pill spans directly (whitespace-stripped) rather than
    // via getByText — JSX collapses the inter-tag space ambiguously.
    const pills = Array.from(
      container.querySelectorAll<HTMLSpanElement>(
        ".flex.items-center.gap-5 span.text-gray-700",
      ),
    );
    const texts = pills.map((p) => p.textContent?.replace(/\s+/g, ""));
    expect(texts).toEqual(
      expect.arrayContaining(["1Pending", "1Active", "0Confirmed"]),
    );
  });

  it("AC-ADM-BK-03: 'Selesaikan Sesi & Bayar' calls completeBookingAction then refresh", async () => {
    render(<BookingsClient bookings={bookings} />);
    fireEvent.click(screen.getByRole("button", { name: /Selesaikan Sesi & Bayar/i }));
    await waitFor(() => {
      expect(completeSpy).toHaveBeenCalledWith("bk_active");
    });
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it("AC-ADM-BK-02: history table renders COMPLETED rows under the 'all' filter", () => {
    render(<BookingsClient bookings={bookings} />);
    const select = screen.getByDisplayValue("Booking Aktif") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "all" } });
    expect(screen.getByText("Meja A")).toBeInTheDocument();
    expect(screen.getByText("Sari Wijaya")).toBeInTheDocument();
  });
});
