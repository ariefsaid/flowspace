"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { formatRupiah } from "@/lib/format";
import type { MenuItem } from "@/lib/mock";

export interface VariantSelection {
  temp: "Hot" | "Cold";
  sugar: "Normal" | "Less Sugar" | "No Sugar";
}

interface VariantModalProps {
  item: MenuItem;
  onClose: () => void;
  onConfirm: (item: MenuItem, variant: VariantSelection) => void;
}

const TEMP_OPTIONS: VariantSelection["temp"][] = ["Hot", "Cold"];
const SUGAR_OPTIONS: VariantSelection["sugar"][] = [
  "Normal",
  "Less Sugar",
  "No Sugar",
];

export function VariantModal({ item, onClose, onConfirm }: VariantModalProps) {
  const [temp, setTemp] = useState<VariantSelection["temp"]>("Hot");
  const [sugar, setSugar] = useState<VariantSelection["sugar"]>("Normal");

  function handleConfirm() {
    onConfirm(item, { temp, sugar });
    onClose();
  }

  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-3xl mb-1">{item.emoji}</div>
            <h2 className="text-lg font-semibold text-gray-900">{item.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 rounded-full p-1.5 text-gray-400 hover:bg-slate-100 transition-colors"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* price */}
        <div className="mb-5 text-teal-600 font-semibold text-base">
          {formatRupiah(item.price)}
        </div>

        {/* temp */}
        <div className="mb-5">
          <p className="text-sm font-medium text-gray-800 mb-2">Suhu</p>
          <div className="flex gap-2">
            {TEMP_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTemp(t)}
                className={cn(
                  "flex-1 rounded-xl border-2 py-2.5 text-sm font-medium transition-colors",
                  temp === t
                    ? "border-teal-500 bg-teal-50 text-teal-700"
                    : "border-slate-200 bg-white text-gray-600 hover:border-teal-300",
                )}
              >
                {t === "Hot" ? "☕ Panas" : "🧊 Dingin"}
              </button>
            ))}
          </div>
        </div>

        {/* sugar */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-800 mb-2">
            Level Gula
          </p>
          <div className="flex gap-2 flex-wrap">
            {SUGAR_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSugar(s)}
                className={cn(
                  "flex-1 min-w-[90px] rounded-xl border-2 py-2.5 text-sm font-medium transition-colors",
                  sugar === s
                    ? "border-teal-500 bg-teal-50 text-teal-700"
                    : "border-slate-200 bg-white text-gray-600 hover:border-teal-300",
                )}
              >
                {s === "Normal"
                  ? "Normal"
                  : s === "Less Sugar"
                  ? "Kurang Manis"
                  : "Tanpa Gula"}
              </button>
            ))}
          </div>
        </div>

        {/* confirm */}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleConfirm}
        >
          Tambah ke Keranjang — {formatRupiah(item.price)}
        </Button>
      </div>
    </div>
  );
}
