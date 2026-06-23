"use client";

import { Zap, Users, Monitor, CalendarDays, Building2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type BookingType =
  | "walkin-coworking"
  | "walkin-meeting"
  | "scheduled-coworking"
  | "scheduled-meeting"
  | "scheduled-fullroom";

interface TypeCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  badge: string;
  badgeClass: string;
  badgePill?: boolean;
  selected: boolean;
  onClick: () => void;
  variant?: "walkin" | "scheduled";
}

function TypeCard({
  icon,
  iconBg,
  title,
  description,
  badge,
  badgeClass,
  badgePill = false,
  selected,
  onClick,
  variant = "scheduled",
}: TypeCardProps) {
  const isWalkin = variant === "walkin";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl p-5 border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
        isWalkin
          ? selected
            ? "border-orange-400 bg-orange-50 shadow-md"
            : "border-orange-200 bg-orange-50 hover:border-orange-300 hover:shadow-sm"
          : selected
          ? "border-teal-500 bg-white shadow-md"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-xl mb-4",
          iconBg,
        )}
      >
        {icon}
      </div>
      <p className="text-base font-semibold text-gray-900 mb-1">{title}</p>
      <p className="text-sm text-gray-500 leading-relaxed mb-3">
        {description}
      </p>
      <span
        className={cn(
          "text-sm font-medium",
          badgePill
            ? "inline-flex items-center rounded-full bg-orange-100 px-2.5 py-1 text-xs"
            : "",
          badgeClass,
        )}
      >
        {badge}
      </span>
    </button>
  );
}

interface Step1TypeProps {
  selected: BookingType | null;
  onSelect: (type: BookingType) => void;
}

export function Step1Type({ selected, onSelect }: Step1TypeProps) {
  return (
    <div className="space-y-6">
      {/* Walk-in group */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-semibold text-orange-500 uppercase tracking-wide">
            Langsung Masuk (Walk-in)
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TypeCard
            icon={<Zap className="h-5 w-5 text-orange-500" />}
            iconBg="bg-orange-100"
            title="Walk-in Coworking"
            description="Tunjukkan nomor booking ke kasir. Durasi dihitung saat selesai (maks 4 jam biaya)."
            badge="Bayar di kasir saat selesai"
            badgeClass="text-orange-700"
            badgePill
            selected={selected === "walkin-coworking"}
            onClick={() => onSelect("walkin-coworking")}
            variant="walkin"
          />
          <TypeCard
            icon={<Users className="h-5 w-5 text-orange-500" />}
            iconBg="bg-orange-100"
            title="Walk-in Meeting Room"
            description="Gunakan meeting room sekarang. Pilih durasi yang diinginkan."
            badge="Mulai sekarang"
            badgeClass="text-orange-700"
            badgePill
            selected={selected === "walkin-meeting"}
            onClick={() => onSelect("walkin-meeting")}
            variant="walkin"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-sm text-gray-500">atau</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Reservasi Jadwal group */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-semibold text-teal-600 uppercase tracking-wide">
            Reservasi Jadwal
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <TypeCard
            icon={<Monitor className="h-5 w-5 text-teal-600" />}
            iconBg="bg-teal-50"
            title="Coworking Seat"
            description="Pilih tempat duduk dari denah interaktif."
            badge="Mulai Rp20.000/jam"
            badgeClass="text-teal-600"
            selected={selected === "scheduled-coworking"}
            onClick={() => onSelect("scheduled-coworking")}
          />
          <TypeCard
            icon={<Users className="h-5 w-5 text-teal-600" />}
            iconBg="bg-teal-50"
            title="Meeting Room"
            description="Ruang meeting dengan proyektor & whiteboard."
            badge="Mulai Rp120.000/jam"
            badgeClass="text-teal-600"
            selected={selected === "scheduled-meeting"}
            onClick={() => onSelect("scheduled-meeting")}
          />
          <TypeCard
            icon={<Building2 className="h-5 w-5 text-purple-500" />}
            iconBg="bg-purple-50"
            title="Full Room Event"
            description="Sewa seluruh ruangan coworking untuk acara."
            badge="Hubungi untuk harga"
            badgeClass="text-purple-500"
            selected={selected === "scheduled-fullroom"}
            onClick={() => onSelect("scheduled-fullroom")}
          />
        </div>
      </div>
    </div>
  );
}
