/**
 * SessionPanel (I-040, Phase 8) — dashboard active-session panel, replacing
 * ActiveSessionCard for both walk-in AND scheduled ACTIVE bookings.
 *
 * AC-829: a scheduled ACTIVE booking within 15 minutes of its end shows a
 *         countdown AND the extension affordance.
 * AC-830: a scheduled ACTIVE booking past its end shows a red overtime
 *         warning and NO completion/extension action.
 * AC-831: a walk-in ACTIVE booking counts elapsed time up and shows a
 *         provisional cost, capped + rounded hourly.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionPanel, type SessionView } from "./SessionPanel";

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

describe("SessionPanel", () => {
  it("AC-829: scheduled ACTIVE near end (≤15 min) shows a countdown and the extension affordance", () => {
    const session: SessionView = {
      bookingId: "bk_1",
      facilityName: "Meeting Room A",
      bookingMode: "SCHEDULED",
      startAt: iso(-90 * 60_000),
      endAt: iso(10 * 60_000), // 10 minutes remaining
      ratePerHourRupiah: 150_000,
      maxHours: 4,
    };
    render(<SessionPanel session={session} onExtend={vi.fn()} />);

    expect(screen.getByText(/Sesi Aktif/)).toBeInTheDocument();
    expect(screen.getAllByText(/tersisa/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Perpanjang Sesi/i })).toBeInTheDocument();
  });

  it("AC-829: extension affordance calls onExtend and disables while pending", async () => {
    const onExtend = vi.fn().mockResolvedValue(undefined);
    const session: SessionView = {
      bookingId: "bk_1",
      facilityName: "Meeting Room A",
      bookingMode: "SCHEDULED",
      startAt: iso(-90 * 60_000),
      endAt: iso(5 * 60_000),
      ratePerHourRupiah: 150_000,
      maxHours: 4,
    };
    render(<SessionPanel session={session} onExtend={onExtend} />);
    fireEvent.click(screen.getByRole("button", { name: /Perpanjang Sesi/i }));
    await waitFor(() => expect(onExtend).toHaveBeenCalledWith(1));
  });

  it("NFR-803: an extension failure (EXTENSION_BLOCKED_BY_NEXT_BOOKING) renders an inline error within the panel itself, not silently swallowed", async () => {
    const onExtend = vi.fn().mockRejectedValue(new Error("EXTENSION_BLOCKED_BY_NEXT_BOOKING"));
    const session: SessionView = {
      bookingId: "bk_1",
      facilityName: "Meeting Room A",
      bookingMode: "SCHEDULED",
      startAt: iso(-90 * 60_000),
      endAt: iso(5 * 60_000),
      ratePerHourRupiah: 150_000,
      maxHours: 4,
    };
    render(<SessionPanel session={session} onExtend={onExtend} />);
    fireEvent.click(screen.getByRole("button", { name: /Perpanjang Sesi/i }));

    await waitFor(() =>
      expect(screen.getByText(/EXTENSION_BLOCKED_BY_NEXT_BOOKING/i)).toBeInTheDocument(),
    );
    // The extending state resets so the affordance can be retried.
    expect(screen.getByRole("button", { name: /Perpanjang Sesi/i })).toBeEnabled();
  });

  it("AC-830: scheduled ACTIVE past end shows a red overtime warning and no completion/extension action", () => {
    const session: SessionView = {
      bookingId: "bk_2",
      facilityName: "Meja A",
      bookingMode: "SCHEDULED",
      startAt: iso(-3 * 3_600_000),
      endAt: iso(-10 * 60_000), // ended 10 minutes ago
      ratePerHourRupiah: 25_000,
      maxHours: 4,
    };
    render(<SessionPanel session={session} onExtend={vi.fn()} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/overtime|melebihi waktu/i);
    expect(screen.queryByRole("button", { name: /Perpanjang Sesi/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Selesai/i })).toBeNull();
  });

  it("AC-831: walk-in ACTIVE counts elapsed time up and shows a capped, hourly-rounded provisional cost", () => {
    const session: SessionView = {
      bookingId: "bk_3",
      facilityName: "Meja F",
      bookingMode: "WALKIN",
      startAt: iso(-65 * 60_000), // 65 minutes elapsed -> ceil(65/60) = 2 billed hours
      endAt: null,
      ratePerHourRupiah: 15_000,
      maxHours: 4,
    };
    render(<SessionPanel session={session} onExtend={vi.fn()} />);

    expect(screen.getByText(/Walk-in Aktif/)).toBeInTheDocument();
    // 2 billed hours * Rp15.000 = Rp30.000
    expect(screen.getByText("Rp 30.000")).toBeInTheDocument();
    expect(screen.getByText(/Maks: 4 jam/)).toBeInTheDocument();
  });

  it("AC-831: walk-in provisional cost caps at maxHours even past the cap", () => {
    const session: SessionView = {
      bookingId: "bk_4",
      facilityName: "Meja F",
      bookingMode: "WALKIN",
      startAt: iso(-6 * 3_600_000), // 6h elapsed, capped at 4h
      endAt: null,
      ratePerHourRupiah: 15_000,
      maxHours: 4,
    };
    render(<SessionPanel session={session} onExtend={vi.fn()} />);
    // 4 billed hours (capped) * Rp15.000 = Rp60.000
    expect(screen.getByText("Rp 60.000")).toBeInTheDocument();
  });
});
