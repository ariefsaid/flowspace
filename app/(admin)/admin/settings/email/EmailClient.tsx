"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Save, Check, ArrowLeft, Send, CheckCircle } from "lucide-react";
import { Card, Input, Button } from "@/components/ui";
import { saveEmailSettingsAction, type EmailSettingsInput } from "./actions";

type ToggleField = "registrationEnabled" | "bookingEnabled" | "paymentEnabled";

const NOTIFICATION_TYPES: Array<{ field: ToggleField; title: string; description: string }> = [
  {
    field: "registrationEnabled",
    title: "Email Registrasi",
    description: "Kirim email selamat datang saat member baru mendaftar.",
  },
  {
    field: "bookingEnabled",
    title: "Email Booking",
    description: "Kirim konfirmasi saat booking dikonfirmasi.",
  },
  {
    field: "paymentEnabled",
    title: "Email Payment Receipt",
    description: "Kirim receipt saat pembayaran selesai.",
  },
];

/** Simulated send delay (ms) — no real email service is wired (I-045). */
const SIMULATED_SEND_DELAY_MS = 300;

export function EmailClient({ initial }: { initial: EmailSettingsInput }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent">("idle");

  function toggle(field: ToggleField, checked: boolean) {
    setStatus("idle");
    setValues((prev) => ({ ...prev, [field]: checked }));
  }

  async function onSave() {
    setStatus("saving");
    setError(null);
    try {
      await saveEmailSettingsAction(values);
      setStatus("saved");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error && /INVALID_LENGTH/.test(e.message)
          ? "Nama pengirim terlalu panjang — maksimal 500 karakter."
          : "Gagal menyimpan. Coba lagi.",
      );
    }
  }

  async function onTestSend() {
    setTestStatus("sending");
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_SEND_DELAY_MS));
    setTestStatus("sent");
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
          <Mail className="h-8 w-8 text-teal-600" aria-hidden="true" />
          Email Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">Konfigurasi notifikasi email otomatis.</p>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Pengaturan Umum</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700" htmlFor="email-sender-name">
            Nama Pengirim
          </label>
          <Input
            id="email-sender-name"
            className="mt-1"
            aria-describedby="email-sender-name-hint"
            value={values.senderName}
            onChange={(e) => {
              setStatus("idle");
              setValues((v) => ({ ...v, senderName: e.target.value }));
            }}
          />
          <p id="email-sender-name-hint" className="mt-1 text-xs text-gray-500">
            Nama yang muncul sebagai pengirim email.
          </p>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Jenis Notifikasi Email</h2>
        <div className="space-y-3">
          {NOTIFICATION_TYPES.map(({ field, title, description }) => (
            <label
              key={field}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"
              htmlFor={`email-toggle-${field}`}
            >
              <span>
                <span className="block text-sm font-medium text-gray-900">{title}</span>
                <span className="block text-sm text-gray-500">{description}</span>
              </span>
              <input
                id={`email-toggle-${field}`}
                type="checkbox"
                aria-label={title}
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 accent-teal-600 cursor-pointer"
                checked={values[field]}
                onChange={(e) => toggle(field, e.target.checked)}
              />
            </label>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSave} disabled={status === "saving"}>
          {status === "saved" ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {status === "saving" ? "Menyimpan…" : status === "saved" ? "Tersimpan" : "Simpan"}
        </Button>
        <Button variant="outline" onClick={onTestSend} disabled={testStatus === "sending"}>
          <Send className="h-4 w-4" aria-hidden="true" />
          {testStatus === "sending" ? "Mengirim…" : "Kirim Email Uji"}
        </Button>
        {status === "error" && error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>

      {testStatus === "sent" && (
        <p role="status" className="flex items-center gap-2 text-sm text-teal-700">
          <CheckCircle className="h-4 w-4" aria-hidden="true" />
          Simulasi — integrasi email menyusul.
        </p>
      )}
    </div>
  );
}
