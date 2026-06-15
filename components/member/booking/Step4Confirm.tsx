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
} from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { BookingType } from "./Step1Type";
import type { TimeSelection } from "./Step2Time";
import type { PlaceSelection } from "./Step3Place";

const TYPE_META: Record<
  BookingType,
  { label: string; icon: React.ReactNode; ratePerHour: number | null; note: string }
> = {
  "walkin-coworking": {
    label: "Walk-in Coworking",
    icon: <Zap className="h-5 w-5 text-orange-500" />,
    ratePerHour: 15000,
    note: "Bayar di kasir saat selesai",
  },
  "walkin-meeting": {
    label: "Walk-in Meeting Room",
    icon: <Users className="h-5 w-5 text-orange-500" />,
    ratePerHour: 120000,
    note: "Mulai sekarang · Bayar di kasir",
  },
  "scheduled-coworking": {
    label: "Coworking Seat",
    icon: <Monitor className="h-5 w-5 text-teal-600" />,
    ratePerHour: 20000,
    note: "Reservasi jadwal",
  },
  "scheduled-meeting": {
    label: "Meeting Room",
    icon: <Users className="h-5 w-5 text-teal-600" />,
    ratePerHour: 120000,
    note: "Reservasi jadwal · Proyektor & whiteboard",
  },
  "scheduled-fullroom": {
    label: "Full Room Event",
    icon: <Building2 className="h-5 w-5 text-purple-500" />,
    ratePerHour: null,
    note: "Tim kami akan menghubungi Anda untuk konfirmasi harga",
  },
};

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
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
          {label}
        </p>
        <p className="text-sm text-gray-900 font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}

interface Step4ConfirmProps {
  bookingType: BookingType;
  time: TimeSelection;
  place: PlaceSelection;
  onConfirm: () => void;
  confirmed: boolean;
}

export function Step4Confirm({
  bookingType,
  time,
  place,
  onConfirm,
  confirmed,
}: Step4ConfirmProps) {
  const meta = TYPE_META[bookingType];
  const isWalkin =
    bookingType === "walkin-coworking" || bookingType === "walkin-meeting";
  const isFullRoom = bookingType === "scheduled-fullroom";

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
        const fmt = (hh: number, mm: number) =>
          `${String(hh).padStart(2, "0")}.${String(mm).padStart(2, "0")}`;
        return `${fmt(h, m)} – ${fmt(endH, m)} WIB`;
      })()
    : "-";

  const totalCost =
    meta.ratePerHour !== null ? meta.ratePerHour * time.durationHours : null;

  if (confirmed) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100">
          <CheckCircle2 className="h-8 w-8 text-teal-600" />
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900">
            Booking Dikonfirmasi!
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {isFullRoom
              ? "Tim kami akan menghubungi Anda segera untuk konfirmasi harga dan jadwal."
              : `Nomor booking Anda telah dibuat. ${isWalkin ? "Tunjukkan ke kasir saat tiba." : "Cek email untuk detail akses."}`}
          </p>
        </div>
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-6 py-3 text-sm text-teal-700 font-medium">
          #BK{Math.floor(Math.random() * 90000 + 10000)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-sm text-gray-500">
        Periksa detail booking Anda sebelum mengkonfirmasi.
      </p>

      <Card className="divide-y divide-slate-100 p-0 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 flex items-center gap-2">
          {meta.icon}
          <div>
            <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
            <p className="text-xs text-gray-500">{meta.note}</p>
          </div>
        </div>
        <div className="px-4">
          <ConfirmRow
            icon={<MapPin className="h-4 w-4 text-teal-600" />}
            label="Tempat"
            value={place.label}
          />
          <ConfirmRow
            icon={<CalendarDays className="h-4 w-4 text-teal-600" />}
            label="Tanggal"
            value={dateLabel}
          />
          <ConfirmRow
            icon={<Clock className="h-4 w-4 text-teal-600" />}
            label={isWalkin ? "Estimasi Durasi" : "Waktu"}
            value={
              isWalkin
                ? `${time.durationHours} jam (estimasi)`
                : `${timeLabel} · ${time.durationHours} jam`
            }
          />
        </div>
      </Card>

      {/* Cost estimate */}
      {totalCost !== null ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {isWalkin ? "Estimasi biaya" : "Total biaya"}
            </span>
            <span className="font-semibold text-gray-900">
              {formatRupiah(totalCost)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
            <span>
              {formatRupiah(meta.ratePerHour!)} × {time.durationHours} jam
            </span>
            {isWalkin && (
              <span className="text-amber-600 font-medium">
                Dibayar di kasir
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-700">
          Harga akan dikonfirmasi oleh tim kami setelah booking diterima.
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={onConfirm}
      >
        <CheckCircle2 className="h-5 w-5" />
        Konfirmasi Booking
      </Button>
    </div>
  );
}
