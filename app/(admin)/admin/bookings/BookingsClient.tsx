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
  Banknote,
  QrCode,
  CreditCard,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  checkoutBookingAction,
  cancelBookingAction,
  activateBookingAction,
  createBookingAsAdminAction,
} from "@/app/(admin)/admin/bookings/actions";
import type {
  BookingStatus,
  BookingPaymentStatus,
  BookingFacilityType,
  BookingMode,
  MembershipTier,
} from "@/lib/db/enums";
import type { CheckoutPaymentMethod } from "@/lib/db/bookings";
import {
  AddBookingDialog,
  type AddBookingMemberOption,
  type AddBookingFacilityOption,
  type AddBookingValues,
} from "./AddBookingDialog";
import { bookingErrorMessage } from "./bookingErrors";

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
  bookingMode: BookingMode;
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
  /** Org's active members, for the "Tambah Booking" manual-create picker. */
  members?: AddBookingMemberOption[];
  /** Org's bookable facilities, for the "Tambah Booking" manual-create picker. */
  facilities?: AddBookingFacilityOption[];
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
    case "PENDING":
      return "pending" as const;
    case "CONFIRMED":
      return "info" as const;
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
    case "PENDING":
      return "Menunggu";
    case "CONFIRMED":
      return "Dikonfirmasi";
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
// Checkout payment chooser (cash/QRIS/credits — OBS-820, replaces the
// transitional cash-only completeBookingAction shim)
// ---------------------------------------------------------------------------

const CHECKOUT_OPTIONS: { value: CheckoutPaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: "cash", label: "Cash", icon: <Banknote className="h-3.5 w-3.5" /> },
  { value: "qris", label: "QRIS", icon: <QrCode className="h-3.5 w-3.5" /> },
  { value: "time_credits", label: "Time Credits", icon: <CreditCard className="h-3.5 w-3.5" /> },
];

interface CheckoutChooserProps {
  bookingId: string;
  /** [SEC] An already-prepaid (PAID_ONLINE) booking's base charge is already
   *  settled — Time Credits must not be offered as a checkout method for it
   *  (the server independently refuses to re-debit, but the UI shouldn't
   *  even suggest an action that settles nothing). */
  alreadyPrepaid: boolean;
  onCheckout: (id: string, method: CheckoutPaymentMethod) => void;
  onCancel: () => void;
  busy: boolean;
}

function CheckoutChooser({ bookingId, alreadyPrepaid, onCheckout, onCancel, busy }: CheckoutChooserProps) {
  const options = alreadyPrepaid
    ? CHECKOUT_OPTIONS.filter((opt) => opt.value !== "time_credits")
    : CHECKOUT_OPTIONS;
  return (
    <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50/60 p-3">
      <p className="text-xs font-medium text-gray-700">Pilih metode pembayaran</p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={busy}
            onClick={() => onCheckout(bookingId, opt.value)}
            className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-teal-400 hover:bg-teal-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="text-xs text-gray-500 underline hover:text-gray-700"
      >
        Batal
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active booking card (walk-in OR scheduled ACTIVE)
// ---------------------------------------------------------------------------

interface ActiveBookingCardProps {
  booking: AdminBookingView;
  checkoutOpen: boolean;
  onOpenCheckout: () => void;
  onCancelCheckout: () => void;
  onCheckout: (id: string, method: CheckoutPaymentMethod) => void;
  pendingId: string | null;
}

function ActiveBookingCard({
  booking,
  checkoutOpen,
  onOpenCheckout,
  onCancelCheckout,
  onCheckout,
  pendingId,
}: ActiveBookingCardProps) {
  const member = booking.member;
  const isWalkin = booking.bookingMode === "WALKIN";
  const elapsed = elapsedSince(booking.start);
  const isBusy = pendingId === booking.id;

  return (
    <div className="rounded-xl border-2 border-green-400 bg-white shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-green-500 px-4 py-3">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <Play size={14} className="fill-white text-white" />
          <span>{isWalkin ? "Walk-in Aktif" : "Sesi Terjadwal Aktif"}</span>
        </div>
        <span className="rounded-full bg-green-700/60 px-3 py-0.5 text-xs font-medium text-white">
          {isWalkin
            ? `Berjalan ${elapsed.hours}j ${elapsed.minutes}m`
            : `${formatTime(booking.start)} – ${formatTime(booking.end)}`}
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
              {booking.facilityType.replace(/_/g, " ")}{" "}
              {isWalkin && <span className="text-orange-500 font-medium">(Walk-in)</span>}
            </p>
          </div>
        </div>

        <div className="border-t border-green-200" />

        {/* Member */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User size={14} className="text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-900">{member?.name ?? "—"}</p>
              <p className="text-xs text-gray-500">{member?.email ?? ""}</p>
            </div>
          </div>
          {member && (
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700">
              {member.tier}
            </span>
          )}
        </div>

        <div className="border-t border-green-200" />

        {/* Time */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock size={12} />
            <span>{formatDateShort(booking.start)}</span>
          </div>
          {isWalkin ? (
            <>
              <p className="text-base font-bold text-gray-900">
                {formatTime(booking.start)} – sekarang
              </p>
              <p className="text-xs font-medium text-orange-500">
                Durasi terbuka (bayar saat selesai)
              </p>
            </>
          ) : (
            <p className="text-base font-bold text-gray-900">
              {booking.durationHours} jam terjadwal
            </p>
          )}
        </div>

        <div className="border-t border-green-200" />

        {/* Payment */}
        <div className="flex items-center gap-2 text-sm">
          <Wallet size={14} className="text-gray-400" />
          <span className="text-orange-500 font-medium">Bayar di Kasir</span>
        </div>

        {/* Checkout — cash/QRIS/credits chooser (OBS-820) */}
        {checkoutOpen ? (
          <CheckoutChooser
            bookingId={booking.id}
            alreadyPrepaid={booking.payment === "PAID_ONLINE"}
            onCheckout={onCheckout}
            onCancel={onCancelCheckout}
            busy={isBusy}
          />
        ) : (
          <button
            type="button"
            onClick={onOpenCheckout}
            disabled={isBusy}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-medium text-sm py-3 transition-colors"
          >
            <CheckCircle2 size={16} />
            Selesaikan Sesi &amp; Bayar
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Booking table row
// ---------------------------------------------------------------------------

interface BookingRowProps {
  booking: AdminBookingView;
  onActivate: (booking: AdminBookingView) => void;
  onRequestCancel: (booking: AdminBookingView) => void;
  pending: boolean;
  error?: string;
}

function BookingRow({ booking, onActivate, onRequestCancel, pending, error }: BookingRowProps) {
  const member = booking.member;
  const canActivate = booking.status === "CONFIRMED";
  const canCancel = booking.status === "PENDING" || booking.status === "CONFIRMED";

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
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-1">
            {canActivate && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs gap-1"
                onClick={() => onActivate(booking)}
                disabled={pending}
              >
                <Play size={12} aria-hidden="true" />
                {pending ? "Mengaktifkan…" : "Aktifkan Sekarang"}
              </Button>
            )}
            {canCancel && (
              <Button
                variant="danger"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => onRequestCancel(booking)}
                disabled={pending}
              >
                Batalkan
              </Button>
            )}
            {!canActivate && !canCancel && <span className="text-xs text-gray-400">—</span>}
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BookingsClient({ bookings, members = [], facilities = [] }: BookingsClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<FilterOption>("active");
  const [dateFilter, setDateFilter] = useState("");
  // ponytail: dateFilter is captured but not applied — matches the original
  // mock surface (the input was decorative). Wiring it is a separate concern.
  const [checkoutOpenId, setCheckoutOpenId] = useState<string | null>(null);
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null);
  const [addBookingOpen, setAddBookingOpen] = useState(false);
  const [rowPendingId, setRowPendingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [cancelTarget, setCancelTarget] = useState<AdminBookingView | null>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const activeBookings = bookings.filter((b) => b.status === "ACTIVE");
  const pendingCount = bookings.filter((b) => b.status === "PENDING").length;
  const confirmedCount = bookings.filter((b) => b.status === "CONFIRMED").length;
  const activeCount = activeBookings.length;

  const historyBookings = bookings.filter((b) => b.status !== "ACTIVE");

  async function handleCheckout(id: string, method: CheckoutPaymentMethod) {
    setPendingCheckoutId(id);
    try {
      await checkoutBookingAction(id, method);
    } catch {
      // router.refresh() re-renders the true server state on failure.
    } finally {
      setPendingCheckoutId(null);
      setCheckoutOpenId(null);
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

  async function handleActivate(booking: AdminBookingView) {
    setRowPendingId(booking.id);
    setRowErrors((prev) => {
      if (!(booking.id in prev)) return prev;
      const next = { ...prev };
      delete next[booking.id];
      return next;
    });
    try {
      await activateBookingAction(booking.id);
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setRowErrors((prev) => ({ ...prev, [booking.id]: bookingErrorMessage(e) }));
    } finally {
      setRowPendingId(null);
    }
  }

  function handleRequestCancel(booking: AdminBookingView) {
    setCancelTarget(booking);
    setCancelError(null);
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;
    setCancelPending(true);
    setCancelError(null);
    try {
      await cancelBookingAction(cancelTarget.id);
      setCancelTarget(null);
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setCancelError(bookingErrorMessage(e));
    } finally {
      setCancelPending(false);
    }
  }

  async function handleCreateBooking(values: AddBookingValues) {
    await createBookingAsAdminAction(values);
    setAddBookingOpen(false);
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
          <Button variant="primary" size="md" className="gap-1.5" onClick={() => setAddBookingOpen(true)}>
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

      {/* Active booking cards (walk-in + scheduled) */}
      {(filter === "all" || filter === "active") && activeBookings.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Booking Aktif</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeBookings.map((b) => (
              <ActiveBookingCard
                key={b.id}
                booking={b}
                checkoutOpen={checkoutOpenId === b.id}
                onOpenCheckout={() => setCheckoutOpenId(b.id)}
                onCancelCheckout={() => setCheckoutOpenId(null)}
                onCheckout={handleCheckout}
                pendingId={pendingCheckoutId}
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
                  <BookingRow
                    key={b.id}
                    booking={b}
                    onActivate={handleActivate}
                    onRequestCancel={handleRequestCancel}
                    pending={rowPendingId === b.id}
                    error={rowErrors[b.id]}
                  />
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

      {/* Tambah Booking — manual admin-create dialog */}
      {addBookingOpen && (
        <AddBookingDialog
          members={members}
          facilities={facilities}
          onCancel={() => setAddBookingOpen(false)}
          onSave={handleCreateBooking}
        />
      )}

      {/* Batalkan — cancel confirm dialog */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-booking-title"
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-md"
          >
            <h2 id="cancel-booking-title" className="text-lg font-semibold text-gray-900">
              Batalkan booking?
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Booking &quot;{cancelTarget.facility}&quot;
              {cancelTarget.member ? ` untuk ${cancelTarget.member.name}` : ""} akan dibatalkan. Tindakan ini
              tidak bisa dibatalkan.
            </p>
            {cancelError && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {cancelError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelPending}>
                Tutup
              </Button>
              <Button variant="danger" onClick={handleConfirmCancel} disabled={cancelPending}>
                {cancelPending ? "Membatalkan…" : "Batalkan Booking"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
