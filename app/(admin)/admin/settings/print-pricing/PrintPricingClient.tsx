"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Save, Check } from "lucide-react";
import { Card, Input, Button, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { PRINT_COLOR_MODES, PRINT_PAPER_SIZES, type PrintColorMode, type PrintPaperSize } from "@/lib/db/enums";
import type { MatrixCell } from "./toMatrixCells";
import { upsertPrintPricingCellAction } from "./actions";

const COLOR_MODE_LABELS: Record<PrintColorMode, string> = {
  BW: "Hitam-Putih",
  COLOR: "Warna",
};

/** Sane upper bound for a per-page print rate (Rp). The server re-validates positivity. */
const RATE_MAX = 1_000_000;

/** Parse a number input to an integer clamped to [min, max] (server re-validates). */
function toInt(value: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

type CellStatus = "idle" | "saving" | "saved" | "error";
type CellState = MatrixCell & { status: CellStatus; error: string | null };

function cellKey(c: Pick<MatrixCell, "colorMode" | "paperSize">): string {
  return `${c.colorMode}:${c.paperSize}`;
}

/** Accessible on/off switch — no shared `components/ui` primitive exists for this yet. */
function ActiveSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
        checked ? "bg-teal-500" : "bg-slate-200",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

function MatrixCellEditor({
  cell,
  onEdit,
  onSave,
}: {
  cell: CellState;
  onEdit: (patch: Partial<Pick<CellState, "pricePerPageRupiah" | "isActive">>) => void;
  onSave: () => void;
}) {
  const modeLabel = COLOR_MODE_LABELS[cell.colorMode];
  const suffix = `${modeLabel} ${cell.paperSize}`;
  const saving = cell.status === "saving";

  return (
    <div className="space-y-2">
      {!cell.configured && (
        <Badge tone="neutral" className="mb-1">
          Belum diatur
        </Badge>
      )}
      <label className="block">
        <span className="text-xs text-gray-500">Harga (Rp / halaman)</span>
        <Input
          type="number"
          min={1}
          max={RATE_MAX}
          aria-label={`Harga ${suffix}`}
          className="mt-1"
          value={cell.pricePerPageRupiah}
          disabled={saving}
          onChange={(e) => onEdit({ pricePerPageRupiah: toInt(e.target.value, 0, RATE_MAX) })}
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ActiveSwitch
            label={`Aktif ${suffix}`}
            checked={cell.isActive}
            onChange={(next) => onEdit({ isActive: next })}
          />
          <span className="text-xs text-gray-500">Aktif</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Simpan ${suffix}`}
          disabled={saving}
          onClick={onSave}
        >
          {cell.status === "saved" ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Simpan
        </Button>
      </div>
      {cell.status === "saving" && (
        <p className="text-xs text-gray-500">Menyimpan…</p>
      )}
      {cell.status === "saved" && (
        <p className="text-xs text-teal-600">Tersimpan</p>
      )}
      {cell.status === "error" && cell.error && (
        <p role="alert" className="text-xs text-red-600">
          {cell.error}
        </p>
      )}
    </div>
  );
}

export function PrintPricingClient({ cells: initialCells }: { cells: MatrixCell[] }) {
  const [cells, setCells] = useState<CellState[]>(
    initialCells.map((c) => ({ ...c, status: "idle" as const, error: null })),
  );

  function editCell(
    key: string,
    patch: Partial<Pick<CellState, "pricePerPageRupiah" | "isActive">>,
  ) {
    setCells((prev) =>
      prev.map((c) => (cellKey(c) === key ? { ...c, ...patch, status: "idle", error: null } : c)),
    );
  }

  async function saveCell(cell: CellState) {
    const key = cellKey(cell);
    setCells((prev) =>
      prev.map((c) => (cellKey(c) === key ? { ...c, status: "saving", error: null } : c)),
    );
    try {
      await upsertPrintPricingCellAction({
        colorMode: cell.colorMode,
        paperSize: cell.paperSize,
        pricePerPageRupiah: cell.pricePerPageRupiah,
        isActive: cell.isActive,
      });
      setCells((prev) =>
        prev.map((c) =>
          cellKey(c) === key ? { ...c, status: "saved", configured: true, error: null } : c,
        ),
      );
    } catch (e) {
      const message =
        e instanceof Error && /INVALID/.test(e.message)
          ? "Harga tidak valid — harus bilangan bulat positif."
          : "Gagal menyimpan. Coba lagi.";
      setCells((prev) =>
        prev.map((c) => (cellKey(c) === key ? { ...c, status: "error", error: message } : c)),
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
        <h1 className="mt-2 text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Printer className="h-7 w-7 text-teal-600" aria-hidden="true" />
          Harga Print
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Atur harga per halaman &amp; status aktif untuk tiap kombinasi mode warna &amp; ukuran kertas.
        </p>
      </div>

      {/* Matrix */}
      <Card className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Ukuran
                </th>
                {PRINT_COLOR_MODES.map((mode) => (
                  <th
                    key={mode}
                    className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-gray-500 last:pr-0"
                  >
                    {COLOR_MODE_LABELS[mode]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {PRINT_PAPER_SIZES.map((paperSize: PrintPaperSize) => (
                <tr key={paperSize}>
                  <td className="py-3 pr-4 align-top font-medium text-gray-900">{paperSize}</td>
                  {PRINT_COLOR_MODES.map((mode) => {
                    const cell = cells.find((c) => c.colorMode === mode && c.paperSize === paperSize);
                    if (!cell) return <td key={mode} className="py-3 pr-4 last:pr-0" />;
                    return (
                      <td key={mode} className="py-3 pr-4 align-top last:pr-0">
                        <MatrixCellEditor
                          cell={cell}
                          onEdit={(patch) => editCell(cellKey(cell), patch)}
                          onSave={() => saveCell(cell)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
