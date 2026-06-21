"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  RefreshCw,
  Plus,
  Clock,
  User,
  Wallet,
  CheckCircle2,
  Play,
  Sofa,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { completeBookingAction } from "@/app/(admin)/admin/bookings/actions";
import type {
  BookingStatus,
  BookingPaymentStatus,
  BookingFacilityType,
  MembershipTier,
} from "@/lib/db/enums";

// ---------------------------------------------------------------------------
// View shape — DB Booking mapped for this component
// ---------------------------------------------------------------------------

export interface AdminBookingMember {
  name: string;
  email: string;
  tier: MembershipTier;
}

export interface AdminBookingView {
  id: string;
  facility: string;
  facilityType: BookingFacilityType;
  start: string; // ISO
  end: string; // ISO (active walk-ins fall back to start)
  durationHours: number;
  status: BookingStatus;
  payment: BookingPaymentStatus;
  amount: number;
  member: AdminBookingMember | null;
}

export interface BookingsClientProps {
  bookings: AdminBookingView[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format ISO timestamp -> "Sel, 12 Mei" (short weekday + day + month, id-ID) */
function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/** Format ISO timestamp -> "16.44" (24h, dot separator) */
function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(/:/g, ".");
}

/** Elapsed hours and minutes since a timestamp */
function elapsedSince(iso: string): { hours: number; minutes: number } {
  const ms = Date.now() - new Date(iso).getTime();
  const totalMinutes = Math.floor(ms / 60000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function statusBadgeTone(status: BookingStatus) {
  switch (status) {
    case "ACTIVE":
      return "active" as const;
    case "COMPLETED":
      return "completed" as const;
    case "CANCELLED":
      return "cancelled" as const;
  }
}

function statusLabel(status: BookingStatus): string {
  switch (status) {
    case "ACTIVE":
      return "Aktif";
    case "COMPLETED":
      return "Selesai";
    case "CANCELLED":
      return "Dibatalkan";
  }
}

function paymentBadgeTone(payment: BookingPaymentStatus) {
  switch (payment) {
    case "PAID_ONLINE":
      return "paid" as const;
    case "PAID_CASHIER":
      return "completed" as const;
    case "WAITING_CASHIER":
      return "pending" as const;
    case "PENDING":
      return "info" as const;
  }
}

function paymentLabel(payment: BookingPaymentStatus): string {
  switch (payment) {
    case "PAID_ONLINE":
      return "Bayar Online";
    case "PAID_CASHIER":
      return "Bayar Kasir";
    case "WAITING_CASHIER":
      return "Menunggu Kasir";
    case "PENDING":
      return "Pending";
  }
}

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

type FilterOption = "all" | "active" | "pending" | "confirmed";

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: "all", label: "Semua Booking" },
  { value: "active", label: "Booking Aktif" },
  { value: "pending", label: "Booking Pending" },
  { value: "confirmed", label: "Booking Confirmed" },
];

// ---------------------------------------------------------------------------
// Active booking card (walk-in style, green border)
// ---------------------------------------------------------------------------

interface ActiveBookingCardProps {
  booking: AdminBookingView;
  onComplete: (id: string) => void;
  pendingId: string | null;
}

function ActiveBookingCard({ booking, onComplete, pendingId }: ActiveBookingCardProps) {
  const member = booking.member;
  const elapsed = elapsedSince(booking.start);
  const isBusy = pendingId === booking.id;

  return (
    <div className="rounded-xl border-2 border-green-400 bg-white shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-green-500 px-4 py-3">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <Play size={14} className="fill-white text-white" />
          <span>🚶</span>
          <span>Walk-in Aktif</span>
        </div>
        <span className="rounded-full bg-green-700/60 px-3 py-0.5 text-xs font-medium text-white">
          Berjalan {elapsed.hours}j {elapsed.minutes}m
        </span>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3 bg-green-50/40">
        {/* Facility */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-100">
            <Sofa size={18} className="text-teal-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{booking.facility}</p>
            <p className="text-xs text-gray-500">
              Coworking Seat{" "}
              <span className="text-orange-500 font-medium">(Walk-in)</span>
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-green-200" />

        {/* Member */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User size={14} className="text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {member?.name ?? "—"}
              </p>
              <p className="text-xs text-gray-500">
                {member?.email ?? ""}
              </p>
            </div>
          </div>
          {member && (
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700">
              {member.tier}
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-green-200" />

        {/* Time */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock size={12} />
            <span>{formatDateShort(booking.start)}</span>
          </div>
          <p className="text-base font-bold text-gray-900">
            {formatTime(booking.start)} – sekarang
          </p>
          <p className="text-xs font-medium text-orange-500">
            Durasi terbuka (bayar saat selesai)
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-green-200" />

        {/* Payment */}
        <div className="flex items-center gap-2 text-sm">
          <Wallet size={14} className="text-gray-400" />
          <span className="text-orange-500 font-medium">💰 Bayar di Kasir</span>
        </div>

        {/* CTA — wired to completeBookingAction (ADMIN-only SoD). For a walk-in
            this computes the charge (ceil hours, cap 4h) and flips to COMPLETED. */}
        <button
          type="button"
          onClick={() => onComplete(booking.id)}
          disabled={isBusy}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-medium text-sm py-3 transition-colors"
        >
          <CheckCircle2 size={16} />
          Selesaikan Sesi &amp; Bayar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Booking table row
// ---------------------------------------------------------------------------

interface BookingRowProps {
  booking: AdminBookingView;
}

function BookingRow({ booking }: BookingRowProps) {
  const member = booking.member;

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      {/* Facility */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50">
            <CalendarDays size={14} className="text-teal-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{booking.facility}</p>
            <p className="text-xs text-gray-500">{booking.id}</p>
          </div>
        </div>
      </td>

      {/* Member */}
      <td className="px-4 py-3">
        {member ? (
          <div>
            <p className="text-sm font-medium text-gray-900">{member.name}</p>
            <p className="text-xs text-gray-500">{member.email}</p>
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">—</span>
        )}
      </td>

      {/* Time */}
      <td className="px-4 py-3">
        <p className="text-xs text-gray-500">{formatDateShort(booking.start)}</p>
        <p className="text-sm font-medium text-gray-900">
          {formatTime(booking.start)} – {formatTime(booking.end)}
        </p>
      </td>

      {/* Duration */}
      <td className="px-4 py-3">
        <span className="text-sm text-gray-700">{booking.durationHours} jam</span>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <Badge tone={statusBadgeTone(booking.status)}>
          {statusLabel(booking.status)}
        </Badge>
      </td>

      {/* Payment */}
      <td className="px-4 py-3">
        <Badge tone={paymentBadgeTone(booking.payment)}>
          {paymentLabel(booking.payment)}
        </Badge>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
            Detail
          </Button>
          {booking.status === "ACTIVE" && (
            <Button variant="primary" size="sm" className="h-8 px-2 text-xs">
              Selesaikan
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BookingsClient({ bookings }: BookingsClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<FilterOption>("active");
  const [dateFilter, setDateFilter] = useState("");
  // ponytail: dateFilter is captured but not applied — matches the original
  // mock surface (the input was decorative). Wiring it is a separate concern.
  const [pendingCompleteId, setPendingCompleteId] = useState<string | null>(null);

  const activeBookings = bookings.filter((b) => b.status === "ACTIVE");
  const pendingCount = bookings.filter((b) => b.payment === "WAITING_CASHIER").length;
  // ponytail: no CONFIRMED state in the booking domain (ACTIVE/COMPLETED/CANCELLED);
  // the "Confirmed" pill stays 0 to match the original surface.
  const confirmedCount = 0;
  const activeCount = activeBookings.length;

  const historyBookings = bookings.filter((b) => b.status !== "ACTIVE");

  async function handleComplete(id: string) {
    setPendingCompleteId(id);
    try {
      await completeBookingAction(id);
    } catch {
      // router.refresh() re-renders the true server state on failure.
    } finally {
      setPendingCompleteId(null);
    }
    startTransition(() => {
      router.refresh();
    });
  }

  function handleRefresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100">
            <CalendarDays size={22} className="text-teal-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Booking Management</h1>
            <p className="text-sm text-gray-500">Kelola booking fasilitas</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="md" className="gap-1.5" onClick={handleRefresh}>
            <RefreshCw size={15} />
            Refresh
          </Button>
          {/* ponytail: Tambah Booking stays a non-wired stub (no admin-create action yet). */}
          <Button variant="primary" size="md" className="gap-1.5">
            <Plus size={15} />
            Tambah Booking
          </Button>
        </div>
      </div>

      {/* Stats bar + filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Stats pills */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="text-sm text-gray-700">
              <span className="font-semibold">{pendingCount}</span> Pending
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            <span className="text-sm text-gray-700">
              <span className="font-semibold">{confirmedCount}</span> Confirmed
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <span className="text-sm text-gray-700">
              <span className="font-semibold">{activeCount}</span> Active
            </span>
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterOption)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
            }}
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
      </div>

      {/* Active booking cards (walk-in style) */}
      {(filter === "all" || filter === "active") && activeBookings.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Booking Aktif</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeBookings.map((b) => (
              <ActiveBookingCard
                key={b.id}
                booking={b}
                onComplete={handleComplete}
                pendingId={pendingCompleteId}
              />
            ))}
          </div>
        </div>
      )}

      {/* History table */}
      {(filter === "all" || filter === "pending" || filter === "confirmed") && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Fasilitas
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Member
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Waktu
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Durasi
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Pembayaran
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {historyBookings.map((b) => (
                  <BookingRow key={b.id} booking={b} />
                ))}
              </tbody>
            </table>
          </div>
          {historyBookings.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">
              Tidak ada booking ditemukan.
            </div>
          )}
        </Card>
      )}

      {/* Empty state when Filtering to active but no results */}
      {filter === "active" && activeBookings.length === 0 && (
        <Card className="py-12 text-center">
          <p className="text-sm text-gray-400">Tidak ada booking aktif saat ini.</p>
        </Card>
      )}
    </div>
  );
}
