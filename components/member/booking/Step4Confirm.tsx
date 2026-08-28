"use client";

import {
  CalendarDays,
  Clock,
  MapPin,
  Zap,
  Users,
  Monitor,
  Building2,
  CheckCircle2,
  CreditCard,
  Wallet,
  Banknote,
} from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { computeBookingPrice, resolveDiscountPct } from "@/lib/booking/pricing";
import { WALKIN_RATES } from "@/lib/booking/catalog";
import { wizardTypeToFacilityType, isWalkinBookingType } from "@/lib/booking/wizard-type";
import type { BookingType } from "./Step1Type";
import type { TimeSelection } from "./Step2Time";
import type { FacilitySeat } from "./FloorPlan";
import type { BookingPaymentChoice } from "@/lib/db/bookings";
import type { BookingStatus, BookingPaymentStatus } from "@/lib/db/enums";

const TYPE_LABEL: Record<BookingType, { label: string; icon: React.ReactNode; note: string }> = {
  "walkin-coworking": {
    label: "Walk-in Coworking",
    icon: <Zap className="h-5 w-5 text-orange-500" />,
    note: "Bayar di kasir saat selesai",
  },
  "walkin-meeting": {
    label: "Walk-in Meeting Room",
    icon: <Users className="h-5 w-5 text-orange-500" />,
    note: "Mulai sekarang · Bayar di kasir",
  },
  "scheduled-coworking": {
    label: "Coworking Seat",
    icon: <Monitor className="h-5 w-5 text-teal-600" />,
    note: "Reservasi jadwal",
  },
  "scheduled-meeting": {
    label: "Meeting Room",
    icon: <Users className="h-5 w-5 text-teal-600" />,
    note: "Reservasi jadwal · Proyektor & whiteboard",
  },
  "scheduled-fullroom": {
    label: "Full Room Event",
    icon: <Building2 className="h-5 w-5 text-purple-500" />,
    note: "Reservasi jadwal · Seluruh ruangan coworking",
  },
};

const PAYMENT_OPTIONS: { value: BookingPaymentChoice; label: string; icon: React.ReactNode }[] = [
  { value: "online", label: "Online", icon: <CreditCard className="h-4 w-4" /> },
  { value: "time_credits", label: "Time Credits", icon: <Wallet className="h-4 w-4" /> },
  { value: "cashier", label: "Bayar di Kasir", icon: <Banknote className="h-4 w-4" /> },
];

interface ConfirmRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function ConfirmRow({ icon, label, value }: ConfirmRowProps) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-900 font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}

/** The REAL server response after createBookingAction resolves — the "honest success state" (no fabricated numbers). */
export type CreatedBookingResult = {
  id: string;
  status: BookingStatus;
  paymentStatus: BookingPaymentStatus;
  amountRupiah: number;
  baseAmountRupiah: number;
  discountRupiah: number;
  facilityName: string;
};

interface Step4ConfirmProps {
  bookingType: BookingType;
  time: TimeSelection;
  place: FacilitySeat;
  discounts: { coworkingDiscountPct: number; meetingDiscountPct: number };
  paymentMethod: BookingPaymentChoice;
  onPaymentMethodChange: (m: BookingPaymentChoice) => void;
  policyAccepted: boolean;
  onPolicyAcceptedChange: (v: boolean) => void;
  onConfirm: () => void;
  submitting: boolean;
  result: CreatedBookingResult | null;
  /** The member's real time-credit balance (server-resolved, display-only —
   *  surfaced here so it is visible at the payment decision point). */
  timeCredits: number;
}

export function Step4Confirm({
  bookingType,
  time,
  place,
  discounts,
  paymentMethod,
  onPaymentMethodChange,
  policyAccepted,
  onPolicyAcceptedChange,
  onConfirm,
  submitting,
  result,
  timeCredits,
}: Step4ConfirmProps) {
  const meta = TYPE_LABEL[bookingType];
  const isWalkin = isWalkinBookingType(bookingType);
  const facilityType = wizardTypeToFacilityType(bookingType);

  const dateLabel = time.date
    ? new Date(time.date + "T00:00:00").toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "-";

  const timeLabel = isWalkin
    ? "Segera"
    : time.startTime
      ? (() => {
          const [h, m] = time.startTime.split(":").map(Number);
          const endH = h + time.durationHours;
          const fmt = (hh: number, mm: number) => `${String(hh).padStart(2, "0")}.${String(mm).padStart(2, "0")}`;
          return `${fmt(h, m)} – ${fmt(endH, m)} WIB`;
        })()
      : "-";

  // Estimate math: real hourly rate (walk-in's is the single server-authoritative
  // WALKIN_RATES constant; scheduled's is the actual selected facility's rate),
  // and the member's real tier-discount dimension — never a hardcoded per-type
  // table. The FINAL amount is always server-computed inside createBooking; this
  // is a preview only (labeled "Estimasi").
  const ratePerHourRupiah = isWalkin
    ? WALKIN_RATES[facilityType as "WALKIN_COWORKING" | "WALKIN_MEETING"]
    : place.ratePerHourRupiah;
  const discountPct = resolveDiscountPct(facilityType, discounts);
  const estimate = computeBookingPrice({
    hours: time.durationHours,
    ratePerHourRupiah,
    discountPct,
  });

  if (result) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100">
          <CheckCircle2 className="h-8 w-8 text-teal-600" />
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900">Booking Dikonfirmasi!</p>
          <p className="text-sm text-gray-500 mt-1">
            {result.status === "CONFIRMED"
              ? "Booking Anda dikonfirmasi dan siap digunakan."
              : "Booking Anda dibuat dan menunggu konfirmasi kasir."}
          </p>
        </div>
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-6 py-4 text-sm text-teal-700 space-y-1">
          <p>
            Status: <strong>{result.status}</strong> · Pembayaran: <strong>{result.paymentStatus}</strong>
          </p>
          <p>
            Total: <strong>{formatRupiah(result.amountRupiah)}</strong>
            {result.discountRupiah > 0 && (
              <span className="text-teal-600"> (diskon {formatRupiah(result.discountRupiah)})</span>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-sm text-gray-500">Periksa detail booking Anda sebelum mengkonfirmasi.</p>

      <Card className="divide-y divide-slate-100 p-0 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 flex items-center gap-2">
          {meta.icon}
          <div>
            <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
            <p className="text-xs text-gray-500">{meta.note}</p>
          </div>
        </div>
        <div className="px-4">
          <ConfirmRow icon={<MapPin className="h-4 w-4 text-teal-600" />} label="Tempat" value={place.label} />
          <ConfirmRow icon={<CalendarDays className="h-4 w-4 text-teal-600" />} label="Tanggal" value={dateLabel} />
          <ConfirmRow
            icon={<Clock className="h-4 w-4 text-teal-600" />}
            label={isWalkin ? "Estimasi Durasi" : "Waktu"}
            value={isWalkin ? `${time.durationHours} jam (estimasi)` : `${timeLabel} · ${time.durationHours} jam`}
          />
        </div>
      </Card>

      {/* Cost estimate — server-sourced rate + tier discount, never a hardcoded per-type table */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Estimasi biaya</span>
          <span className="font-semibold text-gray-900">{formatRupiah(estimate.amountRupiah)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
          <span>
            {formatRupiah(ratePerHourRupiah)} × {time.durationHours} jam
            {estimate.discountRupiah > 0 && ` − diskon ${formatRupiah(estimate.discountRupiah)}`}
          </span>
          {isWalkin && <span className="text-amber-600 font-medium">Dibayar di kasir</span>}
        </div>
      </div>

      {/* Payment method — scheduled bookings only; walk-in is always pay-at-cashier (OBS-808) */}
      {!isWalkin && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700 mb-1">Metode Pembayaran</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Metode Pembayaran">
            {PAYMENT_OPTIONS.map((opt) => {
              const isTimeCredits = opt.value === "time_credits";
              const noBalance = isTimeCredits && timeCredits <= 0;
              return (
                <label
                  key={opt.value}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-2.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-500 has-[:focus-visible]:ring-offset-2 ${
                    noBalance
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                      : paymentMethod === opt.value
                        ? "cursor-pointer border-teal-500 bg-teal-50 text-teal-700"
                        : "cursor-pointer border-slate-200 bg-white text-gray-600 hover:border-teal-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={opt.value}
                    checked={paymentMethod === opt.value}
                    disabled={noBalance}
                    onChange={() => onPaymentMethodChange(opt.value)}
                    className="sr-only"
                  />
                  {opt.icon}
                  {opt.label}
                  {isTimeCredits && (
                    <span className={noBalance ? "text-slate-400" : "text-gray-500"}>
                      {noBalance ? "Saldo habis" : `${timeCredits.toFixed(1)} jam`}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Policy-acceptance checkbox — gates the confirm button (AC-849) */}
      <label className="flex items-start gap-2.5 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={policyAccepted}
          onChange={(e) => onPolicyAcceptedChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 accent-teal-600 cursor-pointer"
        />
        <span>
          Saya menyetujui kebijakan pembatalan &amp; pembayaran{" "}
          <span className="font-medium text-gray-900">FlowSpace</span>
        </span>
      </label>

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={onConfirm}
        disabled={!policyAccepted || submitting}
      >
        <CheckCircle2 className="h-5 w-5" />
        {submitting ? "Memproses..." : "Konfirmasi Booking"}
      </Button>
    </div>
  );
}
