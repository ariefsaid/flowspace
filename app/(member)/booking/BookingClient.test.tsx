/**
 * BookingClient (I-040, Phase 7) — server-driven wizard shell.
 *
 * AC-801: the four labeled steps (Tipe/Waktu/Pilih Tempat/Konfirmasi) and the
 *         five booking-type choices are present.
 * AC-842: a createBookingAction failure surfaces an inline error and shows
 *         NO success state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./actions", () => ({
  createBookingAction: vi.fn(),
  getFloorPlanAction: vi.fn(),
}));

import { BookingClient } from "./BookingClient";
import { createBookingAction, getFloorPlanAction } from "./actions";

const seats = [
  {
    id: "fac_meja_a",
    label: "Meja A",
    seatLabel: "A",
    zone: "DESK",
    status: "available" as const,
    ratePerHourRupiah: 25_000,
  },
];

const discounts = { coworkingDiscountPct: 0, meetingDiscountPct: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFloorPlanAction).mockResolvedValue(seats);
  vi.mocked(createBookingAction).mockResolvedValue({
    id: "bk_new",
    status: "CONFIRMED",
    paymentStatus: "PAID_ONLINE",
    amountRupiah: 50_000,
    baseAmountRupiah: 50_000,
    discountRupiah: 0,
    facilityName: "Meja A",
  } as never);
});

async function advanceToConfirm() {
  render(<BookingClient discounts={discounts} timeCredits={10} />);

  // Step 0 → select "Coworking Seat" (auto-advances after 180ms)
  fireEvent.click(screen.getByRole("button", { name: /Coworking Seat/ }));
  await screen.findByText("Tanggal Reservasi");
  fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

  // Step 2 (Pilih Tempat) — server-driven floor plan loads then a seat is picked
  await waitFor(() => expect(getFloorPlanAction).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole("button", { name: "Meja A" }));
  fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

  await screen.findByText("Konfirmasi Booking");
}

describe("BookingClient (AC-801/842)", () => {
  it("AC-801: renders the four labeled steps and five booking-type choices", () => {
    render(<BookingClient discounts={discounts} timeCredits={10} />);

    // Stepper labels
    for (const label of ["Tipe", "Waktu", "Pilih Tempat", "Konfirmasi"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    // Five booking-type choices
    expect(screen.getByRole("button", { name: /Walk-in Coworking/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Walk-in Meeting Room/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coworking Seat/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Meeting Room\b/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Full Room Event/ })).toBeInTheDocument();
  });

  it("confirm is disabled until the policy checkbox is accepted, then submits with the chosen payment method", async () => {
    await advanceToConfirm();

    const confirmBtn = screen.getByRole("button", { name: /Konfirmasi Booking/ });
    expect(confirmBtn).toBeDisabled();

    // Choose online payment + accept policy
    fireEvent.click(screen.getByRole("radio", { name: /Online/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /menyetujui kebijakan/i }));
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);

    await waitFor(() => expect(createBookingAction).toHaveBeenCalledTimes(1));
    const call = vi.mocked(createBookingAction).mock.calls[0][0];
    expect(call.bookingType).toBe("scheduled-coworking");
    expect(call.place).toEqual(seats[0]);
    expect(call.paymentMethod).toBe("online");

    // Honest success state — the REAL server response, not a random number.
    await screen.findByText("Booking Dikonfirmasi!");
    expect(screen.getByText(/CONFIRMED/)).toBeInTheDocument();
  });

  it("AC-842: a server-action failure surfaces inline and shows no success state", async () => {
    vi.mocked(createBookingAction).mockRejectedValueOnce(new Error("FACILITY_UNAVAILABLE"));
    await advanceToConfirm();

    fireEvent.click(screen.getByRole("radio", { name: /Online/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /menyetujui kebijakan/i }));
    fireEvent.click(screen.getByRole("button", { name: /Konfirmasi Booking/ }));

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled());
    expect(await screen.findByText("FACILITY_UNAVAILABLE")).toBeInTheDocument();
    expect(screen.queryByText("Booking Dikonfirmasi!")).toBeNull();
  });

  it("floor plan loading/empty states: shows a loading indicator then an empty message when no seats are available", async () => {
    let resolveSeats: (v: typeof seats) => void = () => {};
    vi.mocked(getFloorPlanAction).mockReturnValueOnce(
      new Promise((res) => {
        resolveSeats = res;
      }),
    );
    render(<BookingClient discounts={discounts} timeCredits={10} />);
    fireEvent.click(screen.getByRole("button", { name: /Coworking Seat/ }));
    await screen.findByText("Tanggal Reservasi");
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

    expect(await screen.findByText(/Memuat denah/i)).toBeInTheDocument();
    resolveSeats([]);
    expect(await screen.findByText(/Tidak ada tempat tersedia/i)).toBeInTheDocument();
  });

  it("walk-in coworking forces cashier payment with no payment picker shown", async () => {
    render(<BookingClient discounts={discounts} timeCredits={10} />);
    fireEvent.click(screen.getByRole("button", { name: /Walk-in Coworking/ }));
    await screen.findByText("Tanggal");
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    await waitFor(() => expect(getFloorPlanAction).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "Meja A" }));
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    await screen.findByText("Konfirmasi Booking");

    expect(screen.queryByRole("radio", { name: /Online/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /menyetujui kebijakan/i }));
    fireEvent.click(screen.getByRole("button", { name: /Konfirmasi Booking/ }));

    await waitFor(() => expect(createBookingAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createBookingAction).mock.calls[0][0].paymentMethod).toBe("cashier");
  });
});
