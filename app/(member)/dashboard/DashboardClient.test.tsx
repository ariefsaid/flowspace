/**
 * DashboardClient (unit/RTL) — member dashboard presentational leaf.
 *
 * Renders the active-walk-in banner when an active session is passed, and the
 * no-session variant when none. Verifies repo-sourced props render and that the
 * surface does not import lib/mock.
 *
 * [SEC] the QR token is a server-derived prop; the leaf never signs it.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  DashboardClient,
  type ActiveSessionView,
  type BookingPreviewView,
  type WifiView,
} from "./DashboardClient";

// DashboardClient renders QrAccessCard, which rotates the server token via
// router.refresh() (the token itself stays a server-derived prop).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("./actions", () => ({
  extendBookingAction: vi.fn().mockResolvedValue({}),
}));

const wifi: WifiView = { ssid: "FlowSpace-Guest", voucher: "6070-2020-85" };

const activeSession: ActiveSessionView = {
  bookingId: "bk_active",
  facilityName: "Meja F",
  bookingMode: "WALKIN",
  startAt: new Date(Date.now() - 65 * 60_000).toISOString(),
  endAt: null,
  ratePerHourRupiah: 15000,
  maxHours: 4,
};

const recentBookings: BookingPreviewView[] = [
  {
    id: "bk_1",
    facility: "Meja F",
    start: "2026-06-21T16:43:00+07:00",
    status: "ACTIVE",
  },
  {
    id: "bk_2",
    facility: "Meeting Room A",
    start: "2026-06-10T13:25:00+07:00",
    status: "COMPLETED",
  },
];

describe("DashboardClient", () => {
  it("renders balances, tier, QR token, and recent bookings from props (no-active)", () => {
    render(
      <DashboardClient
        firstName="Budi"
        hasSession={false}
        timeCredits={139}
        printBalance={68}
        tier="PREMIUM"
        qrToken="server-signed-token"
        activeSession={null}
        recentBookings={recentBookings}
        wifi={wifi}
      />,
    );

    // Greeting + balances
    expect(screen.getByText(/Selamat Datang, Budi!/)).toBeInTheDocument();
    expect(screen.getByText("139.0")).toBeInTheDocument();
    expect(screen.getByText("68")).toBeInTheDocument();
    expect(screen.getByText("PREMIUM")).toBeInTheDocument();

    // No-session variant
    expect(screen.getByText("Tidak Ada")).toBeInTheDocument();
    // The walk-in banner must NOT render without an active session.
    expect(screen.queryByText("Walk-in Aktif")).toBeNull();

    // AC-i049-4: without an active session, the QR/Akses-Cepat/WiFi block is
    // gated off entirely — the "Belum ada sesi aktif" CTA renders instead.
    expect(screen.queryByText(/QR Akses Pintu & Print/i)).toBeNull();
    expect(screen.getByText(/belum ada sesi aktif/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /book sekarang/i })).toHaveAttribute(
      "href",
      "/booking",
    );

    // Recent bookings preview
    expect(screen.getByText("Meeting Room A")).toBeInTheDocument();
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
  });

  it("renders the active walk-in banner when a session is passed", () => {
    render(
      <DashboardClient
        firstName="Budi"
        hasSession
        timeCredits={139}
        printBalance={68}
        tier="PREMIUM"
        qrToken="server-signed-token"
        activeSession={activeSession}
        recentBookings={recentBookings}
        wifi={wifi}
      />,
    );

    // The ActiveSessionCard shows the walk-in label + the table name. The
    // table name also appears in the recent-bookings preview (same ACTIVE
    // booking), so it legitimately renders more than once.
    expect(screen.getByText("Walk-in Aktif")).toBeInTheDocument();
    expect(screen.getAllByText("Meja F").length).toBeGreaterThan(0);
    // Status tile flips to AKTIF.
    expect(screen.getAllByText("AKTIF").length).toBeGreaterThan(0);
    // No-session copy must not leak in.
    expect(screen.queryByText("Tidak Ada")).toBeNull();

    // AC-i049-4: with an active session, QR/Akses-Cepat/WiFi renders (and the
    // no-session CTA does not).
    expect(screen.getByText(/QR Akses Pintu & Print/i)).toBeInTheDocument();
    expect(screen.queryByText(/belum ada sesi aktif/i)).toBeNull();
  });

  it("design-review: PENDING/CONFIRMED bookings get their own badge tone, not the CANCELLED red catch-all", () => {
    render(
      <DashboardClient
        firstName="Budi"
        hasSession={false}
        timeCredits={139}
        printBalance={68}
        tier="PREMIUM"
        qrToken="server-signed-token"
        activeSession={null}
        recentBookings={[
          { id: "bk_p", facility: "Meja P", start: "2026-06-21T16:43:00+07:00", status: "PENDING" },
          { id: "bk_c", facility: "Meja C", start: "2026-06-20T16:43:00+07:00", status: "CONFIRMED" },
          { id: "bk_x", facility: "Meja X", start: "2026-06-19T16:43:00+07:00", status: "CANCELLED" },
        ]}
        wifi={wifi}
      />,
    );

    const pendingBadge = screen.getByText("PENDING");
    expect(pendingBadge).toHaveClass("bg-amber-100", "text-amber-700");
    expect(pendingBadge).not.toHaveClass("bg-red-100", "text-red-700");

    const confirmedBadge = screen.getByText("CONFIRMED");
    expect(confirmedBadge).toHaveClass("bg-teal-100", "text-teal-700");
    expect(confirmedBadge).not.toHaveClass("bg-red-100", "text-red-700");

    const cancelledBadge = screen.getByText("CANCELLED");
    expect(cancelledBadge).toHaveClass("bg-red-100", "text-red-700");
  });

  it("design-review: 'Status Sesi' no-session copy uses a neutral tone, not green (positive)", () => {
    render(
      <DashboardClient
        firstName="Budi"
        hasSession={false}
        timeCredits={139}
        printBalance={68}
        tier="PREMIUM"
        qrToken="server-signed-token"
        activeSession={null}
        recentBookings={[]}
        wifi={wifi}
      />,
    );
    const noSession = screen.getByText("Tidak Ada");
    expect(noSession).not.toHaveClass("text-green-600");
  });

  it("design-review: recent bookings empty state renders a message instead of nothing", () => {
    render(
      <DashboardClient
        firstName="Budi"
        hasSession={false}
        timeCredits={139}
        printBalance={68}
        tier="PREMIUM"
        qrToken="server-signed-token"
        activeSession={null}
        recentBookings={[]}
        wifi={wifi}
      />,
    );
    expect(screen.getByText(/Belum ada riwayat/i)).toBeInTheDocument();
  });

  it.each([
    ["REGULAR", ["bg-slate-100", "text-slate-700"]],
    ["PREMIUM", ["bg-amber-100", "text-amber-700"]],
    ["GOLD", ["bg-purple-100", "text-purple-700"]],
  ] as const)(
    "AC-i049-5: %s tier badge uses its own tone",
    (tier, expectedClasses) => {
      render(
        <DashboardClient
          firstName="Budi"
          hasSession={false}
          timeCredits={139}
          printBalance={68}
          tier={tier}
          qrToken="server-signed-token"
          activeSession={null}
          recentBookings={[]}
          wifi={wifi}
        />,
      );
      const badge = screen.getByText(tier);
      expect(badge).toHaveClass(...expectedClasses);
    },
  );

  it("AC-i049-9: WiFi voucher is hidden until 'Get Voucher' is clicked, only inside the session-gated block", () => {
    render(
      <DashboardClient
        firstName="Budi"
        hasSession
        timeCredits={139}
        printBalance={68}
        tier="PREMIUM"
        qrToken="server-signed-token"
        activeSession={activeSession}
        recentBookings={recentBookings}
        wifi={wifi}
      />,
    );

    expect(screen.queryByText(wifi.voucher)).not.toBeInTheDocument();
    const revealBtn = screen.getByRole("button", { name: /get voucher/i });
    fireEvent.click(revealBtn);
    expect(screen.getByText(wifi.voucher)).toBeInTheDocument();
  });

  it("AC-i049-9: no WiFi card at all when there is no active session", () => {
    render(
      <DashboardClient
        firstName="Budi"
        hasSession={false}
        timeCredits={139}
        printBalance={68}
        tier="PREMIUM"
        qrToken="server-signed-token"
        activeSession={null}
        recentBookings={[]}
        wifi={wifi}
      />,
    );
    expect(screen.queryByText(/wifi access/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /get voucher/i })).not.toBeInTheDocument();
  });

  it("no-mock-import gate: dashboard surface files do not import lib/mock", async () => {
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
