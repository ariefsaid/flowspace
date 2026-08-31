"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, DoorOpen, Timer } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { computeWalkinBilledHours } from "@/lib/booking/pricing";

// ---------------------------------------------------------------------------
// SessionPanel (I-040, Phase 8) — the member dashboard's active-session
// panel, covering BOTH lifecycles:
//   - WALKIN: open-ended (endAt null); elapsed timer counts UP, provisional
//     cost rounds up hourly and caps at maxHours (OBS-817).
//   - SCHEDULED: fixed end; countdown to end, a ≤15-min extension affordance
//     (OBS-818), and a red overtime banner once past end that never offers a
//     completion action (OBS-819 — checkout is admin-only).
// ---------------------------------------------------------------------------

const EXTENSION_WARNING_MS = 15 * 60_000;
/** Extension choices offered — mirrors the original's [1, 2] jam options. */
const EXTENSION_CHOICES_HOURS = [1, 2] as const;
/** Client-side UX mirror of the server's EXTENSION_CAP_HOURS (lib/db/bookings.ts) —
 *  disables choices that would exceed it up front. The server re-checks and is
 *  the sole authority; this only avoids a round-trip to learn the obvious. */
const EXTENSION_CAP_HOURS = 4;
/** Friendly copy for both server rejection codes that mean "can't extend
 *  right now" — a following booking on the facility, or the 4h cap already
 *  reached server-side (a race the client-side disable above didn't catch). */
const EXTENSION_BLOCKED_MESSAGE = "Ada booking setelah ini - tidak bisa diperpanjang";
const EXTENSION_BLOCKED_CODES = new Set([
  "EXTENSION_BLOCKED_BY_NEXT_BOOKING",
  "EXTENSION_LIMIT_REACHED",
]);

function extensionErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (EXTENSION_BLOCKED_CODES.has(message)) return EXTENSION_BLOCKED_MESSAGE;
  return message || "Gagal memperpanjang sesi.";
}

export type SessionView = {
  bookingId: string;
  facilityName: string;
  bookingMode: "SCHEDULED" | "WALKIN";
  /** ISO timestamp. */
  startAt: string;
  /** ISO timestamp, or null for an open-ended walk-in. */
  endAt: string | null;
  ratePerHourRupiah: number;
  /** Walk-in billing cap (hours). Unused for scheduled sessions. */
  maxHours: number;
};

interface SessionPanelProps {
  session: SessionView;
  onExtend: (extraHours: number) => Promise<void>;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatHMS(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** Ticks `now` every second so countdown/elapsed displays stay live. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ---------------------------------------------------------------------------
// Walk-in branch
// ---------------------------------------------------------------------------

function WalkinPanel({ session }: { session: SessionView }) {
  const now = useNow();
  const startMs = new Date(session.startAt).getTime();
  const elapsedMs = Math.max(0, now - startMs);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const billedHours = computeWalkinBilledHours(elapsedMs, session.maxHours);
  const runningCost = billedHours * session.ratePerHourRupiah;

  return (
    <div className="bg-gradient-to-br from-teal-800 to-teal-900 px-6 py-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex shrink-0 items-center justify-center rounded-full bg-white/15 p-2">
            <DoorOpen className="h-7 w-7 text-white/90" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium text-white">Walk-in Aktif</p>
            <p className="text-2xl font-bold leading-tight">{session.facilityName}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-white">Durasi Berjalan</p>
          <p className="font-mono text-3xl font-bold tabular-nums">{formatHMS(elapsedSeconds)}</p>
        </div>
      </div>

      <div className="my-4 border-t border-white/30" />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white">Biaya sementara (pembulatan per jam):</p>
          <p className="mt-0.5 text-xs text-white">Tarif: {formatRupiah(session.ratePerHourRupiah)}/jam</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{formatRupiah(runningCost)}</p>
          <p className="mt-0.5 text-xs text-white">Maks: {session.maxHours} jam</p>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-white">
        Menuju kasir untuk menyelesaikan sesi &amp; bayar
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scheduled branch
// ---------------------------------------------------------------------------

function ScheduledPanel({ session, onExtend }: { session: SessionView; onExtend: (extraHours: number) => Promise<void> }) {
  const now = useNow();
  const [extending, setExtending] = useState(false);
  // NFR-803: a reusable component must not depend on the CALLER to surface
  // its own action's failure — render the error inline here regardless of
  // whether the caller's onExtend also handles it upstream.
  const [extendError, setExtendError] = useState<string | null>(null);
  const startMs = new Date(session.startAt).getTime();
  const endMs = session.endAt ? new Date(session.endAt).getTime() : 0;
  const remainingMs = endMs - now;
  const overtime = remainingMs <= 0;
  const nearEnd = !overtime && remainingMs <= EXTENSION_WARNING_MS;

  // Booked duration (fixed, independent of the ticking `now`) — the basis for
  // client-side-disabling extension choices that would exceed the 4h cap.
  const bookedHours = (endMs - startMs) / 3_600_000;

  async function handleExtend(extraHours: number) {
    setExtending(true);
    setExtendError(null);
    try {
      await onExtend(extraHours);
    } catch (err) {
      setExtendError(extensionErrorMessage(err));
    } finally {
      setExtending(false);
    }
  }

  if (overtime) {
    return (
      <div role="alert" className="bg-red-600 px-6 py-5 text-white">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide">Sesi Overtime</p>
            <p className="text-lg font-bold">{session.facilityName} melebihi waktu booking</p>
          </div>
        </div>
        <p className="mt-2 text-sm text-red-50">
          Sesi Anda telah melewati waktu selesai. Silakan hubungi kasir untuk menyelesaikan sesi.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-teal-800 to-teal-900 px-6 py-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex shrink-0 items-center justify-center rounded-full bg-white/15 p-2">
            <Timer className="h-7 w-7 text-white/90" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium text-white">Sesi Aktif</p>
            <p className="text-2xl font-bold leading-tight">{session.facilityName}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-white">Waktu Tersisa</p>
          <p className="font-mono text-3xl font-bold tabular-nums">
            {formatHMS(Math.floor(remainingMs / 1000))}
          </p>
        </div>
      </div>

      {nearEnd && (
        <>
          <div className="my-4 border-t border-white/30" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-white">
              Sesi Anda akan berakhir dalam {Math.max(1, Math.ceil(remainingMs / 60_000))} menit — tersisa
              waktu untuk memperpanjang.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm text-white">Perpanjang:</span>
              {EXTENSION_CHOICES_HOURS.map((hours) => {
                const exceedsCap = bookedHours + hours > EXTENSION_CAP_HOURS + 1e-6;
                return (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => handleExtend(hours)}
                    disabled={extending || exceedsCap}
                    aria-label={`Perpanjang ${hours} jam`}
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-teal-700 shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    {extending ? "..." : `${hours} jam`}
                  </button>
                );
              })}
            </div>
          </div>
          {extendError && (
            <p role="alert" className="mt-2 text-right text-xs font-medium text-red-100">
              {extendError}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export function SessionPanel({ session, onExtend }: SessionPanelProps) {
  if (session.bookingMode === "WALKIN") {
    return <WalkinPanel session={session} />;
  }
  return <ScheduledPanel session={session} onExtend={onExtend} />;
}
