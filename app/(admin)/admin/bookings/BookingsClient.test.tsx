/**
 * BookingsClient (I-040, Phase 9) — real lifecycle counts + checkout payment
 * chooser, replacing the transitional cash-only completeBookingAction shim.
 *
 * AC-841: Pending/Confirmed/Active counts reflect the rows, and an ACTIVE
 *         row's checkout action opens a cash/QRIS/credits settlement
 *         affordance wired to checkoutBookingAction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { BookingsClient } from "./BookingsClient";
import type { AdminBookingView } from "./BookingsClient";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const checkoutSpy = vi.fn().mockResolvedValue({});
const cancelSpy = vi.fn().mockResolvedValue({});
const activateSpy = vi.fn().mockResolvedValue({});
const createSpy = vi.fn().mockResolvedValue({});
vi.mock("@/app/(admin)/admin/bookings/actions", () => ({
  checkoutBookingAction: (id: string, method: string) => checkoutSpy(id, method),
  cancelBookingAction: (id: string) => cancelSpy(id),
  activateBookingAction: (id: string) => activateSpy(id),
  createBookingAsAdminAction: (input: unknown) => createSpy(input),
}));

const members = [{ id: "u_1", name: "Budi Santoso", email: "budi@x.test" }];
const facilities = [
  { id: "f_1", name: "Meja A", type: "COWORKING_SEAT" as const, ratePerHourRupiah: 20000 },
];

const bookings: AdminBookingView[] = [
  {
    id: "bk_active_walkin",
    facility: "Walk-in Coworking",
    facilityType: "WALKIN_COWORKING",
    bookingMode: "WALKIN",
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
    bookingMode: "SCHEDULED",
    start: "2026-06-10T16:44:00+07:00",
    end: "2026-06-10T18:44:00+07:00",
    durationHours: 2,
    status: "COMPLETED",
    payment: "PAID_CASHIER",
    amount: 40000,
    member: { name: "Sari Wijaya", email: "sari@x.test", tier: "GOLD" },
  },
  {
    id: "bk_confirmed",
    facility: "Meeting Room A",
    facilityType: "MEETING_ROOM",
    bookingMode: "SCHEDULED",
    start: "2026-06-11T09:00:00+07:00",
    end: "2026-06-11T11:00:00+07:00",
    durationHours: 2,
    status: "CONFIRMED",
    payment: "PAID_ONLINE",
    amount: 300000,
    member: { name: "Sari Wijaya", email: "sari@x.test", tier: "GOLD" },
  },
  {
    id: "bk_pending",
    facility: "Counter 1",
    facilityType: "COWORKING_SEAT",
    bookingMode: "SCHEDULED",
    start: "2026-06-11T09:00:00+07:00",
    end: "2026-06-11T11:00:00+07:00",
    durationHours: 2,
    status: "PENDING",
    payment: "WAITING_CASHIER",
    amount: 40000,
    member: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BookingsClient (AC-841)", () => {
  it("AC-841: Pending/Confirmed/Active count pills reflect the data", () => {
    const { container } = render(<BookingsClient bookings={bookings} />);
    const pills = Array.from(
      container.querySelectorAll<HTMLSpanElement>(
        ".flex.items-center.gap-5 span.text-gray-700",
      ),
    );
    const texts = pills.map((p) => p.textContent?.replace(/\s+/g, ""));
    expect(texts).toEqual(
      expect.arrayContaining(["1Pending", "1Confirmed", "1Active"]),
    );
  });

  it("renders the active booking card with its facility + member", () => {
    render(<BookingsClient bookings={bookings} />);
    expect(screen.getByRole("heading", { name: "Booking Aktif" })).toBeInTheDocument();
    expect(screen.getByText("Walk-in Coworking")).toBeInTheDocument();
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
  });

  it("AC-841: checkout opens a cash/QRIS/credits chooser and calls checkoutBookingAction with the chosen method", async () => {
    render(<BookingsClient bookings={bookings} />);
    fireEvent.click(screen.getByRole("button", { name: /Selesaikan Sesi & Bayar/i }));

    // Chooser affordance appears with the three settlement methods.
    const qrisBtn = await screen.findByRole("button", { name: /QRIS/i });
    fireEvent.click(qrisBtn);

    await waitFor(() => expect(checkoutSpy).toHaveBeenCalledWith("bk_active_walkin", "qris"));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("[SEC] does not offer Time Credits at checkout for an already-prepaid (PAID_ONLINE) ACTIVE booking", async () => {
    const prepaidActive: AdminBookingView = {
      id: "bk_active_prepaid",
      facility: "Meja B",
      facilityType: "COWORKING_SEAT",
      bookingMode: "SCHEDULED",
      start: new Date(Date.now() - 1 * 3_600_000).toISOString(),
      end: new Date(Date.now() + 1 * 3_600_000).toISOString(),
      durationHours: 2,
      status: "ACTIVE",
      payment: "PAID_ONLINE",
      amount: 40000,
      member: { name: "Budi Santoso", email: "budi@x.test", tier: "PREMIUM" },
    };
    render(<BookingsClient bookings={[prepaidActive]} />);
    fireEvent.click(screen.getByRole("button", { name: /Selesaikan Sesi & Bayar/i }));

    await screen.findByRole("button", { name: /^Cash$/i });
    expect(screen.getByRole("button", { name: /QRIS/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Time Credits/i })).toBeNull();
  });

  it("history table renders COMPLETED and CONFIRMED rows under the 'all' filter", () => {
    render(<BookingsClient bookings={bookings} />);
    const select = screen.getByDisplayValue("Booking Aktif") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "all" } });
    expect(screen.getByText("Meja A")).toBeInTheDocument();
    expect(screen.getByText("Meeting Room A")).toBeInTheDocument();
  });

  it("Batalkan opens a confirm dialog and calls cancelBookingAction on confirm (PENDING row)", async () => {
    render(<BookingsClient bookings={bookings} />);
    fireEvent.change(screen.getByDisplayValue("Booking Aktif"), { target: { value: "all" } });

    const row = screen.getByText("Counter 1").closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: /batalkan/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    fireEvent.click(within(dialog).getByRole("button", { name: /batalkan booking/i }));

    await waitFor(() => expect(cancelSpy).toHaveBeenCalledWith("bk_pending"));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("Aktifkan Sekarang calls activateBookingAction for a CONFIRMED row", async () => {
    render(<BookingsClient bookings={bookings} />);
    fireEvent.change(screen.getByDisplayValue("Booking Aktif"), { target: { value: "all" } });

    const row = screen.getByText("Meeting Room A").closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: /aktifkan sekarang/i }));

    await waitFor(() => expect(activateSpy).toHaveBeenCalledWith("bk_confirmed"));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("surfaces INVALID_TRANSITION inline on the row when activation fails", async () => {
    activateSpy.mockRejectedValueOnce(new Error("INVALID_TRANSITION"));
    render(<BookingsClient bookings={bookings} />);
    fireEvent.change(screen.getByDisplayValue("Booking Aktif"), { target: { value: "all" } });

    const row = screen.getByText("Meeting Room A").closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: /aktifkan sekarang/i }));

    await waitFor(() =>
      expect(within(row).getByRole("alert")).toHaveTextContent(/tidak bisa diaktifkan/i),
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("Tambah Booking opens the manual-create dialog and submits to createBookingAsAdminAction", async () => {
    render(<BookingsClient bookings={bookings} members={members} facilities={facilities} />);

    fireEvent.click(screen.getByRole("button", { name: /tambah booking/i }));
    const dialog = await screen.findByRole("dialog", { name: /tambah booking/i });

    fireEvent.change(within(dialog).getByLabelText(/member/i), { target: { value: "u_1" } });
    fireEvent.change(within(dialog).getByLabelText(/fasilitas/i), { target: { value: "f_1" } });
    fireEvent.change(within(dialog).getByLabelText(/tanggal mulai/i), { target: { value: "2026-06-10" } });
    fireEvent.change(within(dialog).getByLabelText(/jam mulai/i), { target: { value: "09:00" } });
    fireEvent.change(within(dialog).getByLabelText(/tanggal selesai/i), { target: { value: "2026-06-10" } });
    fireEvent.change(within(dialog).getByLabelText(/jam selesai/i), { target: { value: "11:00" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy.mock.calls[0][0]).toMatchObject({
      userId: "u_1",
      facilityId: "f_1",
      facilityType: "COWORKING_SEAT",
      facilityName: "Meja A",
    });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /tambah booking/i })).toBeNull());
  });
});
