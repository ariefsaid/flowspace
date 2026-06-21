"use client";

import { Printer, Copy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatRupiah } from "@/lib/format";

/** Pricing constants — must match the server (lib/print/pricing.ts): BW Rp500/page, COLOR Rp1500/page. */
const BASE_PRICE_BW = 500;
const BASE_PRICE_COLOR = 1500;

interface PrintSummaryProps {
  pages: number;
  copies: number;
  colorMode: "bw" | "color";
  paperSize: string;
  duplex: boolean;
  printBalance: number;
  onSubmit: () => void;
}

export function PrintSummary({
  pages,
  copies,
  colorMode,
  paperSize,
  printBalance,
  onSubmit,
}: PrintSummaryProps) {
  const basePerPage = colorMode === "bw" ? BASE_PRICE_BW : BASE_PRICE_COLOR;
  const hargaDasar = pages * basePerPage;
  const total = hargaDasar * copies;
  const totalPages = pages * copies;
  // Sheets debited = pages × copies, matching the server (lib/db/print.ts).
  // ponytail: tier discount is applied server-side; this preview shows the
  // pre-discount total (a member is charged ≤ this) — exact-discount preview is a polish follow-up.
  const saldoSetelahPrint = printBalance - totalPages;

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">Ringkasan</h2>

      {/* Summary rows */}
      <div className="space-y-2 text-sm">
        <SummaryRow label="Total Halaman" value={`${totalPages} lembar`} />
        <SummaryRow
          label="Mode"
          value={colorMode === "bw" ? "Hitam Putih" : "Warna"}
        />
        <SummaryRow label="Kertas" value={paperSize} />
        <SummaryRow
          label="Copy"
          value={
            <span className="flex items-center gap-1.5">
              <Copy className="h-3.5 w-3.5 text-gray-500" />
              {copies}x
            </span>
          }
        />
      </div>

      <hr className="my-3 border-slate-200" />

      <div className="space-y-1.5 text-sm">
        <SummaryRow label="Harga Dasar" value={formatRupiah(hargaDasar)} />
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold text-gray-900">Total</span>
          <span className="text-base font-bold text-blue-600">
            {formatRupiah(total)}
          </span>
        </div>
      </div>

      <hr className="my-3 border-slate-200" />

      <SummaryRow
        label="Saldo Setelah Print"
        value={
          <span
            className={
              saldoSetelahPrint < 0 ? "text-red-600 font-semibold" : ""
            }
          >
            {saldoSetelahPrint < 0
              ? "Saldo tidak cukup"
              : `${saldoSetelahPrint} lembar`}
          </span>
        }
      />

      <Button
        variant="primary"
        size="lg"
        className="mt-5 w-full gap-2"
        onClick={onSubmit}
        disabled={saldoSetelahPrint < 0}
      >
        <Printer className="h-4 w-4" />
        Submit Print Job
      </Button>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value}</span>
    </div>
  );
}
