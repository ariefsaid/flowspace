"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input, Button } from "@/components/ui";
import type { AdminUserView } from "./UsersClient";
import { userErrorMessage } from "./userErrors";

export interface CreditAdjustValues {
  timeCreditsDelta: number;
  printBalanceDelta: number;
}

/** Parses a signed-integer delta input; blank/invalid resolves to 0 (no-op for that field). */
function toDelta(value: string): number {
  if (value.trim() === "") return 0;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : 0;
}

export function CreditAdjustDialog({
  user,
  onCancel,
  onSave,
}: {
  user: AdminUserView;
  onCancel: () => void;
  onSave: (values: CreditAdjustValues) => Promise<void>;
}) {
  const [timeCreditsDelta, setTimeCreditsDelta] = useState(0);
  const [printBalanceDelta, setPrintBalanceDelta] = useState(0);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setStatus("saving");
    setFormError(null);
    try {
      await onSave({ timeCreditsDelta, printBalanceDelta });
    } catch (e) {
      setStatus("error");
      setFormError(userErrorMessage(e));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-adjust-title"
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 id="credit-adjust-title" className="text-lg font-semibold text-gray-900">
            Sesuaikan Saldo
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-gray-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">{user.name}</p>

        <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-gray-500">
          Saat ini: <strong className="text-gray-900">{user.timeCredits} jam</strong> kredit waktu ·{" "}
          <strong className="text-gray-900">{user.printBalance} lembar</strong> saldo print
        </div>

        <div className="space-y-4">
          <label className="block" htmlFor="credit-delta">
            <span className="text-sm font-medium text-gray-700">Penyesuaian Kredit Waktu (jam)</span>
            <Input
              id="credit-delta"
              type="number"
              className="mt-1"
              value={timeCreditsDelta}
              onChange={(e) => setTimeCreditsDelta(toDelta(e.target.value))}
              placeholder="mis. 5 atau -2"
            />
          </label>

          <label className="block" htmlFor="print-delta">
            <span className="text-sm font-medium text-gray-700">Penyesuaian Saldo Print (lembar)</span>
            <Input
              id="print-delta"
              type="number"
              className="mt-1"
              value={printBalanceDelta}
              onChange={(e) => setPrintBalanceDelta(toDelta(e.target.value))}
              placeholder="mis. 10 atau -5"
            />
          </label>
        </div>

        {formError && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {formError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={status === "saving"}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={status === "saving"}>
            {status === "saving" ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
