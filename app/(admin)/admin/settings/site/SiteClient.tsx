"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Globe, Save, Check, ArrowLeft } from "lucide-react";
import { Card, Input, Button } from "@/components/ui";
import { saveSiteSettingsAction, type SiteSettingsInput } from "./actions";

const TEXTAREA_CLASS =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-gray-400 focus-visible:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30";

type Field = keyof SiteSettingsInput;

function Textarea({
  id,
  value,
  onChange,
  rows = 2,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      className={TEXTAREA_CLASS}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function SiteClient({ initial }: { initial: SiteSettingsInput }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function set(field: Field, value: string) {
    setStatus("idle");
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function onSave() {
    setStatus("saving");
    setError(null);
    try {
      await saveSiteSettingsAction(values);
      setStatus("saved");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error && /INVALID_LENGTH/.test(e.message)
          ? "Nilai terlalu panjang — maksimal 500 karakter per kolom."
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
          <Globe className="h-8 w-8 text-teal-600" aria-hidden="true" />
          Site Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Informasi venue, SEO &amp; social media yang ditampilkan di situs.
        </p>
      </div>

      <div
        role="note"
        className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700"
      >
        Tampilan situs membaca konfigurasi brand dari environment — pengaturan di halaman ini
        hanya menyimpan informasi venue, bukan tema/warna aplikasi.
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Informasi Venue</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block" htmlFor="site-name">
            <span className="text-sm font-medium text-gray-700">Nama Venue</span>
            <Input
              id="site-name"
              className="mt-1"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </label>
          <label className="block" htmlFor="site-tagline">
            <span className="text-sm font-medium text-gray-700">Tagline</span>
            <Input
              id="site-tagline"
              className="mt-1"
              value={values.tagline}
              onChange={(e) => set("tagline", e.target.value)}
            />
          </label>
        </div>
        <label className="block" htmlFor="site-address">
          <span className="text-sm font-medium text-gray-700">Alamat</span>
          <Textarea id="site-address" value={values.address} onChange={(v) => set("address", v)} />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block" htmlFor="site-phone">
            <span className="text-sm font-medium text-gray-700">Telepon</span>
            <Input
              id="site-phone"
              className="mt-1"
              value={values.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </label>
          <label className="block" htmlFor="site-hours">
            <span className="text-sm font-medium text-gray-700">Jam Operasional</span>
            <Input
              id="site-hours"
              className="mt-1"
              value={values.openingHours}
              onChange={(e) => set("openingHours", e.target.value)}
              placeholder="Senin - Jumat: 08:00 - 22:00"
            />
          </label>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">SEO</h2>
        <label className="block" htmlFor="site-seo-title">
          <span className="text-sm font-medium text-gray-700">Meta Title</span>
          <Input
            id="site-seo-title"
            className="mt-1"
            value={values.seoTitle}
            onChange={(e) => set("seoTitle", e.target.value)}
          />
        </label>
        <label className="block" htmlFor="site-seo-description">
          <span className="text-sm font-medium text-gray-700">Meta Description</span>
          <Textarea
            id="site-seo-description"
            value={values.seoDescription}
            onChange={(v) => set("seoDescription", v)}
          />
        </label>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Social Media</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block" htmlFor="site-instagram">
            <span className="text-sm font-medium text-gray-700">Instagram</span>
            <Input
              id="site-instagram"
              className="mt-1"
              value={values.socialInstagram}
              onChange={(e) => set("socialInstagram", e.target.value)}
              placeholder="https://instagram.com/…"
            />
          </label>
          <label className="block" htmlFor="site-facebook">
            <span className="text-sm font-medium text-gray-700">Facebook</span>
            <Input
              id="site-facebook"
              className="mt-1"
              value={values.socialFacebook}
              onChange={(e) => set("socialFacebook", e.target.value)}
              placeholder="https://facebook.com/…"
            />
          </label>
          <label className="block sm:col-span-2" htmlFor="site-whatsapp">
            <span className="text-sm font-medium text-gray-700">WhatsApp</span>
            <Input
              id="site-whatsapp"
              className="mt-1"
              value={values.socialWhatsapp}
              onChange={(e) => set("socialWhatsapp", e.target.value)}
              placeholder="https://wa.me/62…"
            />
          </label>
        </div>
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
