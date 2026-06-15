"use client";

import Link from "next/link";
import {
  Clock,
  Printer,
  CreditCard,
  Wallet,
  ShoppingBag,
  CalendarDays,
  ChevronRight,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatTile } from "@/components/ui/StatTile";
import { ActiveSessionCard } from "@/components/member/ActiveSessionCard";
import { QrAccessCard } from "@/components/member/QrAccessCard";
import { WifiCard } from "@/components/member/WifiCard";
import { currentMember } from "@/lib/mock/member";
import { wifiInfo } from "@/lib/mock/print";
import { bookings } from "@/lib/mock/bookings";
import { formatDateID } from "@/lib/format";
import { brand } from "@/brand.config";

// ---------------------------------------------------------------------------
// Booking status helpers
// ---------------------------------------------------------------------------

type BookingStatus = (typeof bookings)[number]["status"];
type PaymentStatus = (typeof bookings)[number]["payment"];

function statusBadgeTone(
  status: BookingStatus,
): "active" | "completed" | "cancelled" {
  if (status === "ACTIVE") return "active";
  if (status === "COMPLETED") return "completed";
  return "cancelled";
}

function statusLabel(status: BookingStatus): string {
  if (status === "ACTIVE") return "AKTIF";
  if (status === "COMPLETED") return "Selesai";
  return "Dibatalkan";
}

function paymentLabel(payment: PaymentStatus): string {
  if (payment === "PAID_CASHIER") return "Bayar Kasir";
  if (payment === "PAID_ONLINE") return "Bayar Online";
  return "Menunggu Kasir";
}

function paymentTone(payment: PaymentStatus): "paid" | "pending" | "active" {
  if (payment === "PAID_CASHIER" || payment === "PAID_ONLINE") return "paid";
  if (payment === "WAITING_CASHIER") return "pending";
  return "active";
}

// ---------------------------------------------------------------------------
// Main Menu grid items
// ---------------------------------------------------------------------------

const MENU_ITEMS = [
  {
    href: "/cafe",
    icon: ShoppingBag,
    label: "Order Cafe",
    sub: "Makanan & minuman",
    gradient: "from-orange-500 to-orange-600",
  },
  {
    href: "/booking",
    icon: CalendarDays,
    label: "Booking",
    sub: "Meja & meeting room",
    gradient: "from-teal-500 to-teal-600",
  },
  {
    href: "/print",
    icon: Printer,
    label: "Print / Fotocopy",
    sub: `Saldo: ${currentMember.printBalance} halaman`,
    gradient: "from-purple-500 to-purple-600",
  },
  {
    href: "/topup",
    icon: Wallet,
    label: "Top Up",
    sub: "Credits & print balance",
    gradient: "from-blue-500 to-blue-600",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const firstName = currentMember.name.split(" ")[0];
const hasSession = currentMember.activeSession !== null;

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* ── Greeting ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Selamat Datang, {firstName}!
        </h1>
        <p className="mt-1 text-gray-500">
          {hasSession
            ? `Sesi aktif di ${currentMember.activeSession!.table} — selamat bekerja di ${brand.name}!`
            : `Selamat datang kembali di ${brand.name}!`}
        </p>
      </div>

      {/* ── Row 1: Active Session + QR + Quick Links ─────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Active Session card */}
        {hasSession && (
          <ActiveSessionCard session={currentMember.activeSession!} />
        )}

        {/* Right: QR + Akses Cepat stacked */}
        <div className="flex flex-col gap-6">
          {/* QR */}
          <QrAccessCard memberId={currentMember.id} />

          {/* Akses Cepat Fasilitas */}
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">
              Akses Cepat Fasilitas
            </h3>
            <div className="flex flex-col gap-2">
              {/* Order Cafe */}
              <Link
                href="/cafe"
                className="flex items-center justify-between rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 text-white shadow-md transition-opacity hover:opacity-90"
              >
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  <div>
                    <p className="text-sm font-semibold">Order Makanan &amp; Minuman</p>
                    <p className="text-xs text-orange-100">Menu cafe tersedia</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 opacity-80" />
              </Link>

              {/* Print */}
              <Link
                href="/print"
                className="flex items-center justify-between rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-4 py-3 text-white shadow-md transition-opacity hover:opacity-90"
              >
                <div className="flex items-center gap-2">
                  <Printer className="h-5 w-5" />
                  <div>
                    <p className="text-sm font-semibold">Print / Fotocopy</p>
                    <p className="text-xs text-purple-100">
                      Saldo: {currentMember.printBalance} halaman
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 opacity-80" />
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* ── WiFi ─────────────────────────────────────────────── */}
      <WifiCard wifi={wifiInfo} />

      {/* ── Menu Utama ───────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">
          Menu Utama
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${item.gradient} shadow-sm`}
              >
                <item.icon className="h-6 w-6 text-white" />
              </div>
              <p className="text-center text-sm font-semibold text-gray-800">
                {item.label}
              </p>
              <p className="text-center text-xs text-gray-500">{item.sub}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Stat Tiles ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Time Credits"
          value={`${currentMember.timeCredits.toFixed(1)}`}
          unit="jam tersisa"
          icon={Clock}
          accent="teal"
        />
        <StatTile
          label="Print Balance"
          value={currentMember.printBalance}
          unit="halaman"
          icon={Printer}
          accent="purple"
        />
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Membership</p>
            <p className="mt-1 truncate text-lg font-bold text-gray-900">
              {currentMember.tier}
            </p>
            <p className="text-xs text-gray-500">{currentMember.tierLabel}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <CreditCard className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Status Sesi</p>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {hasSession ? "AKTIF" : "Tidak Ada"}
            </p>
            <p className="text-xs text-gray-500">
              {hasSession ? "Fasilitas ready" : "Mulai sesi baru"}
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
            <Zap className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* ── Riwayat Booking preview ──────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            Riwayat Booking
          </h2>
          <Link
            href="/history"
            className="flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            Lihat Semua
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <Card className="divide-y divide-slate-100 p-0 overflow-hidden">
          {bookings.slice(0, 5).map((booking) => (
            <div
              key={booking.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{booking.facility}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatDateID(booking.start)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={statusBadgeTone(booking.status)}>
                  {statusLabel(booking.status)}
                </Badge>
                <Badge tone={paymentTone(booking.payment)}>
                  {paymentLabel(booking.payment)}
                </Badge>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
