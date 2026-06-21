"use client";

import { useEffect, useState } from "react";
import { DoorOpen } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import type { ActiveSession } from "@/lib/types/views";

interface ActiveSessionCardProps {
  session: ActiveSession;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Round up to the nearest whole hour (minimum 1), capped at maxHours. */
function roundedHours(elapsedSeconds: number, maxHours: number) {
  const raw = Math.ceil(elapsedSeconds / 3600);
  return Math.min(Math.max(raw, 1), maxHours);
}

export function ActiveSessionCard({ session }: ActiveSessionCardProps) {
  const startMs = new Date(session.startedAt).getTime();

  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startMs) / 1000)),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [startMs]);

  const billed = roundedHours(elapsedSeconds, session.maxHours);
  const runningCost = billed * session.tarifPerHour;

  return (
    <div className="bg-gradient-to-br from-teal-500 to-teal-600 px-6 py-5 text-white">
      {/* header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex shrink-0 items-center justify-center rounded-full bg-white/15 p-2">
            <DoorOpen className="h-7 w-7 text-white/90" />
          </span>
          <div>
            <p className="text-xs font-medium text-teal-50">Walk-in Aktif</p>
            <p className="text-2xl font-bold leading-tight">{session.table}</p>
          </div>
        </div>

        {/* timer */}
        <div className="text-right">
          <p className="text-xs font-medium text-teal-50">Durasi Berjalan</p>
          <p className="font-mono text-3xl font-bold tabular-nums">
            {formatHMS(elapsedSeconds)}
          </p>
        </div>
      </div>

      {/* divider */}
      <div className="my-4 border-t border-white/30" />

      {/* cost row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-teal-50">
            Biaya sementara (pembulatan per jam):
          </p>
          <p className="mt-0.5 text-xs text-teal-100">
            Tarif: {formatRupiah(session.tarifPerHour)}/jam
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{formatRupiah(runningCost)}</p>
          <p className="mt-0.5 text-xs text-teal-100">
            Maks: {session.maxHours} jam
          </p>
        </div>
      </div>

      {/* hint */}
      <p className="mt-3 text-center text-xs text-teal-50">
        💡 Menuju kasir untuk menyelesaikan sesi &amp; bayar
      </p>
    </div>
  );
}
