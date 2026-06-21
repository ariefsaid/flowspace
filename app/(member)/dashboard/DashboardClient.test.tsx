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
import { render, screen } from "@testing-library/react";
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

const wifi: WifiView = { ssid: "FlowSpace-Guest", voucher: "6070-2020-85" };

const activeSession: ActiveSessionView = {
  table: "Meja F",
  tarifPerHour: 15000,
  maxHours: 4,
  startedAt: "2026-06-21T16:43:00+07:00",
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
    const { container } = render(
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

    // QR renders the server token as an <svg>.
    expect(container.querySelector("svg")).not.toBeNull();

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
