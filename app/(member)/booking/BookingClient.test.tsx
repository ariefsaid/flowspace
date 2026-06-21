/**
 * BookingClient (I-021) — wizard renders + createBookingAction wiring.
 *
 * AC-143: scheduled-coworking confirm calls createBookingAction with the
 *         selected type/time/place (server resolves facility+rate) → success.
 * AC-144: a server-action error surfaces inline (money-path defect surface).
 * AC-145: Full Room confirm does NOT call the action (contact request only).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./actions", () => ({
  createBookingAction: vi.fn().mockResolvedValue({ id: "bk_new" }),
}));

import { BookingClient, type FacilityView } from "./BookingClient";
import { createBookingAction } from "./actions";

const facilities: FacilityView[] = [
  {
    id: "fac-meja-a",
    name: "Meja A",
    type: "COWORKING_SEAT",
    ratePerHourRupiah: 20000,
    available: true,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createBookingAction).mockResolvedValue({ id: "bk_new" } as never);
});

describe("BookingClient (AC-143/144/145)", () => {
  it("renders the wizard header + step 0", () => {
    render(<BookingClient facilities={facilities} />);
    expect(screen.getByText("Booking")).toBeInTheDocument();
    // Step 0 type cards are present.
    expect(
      screen.getByRole("button", { name: /Mulai Rp20\.000\/jam/ }),
    ).toBeInTheDocument();
  });

  it("AC-143: scheduled-coworking confirm calls createBookingAction and shows success", async () => {
    render(<BookingClient facilities={facilities} />);

    // Step 0 → select "Coworking Seat" (auto-advances after 180ms)
    fireEvent.click(
      screen.getByRole("button", { name: /Mulai Rp20\.000\/jam/ }),
    );
    // Step 1 (Waktu) — defaults are valid (date today, 09:00, 2h); go next
    await screen.findByText("Tanggal Reservasi");
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

    // Step 2 (Pilih Tempat) — pick "Meja A"
    await screen.findByText("Denah Coworking");
    fireEvent.click(screen.getByRole("button", { name: "Meja A" }));
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

    // Step 3 (Konfirmasi) — confirm
    await screen.findByText("Konfirmasi Booking");
    fireEvent.click(screen.getByRole("button", { name: /Konfirmasi Booking/ }));

    await waitFor(() => {
      expect(createBookingAction).toHaveBeenCalledTimes(1);
    });
    const call = vi.mocked(createBookingAction).mock.calls[0][0];
    expect(call.bookingType).toBe("scheduled-coworking");
    expect(call.place).toEqual({ id: "meja-a", label: "Meja A" });
    expect(call.time.durationHours).toBe(2);
    expect(call.time.startTime).toBe("09:00");

    // Success state rendered by Step4Confirm.
    await screen.findByText("Booking Dikonfirmasi!");
  });

  it("AC-144: a server-action error surfaces inline (no success state)", async () => {
    vi.mocked(createBookingAction).mockRejectedValueOnce(
      new Error("INVALID_FACILITY"),
    );
    render(<BookingClient facilities={facilities} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Mulai Rp20\.000\/jam/ }),
    );
    await screen.findByText("Tanggal Reservasi");
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    await screen.findByText("Denah Coworking");
    fireEvent.click(screen.getByRole("button", { name: "Meja A" }));
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    await screen.findByText("Konfirmasi Booking");
    fireEvent.click(screen.getByRole("button", { name: /Konfirmasi Booking/ }));

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled());
    expect(await screen.findByText("INVALID_FACILITY")).toBeInTheDocument();
    // Not confirmed.
    expect(screen.queryByText("Booking Dikonfirmasi!")).toBeNull();
  });

  it("AC-145: Full Room confirm does NOT call createBookingAction", async () => {
    render(<BookingClient facilities={facilities} />);

    // Select the Full Room card (badge "Hubungi untuk harga")
    fireEvent.click(
      screen.getByRole("button", { name: /Hubungi untuk harga/ }),
    );
    await screen.findByText("Tanggal Reservasi");
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    // Step 2 for full-room shows the contact panel
    await screen.findByText(/Seluruh ruangan coworking/);
    fireEvent.click(screen.getByRole("button", { name: "Pilih Full Room" }));
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    await screen.findByText("Konfirmasi Booking");
    fireEvent.click(screen.getByRole("button", { name: /Konfirmasi Booking/ }));

    await screen.findByText("Booking Dikonfirmasi!");
    expect(createBookingAction).not.toHaveBeenCalled();
  });
});
