"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingCart, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { brand } from "@/brand.config";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { placeOrder } from "@/app/cafe/actions";
import type { OrderLineInput } from "@/lib/cafe/types";

// ---------------------------------------------------------------------------
// View shape — DB CafeMenuItem mapped to what this component consumes
// ---------------------------------------------------------------------------

export interface GuestMenuItemView {
  id: string;
  name: string;
  emoji: string;
  /** DB enum: COFFEE / NON_COFFEE / FOOD / SNACK */
  category: string;
  priceRupiah: number;
  description: string;
  hasVariants: boolean;
}

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type TemperatureOption = "Hot" | "Cold" | "Ice Blended";
type SugarOption = "Normal Sugar" | "Less Sugar" | "No Sugar";

interface CartItem {
  menuItem: GuestMenuItemView;
  qty: number;
  temperature?: TemperatureOption;
  sugar?: SugarOption;
}

type CategoryTab = "Semua" | string;

/** Map DB enum to display label */
const CATEGORY_LABEL: Record<string, string> = {
  COFFEE: "Coffee",
  NON_COFFEE: "Non-Coffee",
  FOOD: "Food",
  SNACK: "Snack",
};

const CATEGORY_TABS: { key: CategoryTab; label: string }[] = [
  { key: "Semua", label: "Semua" },
  { key: "COFFEE", label: "Coffee" },
  { key: "FOOD", label: "Food" },
  { key: "NON_COFFEE", label: "Non-Coffee" },
  { key: "SNACK", label: "Snack" },
];

// ---------------------------------------------------------------------------
// Variant Modal
// ---------------------------------------------------------------------------

interface VariantModalProps {
  item: GuestMenuItemView;
  onClose: () => void;
  onAdd: (item: GuestMenuItemView, temperature: TemperatureOption, sugar: SugarOption) => void;
}

function VariantModal({ item, onClose, onAdd }: VariantModalProps) {
  const [temperature, setTemperature] = useState<TemperatureOption>("Hot");
  const [sugar, setSugar] = useState<SugarOption>("Normal Sugar");

  const temperatures: TemperatureOption[] = ["Hot", "Cold", "Ice Blended"];
  const sugars: SugarOption[] = ["Normal Sugar", "Less Sugar", "No Sugar"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-md">
        {/* Header */}
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{item.emoji}</span>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{item.name}</h3>
              <p className="text-sm text-gray-500">{formatRupiah(item.priceRupiah)}</p>
            </div>
          </div>
        </div>
        {/* Body */}
        <div className="space-y-4 p-4">
          {/* Temperature */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-800">Suhu</p>
            <div className="flex flex-wrap gap-2">
              {temperatures.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTemperature(t)}
                  className={cn(
                    "rounded-[10px] border px-3 py-1.5 text-sm font-medium transition-colors",
                    temperature === t
                      ? "border-teal-500 bg-teal-50 text-teal-700"
                      : "border-slate-200 bg-white text-gray-600 hover:border-slate-300",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {/* Sugar level */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-800">Level Gula</p>
            <div className="flex flex-wrap gap-2">
              {sugars.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSugar(s)}
                  className={cn(
                    "rounded-[10px] border px-3 py-1.5 text-sm font-medium transition-colors",
                    sugar === s
                      ? "border-teal-500 bg-teal-50 text-teal-700"
                      : "border-slate-200 bg-white text-gray-600 hover:border-slate-300",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Footer */}
        <div className="flex gap-2 border-t border-slate-200 p-4">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => onAdd(item, temperature, sugar)}
          >
            Tambah ke Keranjang
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu Item Card
// ---------------------------------------------------------------------------

interface MenuItemCardProps {
  item: GuestMenuItemView;
  onAddDirect: (item: GuestMenuItemView) => void;
  onPickVariant: (item: GuestMenuItemView) => void;
}

function MenuItemCard({ item, onAddDirect, onPickVariant }: MenuItemCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      {/* Top row: emoji + name/badges + price */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="shrink-0 text-2xl leading-none">{item.emoji}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-800 leading-tight">{item.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {CATEGORY_LABEL[item.category] ?? item.category}
              </span>
              {item.hasVariants && (
                <span className="rounded-full border border-teal-500 bg-white px-2 py-0.5 text-xs font-medium text-teal-600">
                  Pilih Variant
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-teal-600">{formatRupiah(item.priceRupiah)}</p>
          {item.hasVariants && (
            <p className="text-xs text-gray-500">+pilihan</p>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed">{item.description}</p>

      {/* CTA button */}
      {item.hasVariants ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onPickVariant(item)}
        >
          <Plus className="h-4 w-4" />
          Pilih Variant
        </Button>
      ) : (
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          onClick={() => onAddDirect(item)}
        >
          <Plus className="h-4 w-4" />
          Tambah
        </Button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Checkout Modal
// ---------------------------------------------------------------------------

interface CheckoutModalProps {
  cart: CartItem[];
  total: number;
  onClose: () => void;
  onConfirm: (guestName: string) => void;
  /** Indonesian error message to display when placeOrder rejects. */
  error?: string | null;
  /** Whether the order submission is in flight. */
  pending?: boolean;
}

function CheckoutModal({ cart, total, onClose, onConfirm, error, pending }: CheckoutModalProps) {
  const [guestName, setGuestName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (guestName.trim()) {
      onConfirm(guestName.trim());
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-md">
        <div className="border-b border-slate-200 p-4">
          <h3 className="text-lg font-semibold text-gray-800">Konfirmasi Pesanan</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 p-4">
            {/* Order summary */}
            <div className="space-y-2">
              {cart.map((ci, idx) => (
                <div key={idx} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-800">
                      {ci.qty}x {ci.menuItem.name}
                    </span>
                    {ci.temperature && (
                      <p className="text-xs text-gray-500">
                        {ci.temperature}, {ci.sugar}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-gray-700">
                    {formatRupiah(ci.menuItem.priceRupiah * ci.qty)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 pt-2">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-gray-800">Total</span>
                <span className="text-teal-600">{formatRupiah(total)}</span>
              </div>
            </div>
            {/* Guest name input */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-800">
                Nama Anda
              </label>
              <Input
                placeholder="Masukkan nama Anda"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Nama akan dipanggil saat pesanan siap.
              </p>
            </div>
            {/* Server-action error (AC-102) */}
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}
          </div>
          <div className="flex gap-2 border-t border-slate-200 p-4">
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
              Batal
            </Button>
            <Button
              type="submit"
              variant="accent"
              className="flex-1"
              disabled={!guestName.trim() || pending}
            >
              {pending ? "Memproses…" : "Pesan Sekarang"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success Modal
// ---------------------------------------------------------------------------

interface SuccessModalProps {
  guestName: string;
  onClose: () => void;
}

function SuccessModal({ guestName, onClose }: SuccessModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-md text-center">
        <div className="mb-4 text-5xl">🎉</div>
        <h3 className="mb-2 text-lg font-semibold text-gray-800">Pesanan Diterima!</h3>
        <p className="mb-1 text-sm text-gray-600">
          Terima kasih, <span className="font-medium text-gray-900">{guestName}</span>!
        </p>
        <p className="mb-6 text-sm text-gray-500">
          Pesanan Anda sedang diproses. Kami akan memanggil nama Anda saat siap.
        </p>
        <Button variant="primary" className="w-full" onClick={onClose}>
          Selesai
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props & main component
// ---------------------------------------------------------------------------

export interface GuestCafeClientProps {
  menu: GuestMenuItemView[];
}

/** Map server-action error sentinels to user-facing Indonesian copy. */
function toOrderErrorMessage(err: unknown): string {
  const sentinel = err instanceof Error ? err.message : String(err);
  const map: Record<string, string> = {
    INVALID_MENU_ITEMS: "Sebagian item tidak tersedia. Perbarui keranjang Anda.",
    INVALID_QUANTITY: "Jumlah pesanan tidak valid.",
    EMPTY_ORDER: "Keranjang masih kosong.",
    GUEST_NAME_REQUIRED: "Nama wajib diisi.",
    ORG_NOT_FOUND: "Pesanan gagal diproses. Coba lagi.",
    CODE_GENERATION_FAILED: "Pesanan gagal diproses. Coba lagi.",
  };
  return map[sentinel] ?? "Pesanan gagal diproses. Coba lagi.";
}

export function GuestCafeClient({ menu }: GuestCafeClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<CategoryTab>("Semua");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [variantItem, setVariantItem] = useState<GuestMenuItemView | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successName, setSuccessName] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderPending, setOrderPending] = useState(false);

  // Filter menu by selected tab
  const filtered =
    activeTab === "Semua"
      ? menu
      : menu.filter((m) => m.category === activeTab);

  // Cart helpers
  function addToCart(item: GuestMenuItemView, temperature?: TemperatureOption, sugar?: SugarOption) {
    setCart((prev) => {
      const matchIdx = prev.findIndex(
        (ci) =>
          ci.menuItem.id === item.id &&
          ci.temperature === temperature &&
          ci.sugar === sugar,
      );
      if (matchIdx >= 0) {
        const updated = [...prev];
        updated[matchIdx] = { ...updated[matchIdx], qty: updated[matchIdx].qty + 1 };
        return updated;
      }
      return [...prev, { menuItem: item, qty: 1, temperature, sugar }];
    });
  }

  function removeFromCart(idx: number) {
    setCart((prev) => {
      const updated = [...prev];
      if (updated[idx].qty > 1) {
        updated[idx] = { ...updated[idx], qty: updated[idx].qty - 1 };
        return updated;
      }
      return updated.filter((_, i) => i !== idx);
    });
  }

  const cartTotal = cart.reduce((sum, ci) => sum + ci.menuItem.priceRupiah * ci.qty, 0);
  const cartCount = cart.reduce((sum, ci) => sum + ci.qty, 0);

  function handleVariantAdd(item: GuestMenuItemView, temp: TemperatureOption, sugar: SugarOption) {
    addToCart(item, temp, sugar);
    setVariantItem(null);
  }

  async function handleConfirmOrder(guestName: string) {
    setOrderError(null);
    setOrderPending(true);

    // Map temperature/sugar to DB enums
    const tempMap: Record<TemperatureOption, OrderLineInput["temperature"]> = {
      Hot: "HOT",
      Cold: "COLD",
      "Ice Blended": "ICE_BLENDED",
    };
    const sugarMap: Record<SugarOption, OrderLineInput["sugar"]> = {
      "Normal Sugar": "NORMAL",
      "Less Sugar": "LESS",
      "No Sugar": "NONE",
    };

    const lines: OrderLineInput[] = cart.map((ci) => ({
      menuItemId: ci.menuItem.id,
      qty: ci.qty,
      temperature: ci.temperature ? tempMap[ci.temperature] : null,
      sugar: ci.sugar ? sugarMap[ci.sugar] : null,
    }));

    try {
      await placeOrder({ lines, guestName });
    } catch (err) {
      setOrderError(toOrderErrorMessage(err));
      setOrderPending(false);
      return;
    }

    setOrderPending(false);
    setCart([]);
    setCheckoutOpen(false);
    setSuccessName(guestName);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <>
      <div className="container mx-auto px-4 py-6">
        {/* Header — full-width teal gradient band */}
        <div className="-mx-4 mb-6 bg-gradient-to-br from-teal-500 to-teal-600 px-4 py-5">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white hover:bg-white/10 transition-colors"
                aria-label="Kembali"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
                ☕ {brand.name} Cafe
              </h1>
              <p className="text-sm text-teal-50">Order sebagai Guest</p>
            </div>
          </div>
        </div>

        {/* Mode Guest info banner */}
        <div className="mb-6 flex gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="shrink-0 mt-0.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-orange-800">Mode Guest</p>
            <p className="mt-0.5 text-sm text-orange-700">
              Anda dapat memesan makanan &amp; minuman tanpa login. Cukup masukkan nama
              Anda saat checkout. Untuk booking ruangan dan layanan print, silakan{" "}
              <Link
                href="/signup"
                className="font-medium underline underline-offset-2 hover:text-orange-900"
              >
                daftar member
              </Link>
              .
            </p>
          </div>
        </div>

        {/* Main two-column layout: menu + cart */}
        <div className="flex gap-6 items-start">
          {/* Left: category tabs + menu grid */}
          <div className="min-w-0 flex-1">
            {/* Category tabs */}
            <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Kategori menu">
              {CATEGORY_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                    activeTab === t.key
                      ? "border-teal-500 bg-teal-500 text-white"
                      : "border-teal-500 bg-white text-teal-600 hover:bg-teal-50",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Menu grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onAddDirect={(i) => addToCart(i)}
                  onPickVariant={(i) => setVariantItem(i)}
                />
              ))}
            </div>
          </div>

          {/* Right: cart panel */}
          <div className="hidden w-72 shrink-0 lg:block">
            <div className="sticky top-20">
              <Card className="space-y-4">
                {/* Cart header */}
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-gray-800">
                    <ShoppingCart className="h-4 w-4 text-teal-600" />
                    Keranjang
                  </h3>
                  {cartCount > 0 && (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">
                      {cartCount} item
                    </span>
                  )}
                </div>

                {/* Cart items or empty state */}
                {cart.length === 0 ? (
                  <div className="py-6 text-center">
                    <ShoppingCart className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                    <p className="text-sm text-gray-500">Keranjang masih kosong</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {cart.map((ci, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-800">
                              {ci.menuItem.name}
                            </p>
                            {ci.temperature && (
                              <p className="text-xs text-gray-500">
                                {ci.temperature}, {ci.sugar}
                              </p>
                            )}
                            <p className="text-xs text-teal-600">
                              {formatRupiah(ci.menuItem.priceRupiah * ci.qty)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => removeFromCart(idx)}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-gray-600 hover:bg-slate-50 text-sm font-medium transition-colors"
                            >
                              −
                            </button>
                            <span className="w-5 text-center text-sm font-semibold text-gray-800">
                              {ci.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                ci.menuItem.hasVariants
                                  ? setVariantItem(ci.menuItem)
                                  : addToCart(ci.menuItem)
                              }
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-gray-600 hover:bg-slate-50 text-sm font-medium transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Subtotal */}
                    <div className="border-t border-slate-200 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Total</span>
                        <span className="text-sm font-bold text-gray-900">
                          {formatRupiah(cartTotal)}
                        </span>
                      </div>
                    </div>

                    {/* Checkout button */}
                    <Button
                      variant="accent"
                      className="w-full"
                      onClick={() => setCheckoutOpen(true)}
                    >
                      Checkout
                    </Button>
                  </>
                )}
              </Card>
            </div>
          </div>
        </div>

        {/* Mobile sticky cart bar */}
        {cartCount > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white p-3 shadow-md lg:hidden">
            <Button
              variant="accent"
              className="w-full"
              onClick={() => setCheckoutOpen(true)}
            >
              <ShoppingCart className="h-4 w-4" />
              Lihat Keranjang ({cartCount} item) — {formatRupiah(cartTotal)}
            </Button>
          </div>
        )}
      </div>

      {/* Variant picker modal */}
      {variantItem && (
        <VariantModal
          item={variantItem}
          onClose={() => setVariantItem(null)}
          onAdd={handleVariantAdd}
        />
      )}

      {/* Checkout modal */}
      {checkoutOpen && (
        <CheckoutModal
          cart={cart}
          total={cartTotal}
          onClose={() => { setCheckoutOpen(false); setOrderError(null); }}
          onConfirm={handleConfirmOrder}
          error={orderError}
          pending={orderPending}
        />
      )}

      {/* Success modal */}
      {successName && (
        <SuccessModal
          guestName={successName}
          onClose={() => setSuccessName(null)}
        />
      )}
    </>
  );
}
