"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Server, KeyRound, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { createPrintServerAction, rotatePrintServerAction } from "./actions";

export type PrintServerConfigView = {
  id: string;
  keySelector: string;
  serverName: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
};

export function PrintServerClient({ config }: { config: PrintServerConfigView | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true); setError(null);
    try {
      const result = await createPrintServerAction({ serverName: "Mini PC" });
      setRawKey(result.rawKey);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "PRINT_AGENT_EXISTS" ? "Print server sudah dikonfigurasi." : "Gagal membuat konfigurasi print server.");
    } finally { setBusy(false); }
  }

  async function rotate() {
    setBusy(true); setError(null);
    try {
      const result = await rotatePrintServerAction();
      setRawKey(result.rawKey);
      router.refresh();
    } catch { setError("Gagal mengganti kunci print server."); }
    finally { setBusy(false); }
  }

  async function copyKey() {
    if (rawKey) await navigator.clipboard.writeText(rawKey);
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div><Link href="/admin/settings" className="inline-flex items-center gap-1 text-sm text-gray-500"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Settings</Link><h1 className="mt-2 text-3xl font-bold text-gray-900">Print Server</h1><p className="mt-1 text-sm text-gray-500">Konfigurasi koneksi server print lokal.</p></div>
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {rawKey ? <Card className="border-amber-200 bg-amber-50 p-5" role="alert"><p className="font-semibold text-amber-900">Simpan kunci ini sekarang</p><p className="mt-1 text-sm text-amber-800">Kunci hanya ditampilkan sekali dan tidak dapat dilihat lagi.</p><div className="mt-3 flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800">{rawKey}</code><Button type="button" variant="outline" aria-label="Salin kunci" onClick={() => void copyKey()}><Copy className="h-4 w-4" aria-hidden="true" /></Button></div></Card> : null}
      <Card className="p-6">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-slate-100 p-3 text-slate-600"><Server className="h-6 w-6" aria-hidden="true" /></div><div className="min-w-0 flex-1"><h2 className="text-lg font-semibold text-gray-800">Status Print Server</h2>{config ? <dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-4"><dt className="text-gray-500">Server</dt><dd className="font-medium text-gray-900">{config.serverName ?? "—"}</dd></div><div className="flex justify-between gap-4"><dt className="text-gray-500">Selector</dt><dd className="font-mono text-gray-900">{config.keySelector}</dd></div><div className="flex justify-between gap-4"><dt className="text-gray-500">Status</dt><dd className={config.isActive ? "font-medium text-green-700" : "font-medium text-gray-500"}>{config.isActive ? "Aktif" : "Nonaktif"}</dd></div><div className="flex justify-between gap-4"><dt className="text-gray-500">Terakhir terhubung</dt><dd className="text-gray-900">{config.lastSeenAt ?? "Belum pernah"}</dd></div></dl> : <p className="mt-2 text-sm text-gray-500">Belum dikonfigurasi.</p>}</div></div>
        <div className="mt-6 flex flex-wrap gap-3">{config ? <><Button type="button" variant="outline" disabled={busy} onClick={() => void rotate()}><RefreshCw className="h-4 w-4" aria-hidden="true" />{busy ? "Memproses…" : "Ganti Kunci"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => void rotate()}><KeyRound className="h-4 w-4" aria-hidden="true" />Generate Kunci Baru</Button></> : <Button type="button" disabled={busy} onClick={() => void generate()}><KeyRound className="h-4 w-4" aria-hidden="true" />{busy ? "Membuat…" : "Buat Kunci"}</Button>}</div>
      </Card>
    </div>
  );
}
