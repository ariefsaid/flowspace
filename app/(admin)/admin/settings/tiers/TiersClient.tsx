"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Printer, Save, Check, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card, Input, Button } from "@/components/ui";
import type { MembershipTier } from "@/lib/db/enums";
import { savePricingConfigAction } from "./actions";

export type TierRow = {
  tier: MembershipTier;
  cafeDiscountPct: number;
  printDiscountPct: number;
};

type PrintPricing = {
  bwRatePerPageRupiah: number;
  colorRatePerPageRupiah: number;
};

/** Parse a number input to a non-negative integer (server re-validates). */
function toInt(value: string): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function TiersClient({
  tiers: initialTiers,
  printPricing: initialPricing,
}: {
  tiers: TierRow[];
  printPricing: PrintPricing;
}) {
  const router = useRouter();
  const [tiers, setTiers] = useState(initialTiers);
  const [pricing, setPricing] = useState(initialPricing);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function setTierField(
    tier: MembershipTier,
    field: "cafeDiscountPct" | "printDiscountPct",
    value: string,
  ) {
    setStatus("idle");
    setTiers((prev) =>
      prev.map((t) => (t.tier === tier ? { ...t, [field]: toInt(value) } : t)),
    );
  }

  async function onSave() {
    setStatus("saving");
    setError(null);
    try {
      await savePricingConfigAction({ printPricing: pricing, tiers });
      setStatus("saved");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error && /INVALID/.test(e.message)
          ? "Nilai tidak valid — diskon 0–100%, harga harus angka positif."
          : "Gagal menyimpan. Coba lagi.",
      );
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">
          Kategori Membership &amp; Harga Print
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Atur diskon per tier (cafe &amp; print) dan harga dasar print per halaman.
        </p>
      </div>

      {/* Print base rates */}
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Printer className="h-5 w-5 text-teal-600" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-gray-800">Harga Dasar Print</h2>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Hitam-Putih (Rp / halaman)
            </span>
            <Input
              type="number"
              min={1}
              className="mt-1"
              value={pricing.bwRatePerPageRupiah}
              onChange={(e) => {
                setStatus("idle");
                setPricing((p) => ({ ...p, bwRatePerPageRupiah: toInt(e.target.value) }));
              }}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Warna (Rp / halaman)
            </span>
            <Input
              type="number"
              min={1}
              className="mt-1"
              value={pricing.colorRatePerPageRupiah}
              onChange={(e) => {
                setStatus("idle");
                setPricing((p) => ({ ...p, colorRatePerPageRupiah: toInt(e.target.value) }));
              }}
            />
          </label>
        </div>
      </Card>

      {/* Per-tier discounts */}
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-teal-600" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-gray-800">Diskon per Tier</h2>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Tier
                </th>
                <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Diskon Cafe (%)
                </th>
                <th className="py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Diskon Print (%)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tiers.map((t) => (
                <tr key={t.tier}>
                  <td className="py-3 pr-4 font-medium text-gray-900">{t.tier}</td>
                  <td className="py-3 pr-4">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={`Diskon cafe ${t.tier}`}
                      className="max-w-[7rem]"
                      value={t.cafeDiscountPct}
                      onChange={(e) =>
                        setTierField(t.tier, "cafeDiscountPct", e.target.value)
                      }
                    />
                  </td>
                  <td className="py-3">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={`Diskon print ${t.tier}`}
                      className="max-w-[7rem]"
                      value={t.printDiscountPct}
                      onChange={(e) =>
                        setTierField(t.tier, "printDiscountPct", e.target.value)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={status === "saving"}>
          {status === "saved" ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {status === "saving" ? "Menyimpan…" : status === "saved" ? "Tersimpan" : "Simpan"}
        </Button>
        {status === "error" && error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
