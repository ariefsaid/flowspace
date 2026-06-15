"use client";

import { useEffect, useState } from "react";
import { Clock, MapPin } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatRupiah } from "@/lib/format";
import type { ActiveSession } from "@/lib/mock/types";

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
    <Card variant="highlight" className="p-5">
      {/* header row */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="active">AKTIF</Badge>
            <span className="text-xs text-gray-500">Sesi Walk-in</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-gray-800">
            <MapPin className="h-4 w-4 text-teal-600" />
            <span className="text-lg font-semibold">{session.table}</span>
          </div>
        </div>

        {/* timer */}
        <div className="text-right">
          <p className="text-xs font-medium text-gray-500">Durasi Sesi</p>
          <p className="font-mono text-3xl font-bold text-teal-600 tabular-nums">
            {formatHMS(elapsedSeconds)}
          </p>
        </div>
      </div>

      {/* cost row */}
      <div className="rounded-xl bg-teal-50 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">
              Biaya sementara (pembulatan per jam)
            </p>
            <p className="mt-0.5 text-xl font-bold text-gray-900">
              {formatRupiah(runningCost)}
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>
              Tarif:{" "}
              <span className="font-semibold text-gray-700">
                {formatRupiah(session.tarifPerHour)}/jam
              </span>
            </p>
            <p>
              Maks:{" "}
              <span className="font-semibold text-gray-700">
                {session.maxHours} jam
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* hint */}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
        <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        💡 Menuju kasir untuk menyelesaikan sesi &amp; bayar
      </p>
    </Card>
  );
}
