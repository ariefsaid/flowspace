"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Coffee, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { Button, Card, Input, Select } from "@/components/ui";
import { formatRupiah } from "@/lib/format";
import { CAFE_CATEGORIES, type CafeCategory } from "@/lib/db/enums";
import type { CafeMenuItem } from "@/lib/db/schema";
import {
  archiveMenuItemAction,
  createMenuItemAction,
  toggleAvailableAction,
  updateMenuItemAction,
} from "./actions";

/** Display labels for the enum categories (parity with the original's literal category strings). */
const CATEGORY_LABELS: Record<CafeCategory, string> = {
  COFFEE: "Coffee",
  NON_COFFEE: "Non-Coffee",
  FOOD: "Food",
  SNACK: "Snack",
};

type FormState = {
  id: string | null;
  name: string;
  emoji: string;
  category: CafeCategory;
  priceRupiah: string;
  description: string;
  available: boolean;
};

const emptyForm: FormState = {
  id: null,
  name: "",
  emoji: "🍽️",
  category: "COFFEE",
  priceRupiah: "",
  description: "",
  available: true,
};

function toFormState(item: CafeMenuItem): FormState {
  return {
    id: item.id,
    name: item.name,
    emoji: item.emoji,
    category: item.category,
    priceRupiah: String(item.priceRupiah),
    description: item.description,
    available: item.available,
  };
}

export function MenuClient({ items: initialItems }: { items: CafeMenuItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<"ALL" | CafeCategory>("ALL");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const visibleItems = filter === "ALL" ? items : items.filter((i) => i.category === filter);
  const grouped = CAFE_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    rows: visibleItems.filter((i) => i.category === category),
  })).filter((g) => g.rows.length > 0);

  function openCreate() {
    setFormError(null);
    setForm(emptyForm);
  }

  function openEdit(item: CafeMenuItem) {
    setFormError(null);
    setForm(toFormState(item));
  }

  function closeForm() {
    setForm(null);
    setFormError(null);
  }

  function priceMessage(e: unknown): string {
    if (e instanceof Error && e.message === "INVALID_PRICE") {
      return "Harga harus berupa angka bulat, tidak boleh negatif.";
    }
    return "Gagal menyimpan menu. Coba lagi.";
  }

  async function onSaveForm() {
    if (!form) return;
    if (!form.name.trim()) {
      setFormError("Nama menu wajib diisi.");
      return;
    }
    const priceRupiah = Number(form.priceRupiah);
    if (!Number.isInteger(priceRupiah) || priceRupiah < 0) {
      setFormError("Harga harus berupa angka bulat, tidak boleh negatif.");
      return;
    }

    setSaving(true);
    setFormError(null);
    const input = {
      name: form.name.trim(),
      emoji: form.emoji.trim() || "🍽️",
      category: form.category,
      priceRupiah,
      description: form.description.trim(),
      available: form.available,
    };

    try {
      if (form.id) {
        await updateMenuItemAction(form.id, input);
        setItems((prev) => prev.map((i) => (i.id === form.id ? { ...i, ...input } : i)));
      } else {
        const created = await createMenuItemAction(input);
        setItems((prev) => [...prev, created]);
      }
      setForm(null);
      router.refresh();
    } catch (e) {
      setFormError(priceMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function onToggleAvailable(item: CafeMenuItem) {
    const next = !item.available;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: next } : i)));
    setRowError(null);
    try {
      await toggleAvailableAction(item.id, next);
      router.refresh();
    } catch {
      // roll back on failure
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: item.available } : i)));
      setRowError("Gagal mengubah status ketersediaan. Coba lagi.");
    }
  }

  async function onConfirmArchive(item: CafeMenuItem) {
    setRowError(null);
    try {
      await archiveMenuItemAction(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setConfirmingId(null);
      router.refresh();
    } catch {
      setRowError("Gagal mengarsipkan menu. Coba lagi.");
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
      <div>
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Settings
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Coffee className="h-8 w-8 text-orange-500" aria-hidden="true" />
              Kelola Menu Cafe
            </h1>
            <p className="mt-1 text-sm text-gray-500">Total {items.length} item menu</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="block">
              <span className="sr-only">Filter kategori</span>
              <Select
                aria-label="Filter kategori"
                className="w-40"
                value={filter}
                onChange={(e) => setFilter(e.target.value as "ALL" | CafeCategory)}
              >
                <option value="ALL">Semua</option>
                {CAFE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </label>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tambah Menu
            </Button>
          </div>
        </div>
      </div>

      {rowError && (
        <p role="alert" className="text-sm text-red-600">
          {rowError}
        </p>
      )}

      {form && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            {form.id ? "Edit Menu" : "Tambah Menu"}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-gray-700">Nama Menu</span>
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                placeholder="Contoh: Americano"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Kategori</span>
              <Select
                className="mt-1"
                value={form.category}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, category: e.target.value as CafeCategory } : f))
                }
              >
                {CAFE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Harga (Rp)</span>
              <Input
                type="number"
                min={0}
                className="mt-1"
                value={form.priceRupiah}
                onChange={(e) => setForm((f) => (f ? { ...f, priceRupiah: e.target.value } : f))}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Emoji/Icon</span>
              <Input
                className="mt-1"
                value={form.emoji}
                onChange={(e) => setForm((f) => (f ? { ...f, emoji: e.target.value } : f))}
                placeholder="☕"
              />
            </label>
            <label className="flex items-center gap-2 sm:mt-6">
              <input
                type="checkbox"
                checked={form.available}
                onChange={(e) => setForm((f) => (f ? { ...f, available: e.target.checked } : f))}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 accent-teal-600 cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-700">Tersedia</span>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-gray-700">Deskripsi</span>
              <textarea
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-gray-400 focus-visible:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => (f ? { ...f, description: e.target.value } : f))}
                placeholder="Deskripsi menu..."
              />
            </label>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-red-600">
              {formError}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={onSaveForm} disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
            <Button variant="outline" onClick={closeForm} disabled={saving}>
              Batal
            </Button>
          </div>
        </Card>
      )}

      {items.length === 0 && !form && (
        <div className="py-12 text-center">
          <Coffee className="mx-auto mb-4 h-12 w-12 text-gray-500" aria-hidden="true" />
          <p className="text-gray-500">Belum ada menu. Tambahkan menu pertama!</p>
        </div>
      )}

      {grouped.map(({ category, label, rows }) => (
        <div key={category}>
          <h2 className="mb-3 text-xl font-semibold text-gray-800">
            {label} ({rows.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((item) => (
              <Card key={item.id} className={item.available ? undefined : "opacity-60"}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl" aria-hidden="true">
                      {item.emoji || "🍽️"}
                    </span>
                    <span className="font-semibold text-gray-900">{item.name}</span>
                  </div>
                  <label className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={item.available}
                      onChange={() => onToggleAvailable(item)}
                      aria-label={`Tersedia — ${item.name}`}
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 accent-teal-600 cursor-pointer"
                    />
                  </label>
                </div>
                <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                  {item.description || "Tidak ada deskripsi"}
                </p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {formatRupiah(item.priceRupiah)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => openEdit(item)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Edit
                  </Button>
                  {confirmingId === item.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Yakin arsipkan?</span>
                      <Button size="sm" variant="danger" onClick={() => onConfirmArchive(item)}>
                        Arsipkan
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                        Batal
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label={`Arsipkan ${item.name}`}
                      onClick={() => setConfirmingId(item.id)}
                    >
                      Arsipkan
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
