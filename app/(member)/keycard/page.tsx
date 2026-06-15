"use client";

import Link from "next/link";
import { QrCode, Calendar } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { bookings } from "@/lib/mock/bookings";
import type { Booking } from "@/lib/mock/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO datetime to a readable Indonesian-locale string. */
function formatDatetime(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

/** Build the QR payload string for a booking. */
function buildQrValue(booking: Booking): string {
  return `FLOWSPACE:keycard:${booking.id}:${booking.facility}`;
}

// ---------------------------------------------------------------------------
// Active booking detection
// OBS-090: keycard shows QR for an active SCHEDULED booking.
// The mock has bk_201 with status "ACTIVE" as today's booking.
// Set SHOW_ACTIVE = true to preview the active-QR branch.
// Default: false (matches the screenshot empty state).
// ---------------------------------------------------------------------------
const SHOW_ACTIVE = false;

const activeBooking: Booking | undefined = SHOW_ACTIVE
  ? bookings.find((b) => b.status === "ACTIVE")
  : undefined;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-8 px-6 text-center">
      {/* Faint QR icon — matches the subtle grey icon in the screenshot */}
      <QrCode
        className="text-slate-300"
        size={72}
        strokeWidth={1.25}
        aria-hidden
      />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-800">No Active Booking</h2>
        <p className="text-sm text-gray-500 max-w-[260px] mx-auto leading-relaxed">
          Book a space to get your digital key card with QR access.
        </p>
      </div>

      <Link
        href="/booking"
        className={cn(
          "mt-1 inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors",
          "h-10 px-4 text-sm",
          "bg-teal-500 text-white hover:bg-teal-600 shadow-sm",
        )}
      >
        <Calendar size={16} aria-hidden />
        Book a Space
      </Link>
    </div>
  );
}

interface ActiveQrProps {
  booking: Booking;
}

function ActiveQrState({ booking }: ActiveQrProps) {
  const qrValue = buildQrValue(booking);

  return (
    <div className="flex flex-col items-center gap-5 py-8 px-6 text-center">
      {/* Large QR code */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <QRCodeSVG
          value={qrValue}
          size={200}
          bgColor="#ffffff"
          fgColor="#0f172a"
          level="M"
          includeMargin={false}
        />
      </div>

      {/* Booking details */}
      <div className="space-y-1 w-full max-w-[280px]">
        <p className="text-lg font-semibold text-gray-800">{booking.facility}</p>
        <p className="text-sm text-gray-500">
          {formatDatetime(booking.start)} — {formatDatetime(booking.end)}
        </p>
        <p className="text-sm text-gray-500">
          Durasi: {booking.durationHours} jam
        </p>

        {/* Status badge */}
        <span className="mt-2 inline-flex items-center rounded-full bg-teal-100 px-3 py-0.5 text-xs font-medium text-teal-700">
          AKTIF
        </span>
      </div>

      <p className="text-xs text-gray-400">
        Tunjukkan kode QR ini kepada petugas untuk akses fasilitas.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KeycardPage() {
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Page heading (OBS-090) */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">Digital Key Card</h1>
        <p className="text-sm text-gray-500">
          Scan to access your booked facility
        </p>
      </div>

      {/* Card — ~400px wide, centered */}
      <Card className="w-full max-w-[420px]">
        {activeBooking ? (
          <ActiveQrState booking={activeBooking} />
        ) : (
          <EmptyState />
        )}
      </Card>
    </div>
  );
}
