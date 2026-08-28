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
import { PrintHistory, type PrintHistoryJob } from "@/components/member/print/PrintHistory";
import { submitPrintJobAction } from "@/app/(member)/print/actions";
import type { PrintColorMode, PrinterType } from "@/lib/db/enums";

type ColorMode = "bw" | "color";
type PaperSize = "A4" | "A3" | "F4";

export interface PrintJobView extends PrintHistoryJob {
  status: "PENDING" | "PROCESSING" | "READY" | "COMPLETED" | "FAILED" | "WAITING";
}

export type PrinterView = {
  id: string;
  name: string;
  displayName: string;
  location: string | null;
  printerType: PrinterType;
  colorSupport: boolean;
  paperSizes: string[];
  isActive: boolean;
  isDefault: boolean;
};

export type PricingView = {
  colorMode: PrintColorMode;
  paperSize: PaperSize;
  pricePerPageRupiah: number;
  isActive: boolean;
};

function initialPrinterId(printers: PrinterView[]): string {
  return printers.find((p) => p.isDefault)?.id ?? printers[0]?.id ?? "";
}

export function PrintClient({
  printBalance,
  jobs,
  printers,
  pricing,
  discountPct = 0,
}: {
  printBalance: number;
  jobs: PrintJobView[];
  printers?: PrinterView[];
  pricing?: PricingView[];
  discountPct?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [docPages, setDocPages] = useState(1);
  const [printRange, setPrintRange] = useState("all");
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState<ColorMode>("bw");
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [printer, setPrinter] = useState(() => initialPrinterId(printers ?? []));
  const [duplex, setDuplex] = useState(false);
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const printerRows = printers ?? [];
  const pricingRows = pricing ?? [];
  const selectedPrinter = printerRows.find((p) => p.id === printer);
  const hasServerCapabilities = printers !== undefined || pricing !== undefined;
  const selectedMode: PrintColorMode = colorMode === "bw" ? "BW" : "COLOR";
  const selectedPricing = pricingRows.find((row) => row.colorMode === selectedMode && row.paperSize === paperSize && row.isActive);
  const price = pricing !== undefined ? selectedPricing?.pricePerPageRupiah ?? null : undefined;
  const selectedPrinterSupports = Boolean(
    selectedPrinter && selectedPrinter.isActive &&
    (selectedMode !== "COLOR" || selectedPrinter.colorSupport) &&
    selectedPrinter.paperSizes.includes(paperSize),
  );

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("fileName", fileName || "dokumen.pdf");
      formData.set("pages", String(docPages));
      formData.set("documentPages", String(docPages));
      formData.set("pageRange", printRange);
      formData.set("copies", String(copies));
      formData.set("colorMode", selectedMode);
      formData.set("paperSize", paperSize);
      formData.set("duplex", String(duplex));
      if (printer) formData.set("printerId", printer);
      if (file) formData.set("file", file);
      await submitPrintJobAction(formData);
    } catch (err) {
      const sentinel = (err as Error)?.message ?? "";
      const messages: Record<string, string> = {
        INSUFFICIENT_BALANCE: "Saldo print tidak cukup untuk job ini.",
        INVALID_FILE: "Pilih file yang ingin dicetak terlebih dahulu.",
        INVALID_FILE_TYPE: "Format file tidak didukung.",
        FILE_TOO_LARGE: "Ukuran file terlalu besar. Maksimal 10 MB.",
        INVALID_PAGES: "Jumlah halaman tidak valid.",
        INVALID_DOCUMENT_PAGES: "Jumlah halaman dokumen tidak valid.",
        INVALID_COPIES: "Jumlah copy tidak valid.",
        INVALID_PRINT_PRICING: "Harga print untuk kombinasi ini belum tersedia.",
        INVALID_PRINTER: "Pilih printer yang masih aktif.",
        UNSUPPORTED_COLOR: "Printer yang dipilih tidak mendukung warna.",
        UNSUPPORTED_PAPER: "Ukuran kertas tidak didukung printer.",
        UNAUTHENTICATED: "Sesi berakhir, silakan masuk kembali.",
      };
      setError(messages[sentinel] ?? "Gagal mengirim print job. Coba lagi.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setFileName("");
    setFile(null);
    startTransition(() => router.refresh());
  }, [submitting, file, fileName, docPages, printRange, copies, selectedMode, paperSize, printer, duplex, router]);

  const setDocPageValue = (value: string) => {
    const parsed = Number(value);
    setDocPages(Number.isInteger(parsed) && parsed > 0 ? parsed : 1);
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div><h1 className="text-3xl font-bold text-gray-900">Print Dokumen</h1><p className="mt-1 text-sm text-gray-500">Upload dan cetak dokumen Anda</p></div>
      <Card className="flex items-center gap-3 px-5 py-4"><Printer className="h-5 w-5 shrink-0 text-gray-500" /><span className="text-sm text-gray-700">Saldo Print Anda: <strong className="text-gray-900">{printBalance} lembar</strong></span></Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="p-6"><UploadDropzone onFileSelect={(selected) => { setFile(selected); setFileName(selected.name); }} /></Card>
          <Card className="p-6">
            <h2 className="mb-5 text-lg font-semibold text-gray-800">Opsi Print</h2>
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              <label className="space-y-1.5"><span className="text-sm font-medium text-gray-700">Jumlah Halaman Dokumen</span><Input aria-label="Jumlah Halaman Dokumen" type="number" min={1} value={docPages} onChange={(e) => setDocPageValue(e.target.value)} /></label>
              <label className="space-y-1.5"><span className="text-sm font-medium text-gray-700">Halaman yang Dicetak</span><Input aria-label="Halaman yang Dicetak" type="text" value={printRange} onChange={(e) => setPrintRange(e.target.value)} placeholder="all" /><span className="block text-xs text-gray-400">Ketik &quot;all&quot; untuk semua halaman</span></label>
              <div className="space-y-1.5"><span className="block text-sm font-medium text-gray-700">Jumlah Copy</span><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" className="h-10 w-10 shrink-0 rounded-xl p-0 text-base font-bold" onClick={() => setCopies((c) => Math.max(1, c - 1))} aria-label="Kurangi copy">−</Button><Input aria-label="Jumlah Copy" type="number" min={1} value={copies} readOnly className="text-center" /><Button type="button" variant="outline" size="sm" className="h-10 w-10 shrink-0 rounded-xl p-0 text-base font-bold" onClick={() => setCopies((c) => c + 1)} aria-label="Tambah copy">+</Button></div></div>
              <label className="space-y-1.5"><span className="text-sm font-medium text-gray-700">Mode Warna</span><Select aria-label="Mode Warna" value={colorMode} onChange={(e) => setColorMode(e.target.value as ColorMode)}><option value="bw">Hitam Putih (B&amp;W)</option><option value="color" disabled={Boolean(selectedPrinter && !selectedPrinter.colorSupport)}>Warna</option></Select></label>
              <label className="space-y-1.5"><span className="text-sm font-medium text-gray-700">Ukuran Kertas</span><Select aria-label="Ukuran Kertas" value={paperSize} onChange={(e) => setPaperSize(e.target.value as PaperSize)}>{(["A4", "A3", "F4"] as PaperSize[]).map((size) => <option key={size} value={size} disabled={Boolean(selectedPrinter && !selectedPrinter.paperSizes.includes(size))}>{size}</option>)}</Select></label>
              <label className="space-y-1.5"><span className="text-sm font-medium text-gray-700">Printer</span><Select aria-label="Printer" value={printer} onChange={(e) => setPrinter(e.target.value)}><option value="">Pilih printer</option>{printerRows.map((p) => <option key={p.id} value={p.id} disabled={!p.isActive}>{p.displayName}{p.location ? ` — ${p.location}` : ""}</option>)}</Select></label>
            </div>
            <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3"><div><p className="text-sm font-medium text-gray-800">Print Dua Sisi (Duplex)</p><p className="text-xs text-gray-500">Cetak di kedua sisi kertas</p></div><button type="button" role="switch" aria-label="Print Dua Sisi (Duplex)" aria-checked={duplex} onClick={() => setDuplex((d) => !d)} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 ${duplex ? "bg-teal-500" : "bg-slate-200"}`}><span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${duplex ? "translate-x-5" : "translate-x-0.5"}`} /></button></div>
            {hasServerCapabilities && !selectedPrinter ? <p role="alert" className="mt-3 text-sm text-amber-700">Belum ada printer aktif untuk dipilih.</p> : null}
          </Card>
        </div>
        <div className="space-y-6">
          <PrintSummary pages={docPages} copies={copies} colorMode={colorMode} paperSize={paperSize} duplex={duplex} printBalance={printBalance} pricePerPageRupiah={price} discountPct={discountPct} printerName={selectedPrinter?.displayName} disabled={submitting || (hasServerCapabilities && !selectedPrinter) || (Boolean(selectedPrinter) && !selectedPrinterSupports)} onSubmit={handleSubmit} />
          {error ? <Card className="p-4"><p role="alert" className="text-sm font-medium text-red-600">{error}</p></Card> : null}
          <PrintHistory jobs={jobs} />
        </div>
      </div>
    </div>
  );
}

