"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { formatRupiah } from "@/lib/format";
import type { VariantConfig, VariantSelectionInput } from "@/lib/cafe/types";

export interface VariantPickerItem {
  name: string;
  emoji: string;
  description: string;
  priceRupiah: number;
  variantConfig: VariantConfig;
}

interface VariantPickerModalProps {
  item: VariantPickerItem;
  onClose: () => void;
  /** Confirms with ONLY the selections — never a client-computed price (I-044, [SEC]). */
  onConfirm: (selections: VariantSelectionInput[]) => void;
}

/**
 * Generic accessible variant picker (I-044) — renders every configured group
 * from the item's live `variantConfig`, defaults each group to its first
 * option, and displays a live preview price. The preview is display-only:
 * `onConfirm` only ever receives `{variantName, optionName}` selections, so
 * the server (never this component) is the pricing authority.
 */
export function VariantPickerModal({ item, onClose, onConfirm }: VariantPickerModalProps) {
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      item.variantConfig.variants.map((g) => [g.name, g.options[0]?.name ?? ""]),
    ),
  );

  const previewAdjustment = item.variantConfig.variants.reduce((sum, group) => {
    const optionName = selected[group.name];
    const option = group.options.find((o) => o.name === optionName);
    return sum + (option?.priceAdjustment ?? 0);
  }, 0);
  const previewPrice = item.priceRupiah + previewAdjustment;

  function handleConfirm() {
    const selections: VariantSelectionInput[] = item.variantConfig.variants
      .filter((g) => selected[g.name])
      .map((g) => ({ variantName: g.name, optionName: selected[g.name] }));
    onConfirm(selections);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
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

        {/* live preview price (display-only — never sent to the server) */}
        <div className="mb-5 text-teal-600 font-semibold text-base">
          {formatRupiah(previewPrice)}
        </div>

        {/* variant groups */}
        {item.variantConfig.variants.map((group) => (
          <div key={group.name} className="mb-5">
            <p className="text-sm font-medium text-gray-800 mb-2">
              {group.name}
              {group.required && (
                <span className="ml-1.5 text-xs font-normal text-orange-700">(wajib)</span>
              )}
            </p>
            <div className="flex gap-2 flex-wrap">
              {group.options.map((option) => {
                const isSelected = selected[group.name] === option.name;
                return (
                  <button
                    key={option.name}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={option.name}
                    onClick={() =>
                      setSelected((prev) => ({ ...prev, [group.name]: option.name }))
                    }
                    className={cn(
                      "flex-1 min-w-[90px] rounded-xl border-2 py-2.5 px-2 text-sm font-medium transition-colors",
                      isSelected
                        ? "border-teal-500 bg-teal-50 text-teal-700"
                        : "border-slate-200 bg-white text-gray-600 hover:border-teal-300",
                    )}
                  >
                    {option.name}
                    {option.priceAdjustment > 0 && (
                      <span className="block text-xs font-normal text-teal-700">
                        +{formatRupiah(option.priceAdjustment)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* confirm */}
        <Button variant="primary" size="lg" className="w-full" onClick={handleConfirm}>
          Tambah ke Keranjang — {formatRupiah(previewPrice)}
        </Button>
      </div>
    </div>
  );
}
