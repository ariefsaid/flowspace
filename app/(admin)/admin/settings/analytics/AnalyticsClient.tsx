"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart3, Save, Check, ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";
import { Card, Input, Button } from "@/components/ui";
import { saveAnalyticsSettingsAction, type AnalyticsSettingsInput } from "./actions";

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

export function AnalyticsClient({ initial }: { initial: AnalyticsSettingsInput }) {
  const router = useRouter();
  const enabledId = useId();
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const isValidFormat = values.measurementId === "" || MEASUREMENT_ID_PATTERN.test(values.measurementId);

  async function onSave() {
    setStatus("saving");
    setError(null);
    try {
      await saveAnalyticsSettingsAction(values);
      setStatus("saved");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error && e.message === "INVALID_MEASUREMENT_ID"
          ? "Format Measurement ID harus G-XXXXXXXXXX."
          : "Gagal menyimpan. Coba lagi.",
      );
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-gray-900 flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-teal-600" aria-hidden="true" />
          Google Analytics
        </h1>
        <p className="mt-1 text-sm text-gray-500">Konfigurasi tracking GA4 untuk analisis pengunjung.</p>
      </div>

      <div
        role="note"
        className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700"
      >
        Menyimpan konfigurasi saja — injeksi tag GA4 ke halaman belum terhubung.
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Google Analytics 4 (GA4)</h2>

        <label className="flex items-center gap-2" htmlFor={enabledId}>
          <input
            id={enabledId}
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-teal-600 accent-teal-600 cursor-pointer"
            checked={values.enabled}
            onChange={(e) => {
              setStatus("idle");
              setValues((v) => ({ ...v, enabled: e.target.checked }));
            }}
          />
          <span className="text-sm font-medium text-gray-700">Aktifkan Google Analytics</span>
        </label>

        <label className="block" htmlFor="analytics-measurement-id">
          <span className="text-sm font-medium text-gray-700">Measurement ID</span>
          <Input
            id="analytics-measurement-id"
            className="mt-1 font-mono"
            value={values.measurementId}
            placeholder="G-XXXXXXXXXX"
            aria-describedby="analytics-measurement-id-hint"
            onChange={(e) => {
              setStatus("idle");
              setValues((v) => ({ ...v, measurementId: e.target.value.toUpperCase() }));
            }}
          />
        </label>
        {values.measurementId && (
          <p id="analytics-measurement-id-hint" className="flex items-center gap-2 text-sm">
            {isValidFormat ? (
              <>
                <CheckCircle className="h-4 w-4 text-teal-600" aria-hidden="true" />
                <span className="text-teal-700">Format ID valid</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <span className="text-amber-700">Format harus G-XXXXXXXXXX</span>
              </>
            )}
          </p>
        )}
      </Card>

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
