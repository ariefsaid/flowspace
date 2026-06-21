/**
 * PendingClient — renders WAITING_CASHIER bookings + wires Approve (unit/RTL).
 *
 * AC-ADM-PEND-01: renders each pending item's facility, member name, amount
 * AC-ADM-PEND-02: empty state shows when there are no pending payments
 * AC-ADM-PEND-03: Approve calls approvePaymentAction per selected id, then refresh
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PendingClient } from "./PendingClient";
import type { PendingItem } from "./PendingClient";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const approveSpy = vi.fn().mockResolvedValue({});
vi.mock("@/app/(admin)/admin/pending/actions", () => ({
  approvePaymentAction: (id: string) => approveSpy(id),
}));

const items: PendingItem[] = [
  {
    id: "bk_1",
    facility: "Walk-in Coworking",
    start: "2026-06-21T15:00:00+07:00",
    end: "2026-06-21T18:00:00+07:00",
    durationHours: 3,
    amount: 45000,
    member: { name: "Budi Santoso", phone: "" },
  },
  {
    id: "bk_2",
    facility: "Meeting Room A",
    start: "2026-06-21T10:00:00+07:00",
    end: "2026-06-21T12:00:00+07:00",
    durationHours: 2,
    amount: 240000,
    member: null,
  },
];

describe("PendingClient", () => {
  it("AC-ADM-PEND-01: renders each pending item's facility, member name, amount", () => {
    render(<PendingClient items={items} />);
    expect(screen.getByText("Walk-in Coworking")).toBeInTheDocument();
    expect(screen.getByText("Meeting Room A")).toBeInTheDocument();
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    // 45000 -> "Rp 45.000"
    expect(screen.getByText("Rp 45.000")).toBeInTheDocument();
    expect(screen.getByText("Waiting for Cashier Payment (2)")).toBeInTheDocument();
  });

  it("AC-ADM-PEND-02: empty state shows when there are no pending payments", () => {
    render(<PendingClient items={[]} />);
    expect(
      screen.getByText(/Tidak ada pembayaran yang menunggu persetujuan/i),
    ).toBeInTheDocument();
  });

  it("AC-ADM-PEND-03: Approve calls approvePaymentAction for each selected id, then refresh", async () => {
    render(<PendingClient items={items} />);
    // Select both checkboxes
    const checkboxes = screen.getAllByRole("checkbox");
    // first checkbox is the first item row (Select All is a button, not a checkbox)
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    const approveBtn = screen.getByRole("button", { name: /Approve \(2\)/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(approveSpy).toHaveBeenCalledTimes(2);
      expect(approveSpy).toHaveBeenNthCalledWith(1, "bk_1");
      expect(approveSpy).toHaveBeenNthCalledWith(2, "bk_2");
    });
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
