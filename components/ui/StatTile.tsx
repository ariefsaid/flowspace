import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type StatAccent = "teal" | "orange" | "blue" | "green" | "purple";

export interface StatTileProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  accent?: StatAccent;
}

const accentClasses: Record<StatAccent, string> = {
  teal: "bg-teal-50 text-teal-600",
  orange: "bg-orange-50 text-orange-600",
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  purple: "bg-purple-50 text-purple-600",
};

export function StatTile({
  label,
  value,
  unit,
  icon: Icon,
  accent = "teal",
}: StatTileProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-1 truncate text-2xl font-bold text-gray-900">
          {value}
          {unit ? (
            <span className="ml-1 text-sm font-medium text-gray-500">
              {unit}
            </span>
          ) : null}
        </p>
      </div>
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          accentClasses[accent],
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
    </div>
  );
}

export default StatTile;
