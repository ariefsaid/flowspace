"use client";
/**
 * Printer CRUD client (I-043, spec 0009). Admin settings surface.
 *
 * Accessible labelled form for every printer field (CUPS name, display name,
 * location, type, color support, paper-size checkboxes, active/default flags,
 * sort order) with create/edit/archive/default controls, empty state, and
 * saving/error feedback. The server action re-checks ADMIN + org scope; this
 * component never sends an orgId.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Plus, Save, ArrowLeft, Inbox } from "lucide-react";
import Link from "next/link";
import { Card, Input, Select, Button, Badge } from "@/components/ui";
import {
  createPrinterAction,
  updatePrinterAction,
  archivePrinterAction,
  setDefaultPrinterAction,
} from "./actions";
import type { PrinterType } from "@/lib/db/enums";

export type PrinterRow = {
  id: string;
  name: string;
  displayName: string;
  location: string | null;
  printerType: PrinterType;
  colorSupport: boolean;
  paperSizes: string[];
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  archivedAt: string | null;
};

const PAPER_SIZES = ["A4", "A3", "F4"] as const;
type PaperSize = (typeof PAPER_SIZES)[number];

type FormState = {
  name: string;
  displayName: string;
  location: string;
  printerType: PrinterType;
  colorSupport: boolean;
  paperSizes: PaperSize[];
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
};

const EMPTY_FORM: FormState = {
  name: "",
  displayName: "",
  location: "",
  printerType: "LASER",
  colorSupport: false,
  paperSizes: ["A4"],
  isActive: true,
  isDefault: false,
  sortOrder: 0,
};

function toForm(p: PrinterRow): FormState {
  return {
    name: p.name,
    displayName: p.displayName,
    location: p.location ?? "",
    printerType: p.printerType,
    colorSupport: p.colorSupport,
    paperSizes: PAPER_SIZES.filter((s) => p.paperSizes.includes(s)),
    isActive: p.isActive,
    isDefault: p.isDefault,
    sortOrder: p.sortOrder,
  };
}

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (/PRINTER_NAME_EXISTS/.test(msg)) {
    return "Nama CUPS sudah dipakai di venue ini.";
  }
  if (/INVALID_PRINTER/.test(msg)) {
    return "Data printer tidak valid — periksa nama dan ukuran kertas.";
  }
  if (/ARCHIVED/.test(msg)) {
    return "Printer terarsip tidak bisa dijadikan default.";
  }
  return "Gagal menyimpan. Coba lagi.";
}

export function PrintersClient({ printers }: { printers: PrinterRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function togglePaper(size: PaperSize, checked: boolean) {
    setForm((f) => ({
      ...f,
      paperSizes: checked
        ? [...f.paperSizes, size]
        : f.paperSizes.filter((s) => s !== size),
    }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setStatus("idle");
    setError(null);
  }

  async function onSubmit() {
    setStatus("saving");
    setError(null);
    try {
      if (editingId) {
        await updatePrinterAction({
          id: editingId,
          name: form.name,
          displayName: form.displayName,
          location: form.location,
          printerType: form.printerType,
          colorSupport: form.colorSupport,
          paperSizes: form.paperSizes,
          isActive: form.isActive,
          sortOrder: form.sortOrder,
        });
      } else {
        await createPrinterAction({
          name: form.name,
          displayName: form.displayName,
          location: form.location,
          printerType: form.printerType,
          colorSupport: form.colorSupport,
          paperSizes: form.paperSizes,
          sortOrder: form.sortOrder,
        });
      }
      resetForm();
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(errorMessage(e));
    }
  }

  async function onRowAction(id: string, fn: (id: string) => Promise<void>) {
    setRowBusy(id);
    setError(null);
    try {
      await fn(id);
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(errorMessage(e));
    } finally {
      setRowBusy(null);
    }
  }

  const saving = status === "saving";

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Daftar Printer</h1>
        <p className="mt-1 text-sm text-gray-500">
          Kelola printer yang tersedia untuk cetak anggota.
        </p>
      </div>

      {/* Create / edit form */}
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Printer className="h-5 w-5 text-teal-600" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-gray-800">
            {editingId ? "Edit Printer" : "Tambah Printer"}
          </h2>
        </div>
        <form
          className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Nama CUPS</span>
            <Input
              className="mt-1"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="HP_LaserJet_Pro"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Nama Tampilan</span>
            <Input
              className="mt-1"
              value={form.displayName}
              onChange={(e) => set("displayName", e.target.value)}
              placeholder="Printer Lobi"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Lokasi</span>
            <Input
              className="mt-1"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Lantai 1"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Tipe Printer</span>
            <Select
              className="mt-1"
              value={form.printerType}
              onChange={(e) => set("printerType", e.target.value as PrinterType)}
            >
              <option value="LASER">Laser</option>
              <option value="INKJET">Inkjet</option>
            </Select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Urutan</span>
            <Input
              type="number"
              min={0}
              className="mt-1"
              value={form.sortOrder}
              onChange={(e) => set("sortOrder", Number(e.target.value) || 0)}
            />
          </label>

          {/* Checkboxes */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-teal-500/40"
                checked={form.colorSupport}
                onChange={(e) => set("colorSupport", e.target.checked)}
              />
              Dukungan Warna
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-teal-500/40"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
              />
              Aktif
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-teal-500/40"
                checked={form.isDefault}
                onChange={(e) => set("isDefault", e.target.checked)}
              />
              Printer Default
            </label>
          </div>

          {/* Paper-size checkboxes */}
          <fieldset className="block">
            <legend className="text-sm font-medium text-gray-700">
              Ukuran Kertas
            </legend>
            <div className="mt-1 flex gap-4">
              {PAPER_SIZES.map((size) => (
                <label key={size} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-teal-500/40"
                    checked={form.paperSizes.includes(size)}
                    onChange={(e) => togglePaper(size, e.target.checked)}
                  />
                  {size}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {editingId ? (
                <Save className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {saving
                ? "Menyimpan…"
                : editingId
                  ? "Simpan Perubahan"
                  : "Tambah Printer"}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={resetForm} disabled={saving}>
                Batal
              </Button>
            )}
            {status === "error" && error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
        </form>
      </Card>

      {/* Printer list */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
          <Printer className="h-5 w-5 text-teal-600" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-gray-800">Printer Terdaftar</h2>
          <span className="ml-auto text-xs text-gray-400">
            {printers.length} printer
          </span>
        </div>

        {printers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50">
              <Inbox className="h-7 w-7 text-teal-400" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-gray-700">Belum ada printer</p>
            <p className="max-w-xs text-xs text-gray-400">
              Tambahkan printer pertama melalui formulir di atas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Printer</th>
                  <th className="px-4 py-3">Lokasi</th>
                  <th className="px-4 py-3">Kemampuan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {printers.map((p) => (
                  <tr key={p.id} className={p.archivedAt ? "opacity-60" : undefined}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{p.displayName}</div>
                      <div className="text-xs text-gray-500">{p.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.location ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.colorSupport ? "Warna" : "B/W"} · {p.paperSizes.join(", ")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.archivedAt ? (
                          <Badge tone="pending">Terarsip</Badge>
                        ) : p.isActive ? (
                          <Badge tone="active">Aktif</Badge>
                        ) : (
                          <Badge tone="pending">Nonaktif</Badge>
                        )}
                        {p.isDefault && !p.archivedAt && (
                          <Badge tone="completed">Default</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(p.id);
                            setForm(toForm(p));
                            setError(null);
                          }}
                        >
                          Edit
                        </Button>
                        {!p.archivedAt && !p.isDefault && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={rowBusy === p.id}
                            onClick={() =>
                              void onRowAction(p.id, setDefaultPrinterAction)
                            }
                          >
                            Jadikan Default
                          </Button>
                        )}
                        {!p.archivedAt && (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={rowBusy === p.id}
                            onClick={() => void onRowAction(p.id, archivePrinterAction)}
                          >
                            Arsipkan
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
