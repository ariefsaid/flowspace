"use client";

import { Monitor, Users, Building2, CheckCircle2 } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Server-driven floor plan (I-040, replacing OBS-836's hardcoded seat map).
// Every seat rendered here comes from the `seats` prop — read server-side
// from listFacilities + facilitiesAvailableInWindow/getFullRoomAvailability
// (lib/db/bookings.ts) via getFloorPlanAction. This file defines/imports NO
// facility catalog of its own (AC-843).
// ---------------------------------------------------------------------------

export type SeatStatus = "available" | "occupied" | "selected";

export interface FacilitySeat {
  id: string;
  label: string;
  seatLabel: string | null;
  zone: string | null;
  status: SeatStatus;
  ratePerHourRupiah: number;
}

interface FloorPlanProps {
  seats: FacilitySeat[];
  selectedId: string | null;
  onSelect: (seat: FacilitySeat) => void;
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-500">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-teal-500" /> Tersedia
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-slate-200" /> Terisi
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm border-2 border-teal-500 bg-teal-100" /> Dipilih
      </span>
    </div>
  );
}

function DeskGrid({
  seats,
  selectedId,
  onSelect,
  heading,
}: {
  seats: FacilitySeat[];
  selectedId: string | null;
  onSelect: (seat: FacilitySeat) => void;
  heading: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs text-gray-500 mb-4 font-medium uppercase tracking-wide">
        {heading}
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {seats.map((seat) => {
          const isOccupied = seat.status === "occupied";
          const isSelected = seat.id === selectedId;
          return (
            <button
              key={seat.id}
              type="button"
              disabled={isOccupied}
              aria-pressed={isSelected}
              onClick={() => onSelect(seat)}
              className={cn(
                "h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 text-xs font-medium border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
                isOccupied
                  ? "border-slate-200 bg-slate-200 text-slate-400 cursor-not-allowed"
                  : isSelected
                    ? "border-teal-500 bg-teal-100 text-teal-700 shadow-md"
                    : "border-teal-200 bg-white text-teal-700 hover:border-teal-400 hover:bg-teal-50",
              )}
            >
              <Monitor className="h-4 w-4" aria-hidden />
              {seat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FacilityList({
  seats,
  selectedId,
  onSelect,
}: {
  seats: FacilitySeat[];
  selectedId: string | null;
  onSelect: (seat: FacilitySeat) => void;
}) {
  return (
    <div className="space-y-3">
      {seats.map((seat) => {
        const isOccupied = seat.status === "occupied";
        const isSelected = seat.id === selectedId;
        return (
          <button
            key={seat.id}
            type="button"
            disabled={isOccupied}
            aria-pressed={isSelected}
            onClick={() => onSelect(seat)}
            className={cn(
              "w-full text-left rounded-xl border-2 p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
              isOccupied
                ? "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
                : isSelected
                  ? "border-teal-500 bg-white shadow-md"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  isOccupied ? "bg-slate-100" : "bg-teal-50",
                )}
              >
                <Users
                  className={cn("h-5 w-5", isOccupied ? "text-slate-400" : "text-teal-600")}
                  aria-hidden
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{seat.label}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      isOccupied ? "bg-red-100 text-red-700" : "bg-teal-100 text-teal-700",
                    )}
                  >
                    {isOccupied ? "Terisi" : "Tersedia"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatRupiah(seat.ratePerHourRupiah)}/jam
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FullRoomCard({
  seat,
  selectedId,
  onSelect,
}: {
  seat: FacilitySeat;
  selectedId: string | null;
  onSelect: (seat: FacilitySeat) => void;
}) {
  const isOccupied = seat.status === "occupied";
  const isSelected = seat.id === selectedId;
  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 p-6 text-center space-y-3">
      <div className="flex justify-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100">
          <Building2 className="h-6 w-6 text-purple-500" aria-hidden />
        </div>
      </div>
      <p className="text-base font-semibold text-gray-900">{seat.label}</p>
      <p className="text-sm text-gray-500 max-w-sm mx-auto">
        {isOccupied
          ? "Seluruh ruangan tidak tersedia pada hari ini karena ada booking individual."
          : `Seluruh ruangan coworking untuk acara Anda. ${formatRupiah(seat.ratePerHourRupiah)}/jam.`}
      </p>
      <button
        type="button"
        disabled={isOccupied}
        aria-pressed={isSelected}
        onClick={() => onSelect(seat)}
        className={cn(
          "mx-auto mt-2 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400",
          isOccupied
            ? "border-2 border-slate-200 text-slate-400 bg-slate-100 cursor-not-allowed"
            : isSelected
              ? "bg-purple-600 text-white shadow-md"
              : "border-2 border-purple-400 text-purple-600 bg-white hover:bg-purple-50",
        )}
      >
        {isSelected ? (
          <>
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Dipilih
          </>
        ) : isOccupied ? (
          "Tidak Tersedia"
        ) : (
          seat.label
        )}
      </button>
    </div>
  );
}

export function FloorPlan({ seats, selectedId, onSelect }: FloorPlanProps) {
  if (seats.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-gray-500">
        Tidak ada tempat tersedia untuk kriteria yang dipilih. Coba tanggal atau jam lain.
      </div>
    );
  }

  const desks = seats.filter((s) => s.zone === "DESK" || s.zone === "COUNTER");
  const meetings = seats.filter((s) => s.zone === "MEETING");
  const fullRooms = seats.filter((s) => s.zone === "FULL_ROOM");
  const others = seats.filter(
    (s) => !desks.includes(s) && !meetings.includes(s) && !fullRooms.includes(s),
  );

  return (
    <div className="space-y-4">
      {desks.length > 0 && (
        <>
          <Legend />
          <DeskGrid seats={desks} selectedId={selectedId} onSelect={onSelect} heading="Denah Coworking" />
        </>
      )}
      {meetings.length > 0 && (
        <FacilityList seats={meetings} selectedId={selectedId} onSelect={onSelect} />
      )}
      {fullRooms.map((seat) => (
        <FullRoomCard key={seat.id} seat={seat} selectedId={selectedId} onSelect={onSelect} />
      ))}
      {others.length > 0 && (
        <FacilityList seats={others} selectedId={selectedId} onSelect={onSelect} />
      )}

      {selectedId && (
        <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Anda memilih{" "}
            <strong>{seats.find((s) => s.id === selectedId)?.label}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
