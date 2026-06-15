"use client";

import { Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BookingType } from "./Step1Type";

export interface TimeSelection {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  durationHours: number;
}

const DURATION_OPTIONS = [1, 2, 3, 4, 6, 8];

const WALKIN_DURATION_OPTIONS = [1, 2, 3, 4];

function isWalkin(type: BookingType) {
  return type === "walkin-coworking" || type === "walkin-meeting";
}

interface Step2TimeProps {
  bookingType: BookingType;
  value: TimeSelection;
  onChange: (v: TimeSelection) => void;
}

/** Minimal date string for <input type="date"> — today in local timezone. */
function todayStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function Step2Time({ bookingType, value, onChange }: Step2TimeProps) {
  const walkin = isWalkin(bookingType);
  const durations = walkin ? WALKIN_DURATION_OPTIONS : DURATION_OPTIONS;

  const set = (partial: Partial<TimeSelection>) =>
    onChange({ ...value, ...partial });

  return (
    <div className="space-y-6 max-w-lg">
      {walkin && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          <span className="font-semibold">Walk-in:</span> Sesi dimulai segera.
          Pilih estimasi durasi — biaya dihitung saat Anda selesai di kasir.
        </div>
      )}

      {/* Date picker */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-teal-600" />
          {walkin ? "Tanggal" : "Tanggal Reservasi"}
        </label>
        <input
          type="date"
          min={todayStr()}
          value={value.date}
          onChange={(e) => set({ date: e.target.value })}
          className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-colors"
        />
      </div>

      {/* Start time — only for scheduled bookings */}
      {!walkin && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Clock className="h-4 w-4 text-teal-600" />
            Jam Mulai
          </label>
          <input
            type="time"
            value={value.startTime}
            onChange={(e) => set({ startTime: e.target.value })}
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-colors"
          />
        </div>
      )}

      {/* Duration */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Clock className="h-4 w-4 text-teal-600" />
          {walkin ? "Estimasi Durasi" : "Durasi"}
        </label>
        <div className="flex flex-wrap gap-2">
          {durations.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => set({ durationHours: h })}
              className={cn(
                "h-10 w-16 rounded-xl border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
                value.durationHours === h
                  ? "border-teal-500 bg-teal-500 text-white shadow-sm"
                  : "border-slate-200 bg-white text-gray-700 hover:border-teal-300",
              )}
            >
              {h} jam
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      {value.date && value.durationHours > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 space-y-1">
          <p className="font-semibold text-blue-800">Ringkasan Waktu</p>
          <p>
            Tanggal:{" "}
            {new Date(value.date + "T00:00:00").toLocaleDateString("id-ID", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          {!walkin && value.startTime && (
            <p>
              Jam mulai: {value.startTime} — selesai:{" "}
              {(() => {
                const [h, m] = value.startTime.split(":").map(Number);
                const end = h + value.durationHours;
                return `${String(end).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
              })()}
            </p>
          )}
          <p>Durasi: {value.durationHours} jam</p>
        </div>
      )}
    </div>
  );
}
