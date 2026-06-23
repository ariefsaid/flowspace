"use client";

import Link from "next/link";
import {
  Clock,
  Printer,
  CreditCard,
  Coffee,
  CalendarDays,
  ArrowRight,
  TrendingUp,
  MapPin,
  Utensils,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActiveSessionCard } from "@/components/member/ActiveSessionCard";
import { QrAccessCard } from "@/components/member/QrAccessCard";
import { WifiCard } from "@/components/member/WifiCard";
import { formatDateID } from "@/lib/format";
import { brand } from "@/brand.config";
import type { MembershipTier } from "@/lib/db/enums";

// ---------------------------------------------------------------------------
// View shapes — structurally compatible with the shared leaf components'
// prop types (ActiveSessionCard, WifiCard); declared locally, no shared mock module.
// ---------------------------------------------------------------------------

export type ActiveSessionView = {
  /** Facility label, e.g. "Meja F". */
  table: string;
  /** Hourly rate in Rupiah (server-stored on the booking row). */
  tarifPerHour: number;
  /** Max billable hours (walk-in cap = 4). */
  maxHours: number;
  /** ISO timestamp when the walk-in session started. */
  startedAt: string;
};

export type BookingPreviewView = {
  id: string;
  /** Facility label. */
  facility: string;
  /** ISO start timestamp. */
  start: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
};

export type WifiView = {
  ssid: string;
  voucher: string;
};

export interface DashboardClientProps {
  firstName: string;
  /** True when there is an active walk-in session (drives the banner + tiles). */
  hasSession: boolean;
  timeCredits: number;
  printBalance: number;
  tier: MembershipTier;
  /** Server-signed, window-rotating QR token (lib/keycard/token). [SEC] */
  qrToken: string;
  activeSession: ActiveSessionView | null;
  recentBookings: BookingPreviewView[];
  /** SIMULATED seeded WiFi credentials (UniFi integration deferred). */
  wifi: WifiView;
}

// ---------------------------------------------------------------------------
// Booking status helpers
// ---------------------------------------------------------------------------

function statusBadgeTone(
  status: BookingPreviewView["status"],
): "completed" | "neutral" | "cancelled" {
  if (status === "ACTIVE") return "completed";
  if (status === "COMPLETED") return "neutral";
  return "cancelled";
}

// Riwayat preview shows the raw (English) status label, matching the original.
function statusLabel(status: BookingPreviewView["status"]): string {
  return status;
}

// ---------------------------------------------------------------------------
// Main Menu grid items
// ---------------------------------------------------------------------------

function buildMenuItems(props: {
  printBalance: number;
}) {
  return [
    {
      href: "/cafe",
      icon: Coffee,
      label: "Order Cafe",
      sub: "Makanan & minuman",
      color: "text-orange-500",
    },
    {
      href: "/booking",
      icon: CalendarDays,
      label: "Booking",
      sub: "Meeting room & coworking",
      color: "text-teal-600",
    },
    {
      href: "/print",
      icon: Printer,
      label: "Print / Fotocopy",
      sub: `Saldo: ${props.printBalance} halaman`,
      color: "text-purple-500",
    },
    {
      href: "/topup",
      icon: CreditCard,
      label: "Top Up",
      sub: "Credits & print balance",
      color: "text-teal-600",
    },
  ];
}

// ponytail: tier label is decorative copy. The real per-tier labels are masked
// (owner-config); until then a generic map keyed on the MembershipTier enum.
const TIER_LABEL: Record<MembershipTier, string> = {
  REGULAR: "Tarif standar",
  PREMIUM: "Member diskon",
  GOLD: "Member diskon",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DashboardClient({
  firstName,
  hasSession,
  timeCredits,
  printBalance,
  tier,
  qrToken,
  activeSession,
  recentBookings,
  wifi,
}: DashboardClientProps) {
  const MENU_ITEMS = buildMenuItems({ printBalance });

  return (
    <div className="space-y-6">
      {/* ── Greeting ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Selamat Datang, {firstName}!
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {hasSession
            ? `Anda memiliki sesi aktif. Nikmati fasilitas ${brand.name}!`
            : `Selamat datang kembali di ${brand.name}!`}
        </p>
      </div>

      {/* ── Active Session hero + QR / Akses Cepat / WiFi ────── */}
      <div className="overflow-hidden rounded-xl border-2 border-teal-500 bg-white shadow-md">
        {hasSession && activeSession && (
          <ActiveSessionCard session={activeSession} />
        )}

        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
          {/* Left: QR */}
          <div className="flex items-start justify-center">
            <QrAccessCard token={qrToken} />
          </div>

          {/* Right: Akses Cepat + WiFi */}
          <div className="flex flex-col gap-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
              <Utensils className="h-4 w-4 text-orange-500" />
              Akses Cepat Fasilitas
            </h3>

            {/* Order Cafe */}
            <Link
              href="/cafe"
              className="flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 text-white shadow-md transition-opacity hover:opacity-90"
            >
              <Coffee className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Order Makanan &amp; Minuman</p>
                <p className="text-xs text-orange-100">
                  Diskon khusus member aktif!
                </p>
              </div>
            </Link>

            {/* Print */}
            <Link
              href="/print"
              className="flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-4 py-3 text-white shadow-md transition-opacity hover:opacity-90"
            >
              <Printer className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Print / Fotocopy</p>
                <p className="text-xs text-purple-100">
                  Saldo: {printBalance} halaman
                </p>
              </div>
            </Link>

            {/* WiFi */}
            <WifiCard wifi={wifi} />
          </div>
        </div>
      </div>

      {/* ── Menu Utama ───────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Menu Utama</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border border-teal-500 bg-white p-4 transition-colors hover:bg-teal-50/40"
            >
              <item.icon className={`h-6 w-6 shrink-0 ${item.color}`} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-teal-700">
                  {item.label}
                </p>
                <p className="truncate text-xs text-gray-500">{item.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {/* ── Stat Tiles ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Time Credits */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Time Credits</p>
            <p className="mt-1 text-2xl font-bold text-teal-600">
              {timeCredits.toFixed(1)}
            </p>
            <p className="text-xs text-gray-500">jam tersisa</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>

        {/* Print Balance */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Print Balance</p>
            <p className="mt-1 text-2xl font-bold text-purple-600">
              {printBalance}
            </p>
            <p className="text-xs text-gray-500">halaman tersedia</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <Printer className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>

        {/* Membership */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Membership</p>
            <span className="mt-1 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              {tier}
            </span>
            <p className="mt-1 text-xs text-gray-500">{TIER_LABEL[tier]}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
            <TrendingUp className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>

        {/* Status Sesi */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Status Sesi</p>
            <p className="mt-1 text-sm font-bold text-green-600">
              {hasSession ? "AKTIF" : "Tidak Ada"}
            </p>
            <p className="text-xs text-gray-500">
              {hasSession ? "Fasilitas ready" : "Mulai sesi baru"}
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600">
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* ── Riwayat Booking preview ──────────────────────────── */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Riwayat Booking
          </h2>
          <Link
            href="/history"
            className="flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            Lihat Semua
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="space-y-3">
          {recentBookings.map((booking) => (
            <div
              key={booking.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{booking.facility}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatDateID(booking.start)}
                </p>
              </div>
              <Badge tone={statusBadgeTone(booking.status)}>
                {statusLabel(booking.status)}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
