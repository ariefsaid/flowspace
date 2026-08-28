/**
 * PendingClient (I-040, Phase 9) — split approval affordance by bookingMode.
 *
 * AC-840: walk-in PENDING rows show a distinct "Mulai Sesi (Walk-in)"
 *         approve-and-start affordance; scheduled rows show "Approve
 *         Pembayaran". Each calls its own action and refreshes on success.
 * AC-ADM-PEND-01: renders each pending item's facility, member name, amount.
 * AC-ADM-PEND-02: empty state shows when there are no pending payments.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { PendingClient } from "./PendingClient";
import type { PendingItem } from "./PendingClient";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const approvePaymentSpy = vi.fn().mockResolvedValue({});
const approveWalkInSpy = vi.fn().mockResolvedValue({});
vi.mock("@/app/(admin)/admin/pending/actions", () => ({
  approvePaymentAction: (id: string) => approvePaymentSpy(id),
  approveAndStartWalkInAction: (id: string) => approveWalkInSpy(id),
}));

const items: PendingItem[] = [
  {
    id: "bk_walkin",
    facility: "Walk-in Coworking",
    bookingMode: "WALKIN",
    start: "2026-06-21T15:00:00+07:00",
    end: "2026-06-21T15:00:00+07:00",
    durationHours: 0,
    amount: 0,
    member: { name: "Budi Santoso", phone: "" },
  },
  {
    id: "bk_scheduled",
    facility: "Meeting Room A",
    bookingMode: "SCHEDULED",
    start: "2026-06-21T10:00:00+07:00",
    end: "2026-06-21T12:00:00+07:00",
    durationHours: 2,
    amount: 240000,
    member: null,
  },
];

describe("PendingClient (AC-840)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-ADM-PEND-01: renders each pending item's facility, member name, amount", () => {
    render(<PendingClient items={items} />);
    expect(screen.getByText("Walk-in Coworking")).toBeInTheDocument();
    expect(screen.getByText("Meeting Room A")).toBeInTheDocument();
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    expect(screen.getByText("Rp 240.000")).toBeInTheDocument();
    expect(screen.getByText("Waiting for Cashier Payment (2)")).toBeInTheDocument();
  });

  it("AC-ADM-PEND-02: empty state shows when there are no pending payments", () => {
    render(<PendingClient items={[]} />);
    expect(
      screen.getByText(/Tidak ada pembayaran yang menunggu persetujuan/i),
    ).toBeInTheDocument();
  });

  it("AC-840: a walk-in row shows 'Mulai Sesi (Walk-in)' and calls approveAndStartWalkInAction, then refreshes", async () => {
    render(<PendingClient items={items} />);
    const walkinRow = screen.getByText("Walk-in Coworking").closest("li")!;
    const btn = within(walkinRow).getByRole("button", { name: /Mulai Sesi \(Walk-in\)/i });
    fireEvent.click(btn);

    await waitFor(() => expect(approveWalkInSpy).toHaveBeenCalledWith("bk_walkin"));
    expect(approvePaymentSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("AC-840: a scheduled row shows 'Approve Pembayaran' and calls approvePaymentAction, then refreshes", async () => {
    render(<PendingClient items={items} />);
    const scheduledRow = screen.getByText("Meeting Room A").closest("li")!;
    const btn = within(scheduledRow).getByRole("button", { name: /Approve Pembayaran/i });
    fireEvent.click(btn);

    await waitFor(() => expect(approvePaymentSpy).toHaveBeenCalledWith("bk_scheduled"));
    expect(approveWalkInSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("bulk 'Approve' routes each selected id through its own bookingMode action", async () => {
    render(<PendingClient items={items} />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole("button", { name: /Approve \(2\)/i }));

    await waitFor(() => {
      expect(approveWalkInSpy).toHaveBeenCalledWith("bk_walkin");
      expect(approvePaymentSpy).toHaveBeenCalledWith("bk_scheduled");
    });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });
});
