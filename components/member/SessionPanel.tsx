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
/** Extra hours proposed by the single "Perpanjang Sesi" affordance — the
 *  server (extendBooking) is the authority on the 4h cap + 60-min gap guard. */
const EXTENSION_STEP_HOURS = 1;

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
  const endMs = session.endAt ? new Date(session.endAt).getTime() : 0;
  const remainingMs = endMs - now;
  const overtime = remainingMs <= 0;
  const nearEnd = !overtime && remainingMs <= EXTENSION_WARNING_MS;

  async function handleExtend() {
    setExtending(true);
    setExtendError(null);
    try {
      await onExtend(EXTENSION_STEP_HOURS);
    } catch (err) {
      setExtendError(err instanceof Error ? err.message : "Gagal memperpanjang sesi.");
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
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white">
              Sesi Anda akan berakhir dalam {Math.max(1, Math.ceil(remainingMs / 60_000))} menit — tersisa
              waktu untuk memperpanjang.
            </p>
            <button
              type="button"
              onClick={handleExtend}
              disabled={extending}
              className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-teal-700 shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {extending ? "Memproses..." : "Perpanjang Sesi"}
            </button>
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
