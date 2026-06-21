/**
 * KeycardClient (I-024) — empty vs active render states (AC-142).
 *
 * AC-142a: no active booking → "No Active Booking" empty state + Book a Space link.
 * AC-142b: active booking → server-signed token rendered as a QR + booking details.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeycardClient, type ActiveBookingView } from "./KeycardClient";

// KeycardClient uses useRouter() to rotate the token via router.refresh().
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const activeBooking: ActiveBookingView = {
  id: "bk_active_1",
  facilityName: "Meeting Room A",
  startAt: "2026-06-21T09:00:00+07:00",
  endAt: "2026-06-21T11:00:00+07:00",
  durationHours: 2,
};

describe("KeycardClient (AC-142)", () => {
  it("AC-142a: renders the empty state when there is no active booking", () => {
    render(<KeycardClient booking={null} token="" />);
    expect(screen.getByText("No Active Booking")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Book a Space/i })).toHaveAttribute(
      "href",
      "/booking",
    );
    // Active-state card details must not render in the empty state.
    expect(screen.queryByText("AKTIF")).toBeNull();
    expect(screen.queryByText("Meeting Room A")).toBeNull();
  });

  it("AC-142b: renders the QR + booking details for an active booking", () => {
    const { container } = render(
      <KeycardClient booking={activeBooking} token="server-signed-token" />,
    );
    expect(screen.getByText("Meeting Room A")).toBeInTheDocument();
    expect(screen.getByText("Durasi: 2 jam")).toBeInTheDocument();
    expect(screen.getByText("AKTIF")).toBeInTheDocument();
    // The QR (QRCodeSVG) renders an <svg>.
    expect(container.querySelector("svg")).not.toBeNull();
    // Empty-state copy must not leak into the active state.
    expect(screen.queryByText("No Active Booking")).toBeNull();
  });
});
