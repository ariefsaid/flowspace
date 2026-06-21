"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { UploadDropzone } from "@/components/member/print/UploadDropzone";
import { PrintSummary } from "@/components/member/print/PrintSummary";
import { PrintHistory } from "@/components/member/print/PrintHistory";
import { submitPrintJobAction } from "@/app/(member)/print/actions";
import type { PrintColorMode } from "@/lib/db/enums";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ColorMode = "bw" | "color";
type PaperSize = "A4" | "A3" | "F4" | "Letter";

/**
 * View shape mapped from DB PrintJob rows (page.tsx). Mirrors the contract the
 * pixel-identical PrintHistory component already consumes.
 */
export interface PrintJobView {
  id: string;
  filename: string;
  pages: number;
  price: number;
  status: "WAITING" | "READY";
  datetime: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PrintClient({
  printBalance,
  jobs,
}: {
  printBalance: number;
  jobs: PrintJobView[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Form state
  const [docPages, setDocPages] = useState(1);
  const [printRange, setPrintRange] = useState("all");
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState<ColorMode>("bw");
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [printer, setPrinter] = useState("");
  const [duplex, setDuplex] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDecrement = () => setCopies((c) => Math.max(1, c - 1));
  const handleIncrement = () => setCopies((c) => c + 1);

  const handleDocPagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(1, parseInt(e.target.value, 10) || 1);
    setDocPages(val);
  };

  /** Maps server sentinels → the Bahasa message shown under the calculator. */
  function toSubmitMessage(err: unknown): string {
    const sentinel = (err as Error)?.message ?? "";
    const map: Record<string, string> = {
      INSUFFICIENT_BALANCE: "Saldo print tidak cukup untuk job ini.",
      INVALID_FILE: "Pilih file yang ingin dicetak terlebih dahulu.",
      INVALID_PAGES: "Jumlah halaman tidak valid.",
      INVALID_COPIES: "Jumlah copy tidak valid.",
      UNAUTHENTICATED: "Sesi berakhir, silakan masuk kembali.",
    };
    return map[sentinel] ?? "Gagal mengirim print job. Coba lagi.";
  }

  const handleSubmit = useCallback(async () => {
    if (submitting) return; // double-submit guard (money path)
    setError(null);
    setSubmitting(true);
    try {
      await submitPrintJobAction({
        // Generic default if the member hasn't picked a file yet (upload is
        // simulated — no real storage this push, ADR defers hardware).
        fileName: fileName || "dokumen.pdf",
        pages: docPages,
        copies,
        colorMode: (colorMode === "bw" ? "BW" : "COLOR") as PrintColorMode,
        paperSize,
        duplex,
      });
    } catch (err) {
      setError(toSubmitMessage(err));
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setFileName("");
    startTransition(() => {
      router.refresh();
    });
  }, [submitting, fileName, docPages, copies, colorMode, paperSize, duplex, router]);

  return (
    <div className="max-w-6xl space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Title */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Print Dokumen</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload dan cetak dokumen Anda
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Saldo banner */}
      {/* ------------------------------------------------------------------ */}
      <Card className="flex items-center gap-3 px-5 py-4">
        <Printer className="h-5 w-5 shrink-0 text-gray-500" />
        <span className="text-sm text-gray-700">
          Saldo Print Anda:{" "}
          <strong className="text-gray-900">
            {printBalance} lembar
          </strong>
        </span>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Main two-column layout */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="space-y-6">
          {/* ---- Upload card ---- */}
          <Card className="p-6">
            <UploadDropzone onFileSelect={(file) => setFileName(file.name)} />
          </Card>

          {/* ---- Opsi Print card ---- */}
          <Card className="p-6">
            <h2 className="mb-5 text-lg font-semibold text-gray-800">
              Opsi Print
            </h2>

            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              {/* Jumlah Halaman Dokumen */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Jumlah Halaman Dokumen
                </label>
                <Input
                  type="number"
                  min={1}
                  value={docPages}
                  onChange={handleDocPagesChange}
                />
              </div>

              {/* Halaman yang Dicetak */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Halaman yang Dicetak
                </label>
                <Input
                  type="text"
                  value={printRange}
                  onChange={(e) => setPrintRange(e.target.value)}
                  placeholder='all'
                />
                <p className="text-xs text-gray-400">
                  Ketik &quot;all&quot; untuk semua halaman
                </p>
              </div>

              {/* Jumlah Copy */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Jumlah Copy
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 shrink-0 rounded-xl p-0 text-base font-bold"
                    onClick={handleDecrement}
                    aria-label="Kurangi copy"
                  >
                    &minus;
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    value={copies}
                    readOnly
                    className="text-center"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 shrink-0 rounded-xl p-0 text-base font-bold"
                    onClick={handleIncrement}
                    aria-label="Tambah copy"
                  >
                    +
                  </Button>
                </div>
              </div>

              {/* Mode Warna */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Mode Warna
                </label>
                <Select
                  value={colorMode}
                  onChange={(e) => setColorMode(e.target.value as ColorMode)}
                >
                  <option value="bw">Hitam Putih (B&amp;W)</option>
                  <option value="color">Warna</option>
                </Select>
              </div>

              {/* Ukuran Kertas */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Ukuran Kertas
                </label>
                <Select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value as PaperSize)}
                >
                  <option value="A4">A4</option>
                  <option value="A3">A3</option>
                  <option value="F4">F4</option>
                  <option value="Letter">Letter</option>
                </Select>
              </div>

              {/* Printer */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Printer
                </label>
                <Select
                  value={printer}
                  onChange={(e) => setPrinter(e.target.value)}
                >
                  <option value="">Pilih printer</option>
                  <option value="printer-1">Printer 1 — Ruang Utama</option>
                  <option value="printer-2">Printer 2 — Meja Resepsionis</option>
                </Select>
              </div>
            </div>

            {/* Duplex toggle — full width row */}
            <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  Print Dua Sisi (Duplex)
                </p>
                <p className="text-xs text-gray-500">
                  Cetak di kedua sisi kertas
                </p>
              </div>
              {/* Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={duplex}
                onClick={() => setDuplex((d) => !d)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 ${
                  duplex ? "bg-teal-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${
                    duplex ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <PrintSummary
            pages={docPages}
            copies={copies}
            colorMode={colorMode}
            paperSize={paperSize}
            duplex={duplex}
            printBalance={printBalance}
            onSubmit={handleSubmit}
          />

          {error ? (
            <Card className="p-4">
              <p className="text-sm font-medium text-red-600">{error}</p>
            </Card>
          ) : null}

          <PrintHistory jobs={jobs} />
        </div>
      </div>
    </div>
  );
}
