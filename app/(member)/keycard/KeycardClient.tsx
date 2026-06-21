"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QrCode, Calendar } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { TOKEN_WINDOW_MS } from "@/lib/keycard/window";

// ---------------------------------------------------------------------------
// View model (server-read active booking → passed as props)
// ---------------------------------------------------------------------------

export type ActiveBookingView = {
  id: string;
  facilityName: string;
  startAt: string; // ISO
  endAt: string | null; // ISO (null while walk-in is open-ended)
  durationHours: number | null;
};

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
  booking: ActiveBookingView;
  /** Server-signed, window-rotating token (the QR value). */
  token: string;
}

function ActiveQrState({ booking, token }: ActiveQrProps) {
  return (
    <div className="flex flex-col items-center gap-5 py-8 px-6 text-center">
      {/* Large QR code */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <QRCodeSVG
          value={token}
          size={200}
          bgColor="#ffffff"
          fgColor="#0f172a"
          level="M"
          includeMargin={false}
        />
      </div>

      {/* Booking details */}
      <div className="space-y-1 w-full max-w-[280px]">
        <p className="text-lg font-semibold text-gray-800">
          {booking.facilityName}
        </p>
        <p className="text-sm text-gray-500">
          {booking.endAt
            ? `${formatDatetime(booking.startAt)} — ${formatDatetime(booking.endAt)}`
            : `Mulai ${formatDatetime(booking.startAt)}`}
        </p>
        {booking.durationHours !== null && (
          <p className="text-sm text-gray-500">
            Durasi: {booking.durationHours} jam
          </p>
        )}

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
// Client leaf
// ---------------------------------------------------------------------------

interface KeycardClientProps {
  booking: ActiveBookingView | null;
  /** Server-signed token for the current window (only when booking != null). */
  token: string;
}

export function KeycardClient({ booking, token }: KeycardClientProps) {
  const router = useRouter();

  // Rotate the QR: aligned to the 30s window boundary, refresh the RSC so the
  // server recomputes a fresh signed token for the new window. The token is
  // ALWAYS a server-derived prop — the client never signs it. [SEC]
  useEffect(() => {
    if (!booking) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const msToNext = TOKEN_WINDOW_MS - (Date.now() % TOKEN_WINDOW_MS);
    const timeout = setTimeout(() => {
      router.refresh();
      interval = setInterval(() => router.refresh(), TOKEN_WINDOW_MS);
    }, msToNext);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [router, booking]);

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Page heading (OBS-090) */}
      <div className="text-center space-y-1">
        <h1 className="text-3xl font-bold text-gray-900">Digital Key Card</h1>
        <p className="text-sm text-gray-500">
          Scan to access your booked facility
        </p>
      </div>

      {/* Card — ~400px wide, centered */}
      <Card className="w-full max-w-[420px]">
        {booking ? (
          <ActiveQrState booking={booking} token={token} />
        ) : (
          <EmptyState />
        )}
      </Card>
    </div>
  );
}
