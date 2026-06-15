"use client";

import { Monitor, Users, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BookingType } from "./Step1Type";

export interface PlaceSelection {
  id: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Mock seat grid (Meja A–I for coworking, seat clusters for coworking-seat)
// ---------------------------------------------------------------------------

type SeatStatus = "available" | "occupied" | "selected";

interface Seat {
  id: string;
  label: string;
  status: SeatStatus;
}

const COWORKING_SEATS: Seat[] = [
  { id: "meja-a", label: "Meja A", status: "available" },
  { id: "meja-b", label: "Meja B", status: "occupied" },
  { id: "meja-c", label: "Meja C", status: "available" },
  { id: "meja-d", label: "Meja D", status: "available" },
  { id: "meja-e", label: "Meja E", status: "occupied" },
  { id: "meja-f", label: "Meja F", status: "occupied" },
  { id: "meja-g", label: "Meja G", status: "available" },
  { id: "meja-h", label: "Meja H", status: "available" },
  { id: "meja-i", label: "Meja I", status: "available" },
];

const MEETING_ROOMS = [
  {
    id: "mr-a",
    label: "Meeting Room A",
    capacity: 8,
    desc: "Kapasitas 8 orang · Proyektor · Whiteboard",
    status: "available" as SeatStatus,
  },
  {
    id: "mr-b",
    label: "Meeting Room B",
    capacity: 6,
    desc: "Kapasitas 6 orang · TV 55' · Whiteboard",
    status: "occupied" as SeatStatus,
  },
  {
    id: "mr-c",
    label: "Meeting Room C",
    capacity: 12,
    desc: "Kapasitas 12 orang · Proyektor · Sound system",
    status: "available" as SeatStatus,
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SeatGridProps {
  selected: PlaceSelection | null;
  onSelect: (p: PlaceSelection) => void;
}

function SeatGrid({ selected, onSelect }: SeatGridProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-teal-500" /> Tersedia
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-slate-300" /> Terisi
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-teal-600 ring-2 ring-teal-300" /> Dipilih
        </span>
      </div>

      {/* Grid map */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs text-gray-500 mb-4 font-medium uppercase tracking-wide">
          Denah Coworking
        </p>
        <div className="grid grid-cols-3 gap-3">
          {COWORKING_SEATS.map((seat) => {
            const isSelected = selected?.id === seat.id;
            const isOccupied = seat.status === "occupied";
            return (
              <button
                key={seat.id}
                type="button"
                disabled={isOccupied}
                onClick={() => onSelect({ id: seat.id, label: seat.label })}
                className={cn(
                  "h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 text-xs font-medium border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
                  isOccupied
                    ? "border-slate-200 bg-slate-200 text-slate-400 cursor-not-allowed"
                    : isSelected
                    ? "border-teal-500 bg-teal-500 text-white shadow-md"
                    : "border-teal-200 bg-white text-teal-700 hover:border-teal-400 hover:bg-teal-50",
                )}
              >
                <Monitor className="h-4 w-4" />
                {seat.label}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Anda memilih <strong>{selected.label}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

interface MeetingRoomListProps {
  selected: PlaceSelection | null;
  onSelect: (p: PlaceSelection) => void;
}

function MeetingRoomList({ selected, onSelect }: MeetingRoomListProps) {
  return (
    <div className="space-y-3">
      {MEETING_ROOMS.map((room) => {
        const isSelected = selected?.id === room.id;
        const isOccupied = room.status === "occupied";
        return (
          <button
            key={room.id}
            type="button"
            disabled={isOccupied}
            onClick={() => onSelect({ id: room.id, label: room.label })}
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
                  className={cn(
                    "h-5 w-5",
                    isOccupied ? "text-slate-400" : "text-teal-600",
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">
                    {room.label}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      isOccupied
                        ? "bg-red-100 text-red-700"
                        : "bg-teal-100 text-teal-700",
                    )}
                  >
                    {isOccupied ? "Terisi" : "Tersedia"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{room.desc}</p>
              </div>
            </div>
          </button>
        );
      })}

      {selected && (
        <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Anda memilih <strong>{selected.label}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step3Place
// ---------------------------------------------------------------------------

interface Step3PlaceProps {
  bookingType: BookingType;
  selected: PlaceSelection | null;
  onSelect: (p: PlaceSelection) => void;
}

export function Step3Place({ bookingType, selected, onSelect }: Step3PlaceProps) {
  if (
    bookingType === "walkin-coworking" ||
    bookingType === "scheduled-coworking"
  ) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Pilih tempat duduk yang tersedia dari denah di bawah ini.
        </p>
        <SeatGrid selected={selected} onSelect={onSelect} />
      </div>
    );
  }

  if (bookingType === "walkin-meeting" || bookingType === "scheduled-meeting") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Pilih ruang meeting yang tersedia.
        </p>
        <MeetingRoomList selected={selected} onSelect={onSelect} />
      </div>
    );
  }

  if (bookingType === "scheduled-fullroom") {
    return (
      <div className="rounded-xl border border-purple-200 bg-purple-50 p-6 text-center space-y-3">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100">
            <Users className="h-6 w-6 text-purple-500" />
          </div>
        </div>
        <p className="text-base font-semibold text-gray-900">Full Room Event</p>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Seluruh ruangan coworking akan digunakan untuk acara Anda. Tim kami
          akan menghubungi Anda untuk konfirmasi harga dan ketersediaan.
        </p>
        <button
          type="button"
          onClick={() => onSelect({ id: "full-room", label: "Full Room Event" })}
          className={cn(
            "mx-auto mt-2 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400",
            selected?.id === "full-room"
              ? "bg-purple-500 text-white shadow-md"
              : "border-2 border-purple-400 text-purple-600 bg-white hover:bg-purple-50",
          )}
        >
          {selected?.id === "full-room" ? (
            <>
              <CheckCircle2 className="h-4 w-4" /> Dipilih
            </>
          ) : (
            "Pilih Full Room"
          )}
        </button>
      </div>
    );
  }

  return null;
}
