/**
 * AddBookingDialog (I-047) — the admin "Tambah Booking" manual-create form,
 * wired to createBookingAsAdminAction: pick a member, facility, time window,
 * payment method. Mirrors ORIG's admin bookings "Tambah Booking Baru" dialog.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddBookingDialog } from "./AddBookingDialog";

const members = [
  { id: "u_1", name: "Budi Santoso", email: "budi@x.test" },
  { id: "u_2", name: "Sari Wijaya", email: "sari@x.test" },
];

const facilities = [
  { id: "f_1", name: "Meja A", type: "COWORKING_SEAT" as const, ratePerHourRupiah: 20000 },
  { id: "f_2", name: "Meeting Room A", type: "MEETING_ROOM" as const, ratePerHourRupiah: 150000 },
];

describe("AddBookingDialog", () => {
  it("renders as an accessible modal with member, facility, time window and payment fields", () => {
    render(<AddBookingDialog members={members} facilities={facilities} onCancel={vi.fn()} onSave={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: /tambah booking/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText(/member/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fasilitas/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tanggal mulai/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/jam mulai/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tanggal selesai/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/jam selesai/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/metode pembayaran/i)).toBeInTheDocument();
  });

  it("submits the resolved booking payload to onSave", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AddBookingDialog members={members} facilities={facilities} onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/member/i), { target: { value: "u_2" } });
    fireEvent.change(screen.getByLabelText(/fasilitas/i), { target: { value: "f_2" } });
    fireEvent.change(screen.getByLabelText(/tanggal mulai/i), { target: { value: "2026-06-10" } });
    fireEvent.change(screen.getByLabelText(/jam mulai/i), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText(/tanggal selesai/i), { target: { value: "2026-06-10" } });
    fireEvent.change(screen.getByLabelText(/jam selesai/i), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText(/metode pembayaran/i), { target: { value: "online" } });

    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        userId: "u_2",
        facilityId: "f_2",
        facilityType: "MEETING_ROOM",
        facilityName: "Meeting Room A",
        startAt: new Date("2026-06-10T09:00:00"),
        endAt: new Date("2026-06-10T11:00:00"),
        paymentMethod: "online",
      }),
    );
  });

  it("blocks submit with an inline error when a required field is missing", () => {
    const onSave = vi.fn();
    render(<AddBookingDialog members={members} facilities={facilities} onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/semua field wajib diisi/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("surfaces USER_NOT_FOUND as a friendly field-level error on the member picker", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("USER_NOT_FOUND"));
    render(<AddBookingDialog members={members} facilities={facilities} onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/member/i), { target: { value: "u_1" } });
    fireEvent.change(screen.getByLabelText(/fasilitas/i), { target: { value: "f_1" } });
    fireEvent.change(screen.getByLabelText(/tanggal mulai/i), { target: { value: "2026-06-10" } });
    fireEvent.change(screen.getByLabelText(/jam mulai/i), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText(/tanggal selesai/i), { target: { value: "2026-06-10" } });
    fireEvent.change(screen.getByLabelText(/jam selesai/i), { target: { value: "11:00" } });

    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/member tidak ditemukan/i),
    );
  });

  it("calls onCancel from the Batal button", () => {
    const onCancel = vi.fn();
    render(<AddBookingDialog members={members} facilities={facilities} onCancel={onCancel} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^batal$/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
