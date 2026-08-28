"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, ShoppingCart, User } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/cn";
import { VariantPickerModal } from "@/components/cafe/VariantPickerModal";
import { cartLineKey, addCartLine } from "@/lib/cafe/cart";
import type { CartLine } from "@/lib/cafe/cart";
import { lookupPosMemberAction, placePosOrder } from "./actions";
import type { PosMemberLookup } from "./actions";
import type { OrderLineInput, VariantConfig, VariantSelectionInput } from "@/lib/cafe/types";

// ---------------------------------------------------------------------------
// View shape — DB CafeMenuItem mapped to what this component consumes
// ---------------------------------------------------------------------------

export interface PosMenuItemView {
  id: string;
  name: string;
  emoji: string;
  /** DB enum: COFFEE / NON_COFFEE / FOOD / SNACK */
  category: string;
  priceRupiah: number;
  description: string;
  hasVariants: boolean;
  variantConfig?: VariantConfig | null;
}

// ---------------------------------------------------------------------------
// Display-name overrides to match the screenshot / text recon exactly.
// These FE overrides are applied after loading from DB (FR-103 note).
// ---------------------------------------------------------------------------
const DISPLAY_NAMES: Record<string, string> = {
  salad: "Salad Bowl",
  "nasi-rames": "Nasi Goreng",
  "tahu-goreng": "French Fries",
};

/** Items in the DB but hidden in the original POS screenshot (OBS-130 note). */
const HIDDEN_IDS = new Set<string>(["tempe-orek"]);

function getDisplayName(id: string, fallback: string): string {
  // The seeded id is `${orgId}__${mockId}` — check suffix after last `__`
  const parts = id.split("__");
  const shortId = parts[parts.length - 1];
  return DISPLAY_NAMES[shortId] ?? fallback;
}

function isHidden(id: string): boolean {
  const parts = id.split("__");
  return HIDDEN_IDS.has(parts[parts.length - 1]);
}

// ---------------------------------------------------------------------------
// Cart types
// ---------------------------------------------------------------------------
interface PosCartLine extends CartLine {
  name: string;
  price: number;
}

/** Renders an ordered set of selected variant options as "Group: Option, Group: Option". */
function formatOptions(options: VariantSelectionInput[]): string | null {
  if (!options.length) return null;
  return options.map((o) => `${o.variantName}: ${o.optionName}`).join(", ");
}

// ---------------------------------------------------------------------------
// Category display labels
// ---------------------------------------------------------------------------
const CATEGORY_LABEL: Record<string, string> = {
  COFFEE: "Coffee",
  NON_COFFEE: "Non-Coffee",
  FOOD: "Food",
  SNACK: "Snack",
};

const CATEGORY_ORDER = ["COFFEE", "NON_COFFEE", "FOOD", "SNACK"] as const;
const NOTES_MAX_LENGTH = 500;

/** Map placePosOrder/lookupPosMemberAction error sentinels to Indonesian copy. */
function toPosErrorMessage(err: unknown): string {
  const sentinel = err instanceof Error ? err.message : String(err);
  const map: Record<string, string> = {
    MEMBER_NOT_FOUND: "Member tidak ditemukan untuk email tersebut.",
    INVALID_MENU_ITEMS: "Sebagian item tidak tersedia. Perbarui keranjang.",
    INVALID_QUANTITY: "Jumlah pesanan tidak valid.",
    INVALID_VARIANTS: "Pilihan variant tidak valid.",
    MISSING_REQUIRED_VARIANT: "Lengkapi pilihan variant yang wajib diisi.",
    INVALID_NOTES: "Catatan terlalu panjang (maksimal 500 karakter).",
    EMPTY_ORDER: "Keranjang masih kosong.",
    FORBIDDEN: "Anda tidak memiliki akses untuk aksi ini.",
  };
  return map[sentinel] ?? "Pesanan gagal diproses. Coba lagi.";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MenuItemCardProps {
  name: string;
  price: number;
  isInCart: boolean;
  hasVariants: boolean;
  onAdd: () => void;
}

function MenuItemCardRow({ name, price, isInCart, hasVariants, onAdd }: MenuItemCardProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-xl border px-4 py-3 bg-white transition-colors",
        isInCart
          ? "border-orange-400 bg-orange-50"
          : "border-slate-200 hover:border-slate-300",
      )}
    >
      <div>
        <p className="text-sm font-semibold text-gray-900">{name}</p>
        <p className="text-sm font-medium text-orange-500">{formatRupiah(price)}</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="ml-3 flex h-7 items-center justify-center gap-1 rounded-lg px-2 text-gray-400 hover:bg-slate-100 hover:text-gray-700 transition-colors flex-shrink-0"
        aria-label={hasVariants ? `Pilih variant ${name}` : `Add ${name}`}
      >
        {hasVariants ? <span className="text-xs font-medium">Variant</span> : null}
        <Plus size={16} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PosClientProps {
  menu: PosMenuItemView[];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PosClient({ menu }: PosClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [variantItem, setVariantItem] = useState<PosMenuItemView | null>(null);
  const [notes, setNotes] = useState("");

  const [emailInput, setEmailInput] = useState("");
  const [lookupResult, setLookupResult] = useState<PosMemberLookup | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupPending, setLookupPending] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSuccessCode, setCheckoutSuccessCode] = useState<string | null>(null);

  const addToCart = useCallback((item: PosMenuItemView, options: VariantSelectionInput[] = []) => {
    const priceAdjustment = options.reduce((sum, sel) => {
      const group = item.variantConfig?.variants.find((g) => g.name === sel.variantName);
      const option = group?.options.find((o) => o.name === sel.optionName);
      return sum + (option?.priceAdjustment ?? 0);
    }, 0);
    const displayName = getDisplayName(item.id, item.name);
    const key = cartLineKey(item.id, options);
    setCart((prev) =>
      addCartLine(prev, {
        key,
        menuItemId: item.id,
        options,
        qty: 1,
        name: displayName,
        price: item.priceRupiah + priceAdjustment,
      }),
    );
  }, []);

  const decrementCart = useCallback((key: string) => {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const handleLookup = useCallback(async () => {
    const email = emailInput.trim();
    if (!email) return;
    setLookupPending(true);
    setLookupError(null);
    try {
      const result = await lookupPosMemberAction(email);
      setLookupResult(result);
      setLookupDone(true);
    } catch (err) {
      setLookupError(toPosErrorMessage(err));
      setLookupResult(null);
      setLookupDone(true);
    } finally {
      setLookupPending(false);
    }
  }, [emailInput]);

  const handleCheckout = useCallback(async () => {
    setCheckoutPending(true);
    setCheckoutError(null);
    const lines: OrderLineInput[] = cart.map((l) => ({
      menuItemId: l.menuItemId,
      qty: l.qty,
      options: l.options,
    }));
    try {
      const order = await placePosOrder({
        email: emailInput.trim() || undefined,
        lines,
        notes: notes.trim() || undefined,
      });
      setCheckoutSuccessCode(order.code);
      setCart([]);
      setNotes("");
      setEmailInput("");
      setLookupResult(null);
      setLookupDone(false);
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setCheckoutError(toPosErrorMessage(err));
    } finally {
      setCheckoutPending(false);
    }
  }, [cart, emailInput, notes, router, startTransition]);

  // Preview-only discount % — the server re-derives eligibility/rate itself
  // at checkout; this never authorizes the charge.
  const discountPct = lookupResult?.hasActiveBooking ? lookupResult.cafeDiscountPct : 0;
  const subtotal = cart.reduce((sum, l) => sum + l.price * l.qty, 0);
  const discountAmt = discountPct > 0 ? Math.round((subtotal * discountPct) / 100) : 0;
  const total = subtotal - discountAmt;

  // Group visible items by category in the canonical order
  const visibleByCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    label: CATEGORY_LABEL[cat] ?? cat,
    items: menu.filter((m) => m.category === cat && !isHidden(m.id)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Cafe POS</h1>
        <p className="mt-1 text-sm text-gray-500">
          Process cafe orders with automatic discount detection
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* ------------------------------------------------------------------ */}
        {/* LEFT — Menu                                                         */}
        {/* ------------------------------------------------------------------ */}
        <Card className="p-6">
          {/* Card title */}
          <div className="mb-5 flex items-center gap-2">
            <span className="text-orange-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
                <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
                <line x1="6" x2="6" y1="2" y2="4" />
                <line x1="10" x2="10" y1="2" y2="4" />
                <line x1="14" x2="14" y1="2" y2="4" />
              </svg>
            </span>
            <h2 className="text-lg font-semibold text-gray-900">Menu</h2>
          </div>

          {/* Categories */}
          <div className="space-y-6">
            {visibleByCategory.map(({ cat, label, items }) => (
              <div key={cat}>
                <h3 className="mb-3 text-sm font-semibold text-gray-700">
                  {label}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map((item) => {
                    const displayName = getDisplayName(item.id, item.name);
                    return (
                      <MenuItemCardRow
                        key={item.id}
                        name={displayName}
                        price={item.priceRupiah}
                        isInCart={cart.some((l) => l.menuItemId === item.id)}
                        hasVariants={item.hasVariants}
                        onAdd={() =>
                          item.hasVariants ? setVariantItem(item) : addToCart(item)
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* RIGHT — Customer + Order                                            */}
        {/* ------------------------------------------------------------------ */}
        <div className="space-y-4">
          {/* Customer (Optional) */}
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <User size={16} className="text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">
                Customer (Optional)
              </h2>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Enter email..."
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  if (lookupDone) {
                    setLookupDone(false);
                    setLookupResult(null);
                    setLookupError(null);
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                className="flex-1"
              />
              <Button
                variant="primary"
                size="md"
                onClick={handleLookup}
                className="px-3"
                aria-label="Search customer"
                disabled={lookupPending}
              >
                <Search size={16} />
              </Button>
            </div>

            {/* Lookup result */}
            {lookupPending && (
              <p className="mt-3 text-xs text-gray-500">Mencari member…</p>
            )}
            {!lookupPending && lookupDone && (
              <div className="mt-3">
                {lookupError ? (
                  <p className="text-xs text-red-600">{lookupError}</p>
                ) : lookupResult ? (
                  <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2">
                    <p className="text-xs font-semibold text-teal-700">{lookupResult.name}</p>
                    <p className="text-xs text-teal-700">
                      {lookupResult.hasActiveBooking
                        ? `Sesi aktif — diskon ${lookupResult.cafeDiscountPct}%`
                        : "Tidak ada sesi aktif — tanpa diskon"}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">
                    No member found for that email.
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Order / Cart */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Order</h2>
              {cart.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-xs font-bold text-white">
                  {cart.reduce((s, l) => s + l.qty, 0)}
                </span>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <p className="text-sm">Cart is empty</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Cart lines */}
                <div className="space-y-2">
                  {cart.map((line) => (
                    <div
                      key={line.key}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {line.name}
                        </p>
                        {formatOptions(line.options) && (
                          <p className="truncate text-xs text-gray-500">
                            {formatOptions(line.options)}
                          </p>
                        )}
                        <p className="text-xs text-orange-500">
                          {formatRupiah(line.price)}
                        </p>
                      </div>
                      {/* Qty controls */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => decrementCart(line.key)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 text-gray-500 hover:bg-slate-100 text-sm font-bold"
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-sm font-semibold text-gray-900">
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) =>
                              prev.map((l) =>
                                l.key === line.key ? { ...l, qty: l.qty + 1 } : l,
                              ),
                            )
                          }
                          className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 text-gray-500 hover:bg-slate-100"
                          aria-label="Increase quantity"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <p className="w-20 text-right text-sm font-semibold text-gray-900">
                        {formatRupiah(line.price * line.qty)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                <div>
                  <label
                    htmlFor="pos-order-notes"
                    className="mb-1 block text-xs font-medium text-gray-700"
                  >
                    Catatan (opsional)
                  </label>
                  <textarea
                    id="pos-order-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={NOTES_MAX_LENGTH}
                    rows={2}
                    placeholder="mis. tanpa gula"
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                {/* Divider */}
                <div className="border-t border-slate-200" />

                {/* Totals */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span>{formatRupiah(subtotal)}</span>
                  </div>
                  {discountPct > 0 && (
                    <div className="flex justify-between text-sm text-green-700">
                      <span>Diskon ({discountPct}%)</span>
                      <span>- {formatRupiah(discountAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-gray-900">
                    <span>Total</span>
                    <span>{formatRupiah(total)}</span>
                  </div>
                </div>

                {checkoutError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                  >
                    {checkoutError}
                  </div>
                )}

                <Button
                  variant="accent"
                  size="lg"
                  className="w-full"
                  onClick={handleCheckout}
                  disabled={checkoutPending}
                >
                  <ShoppingCart size={16} />
                  {checkoutPending ? "Memproses…" : "Checkout"}
                </Button>
              </div>
            )}

            {checkoutSuccessCode && (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                Pesanan #{checkoutSuccessCode} berhasil dibuat.
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Variant picker modal (I-044) */}
      {variantItem && variantItem.variantConfig && (
        <VariantPickerModal
          item={{
            name: getDisplayName(variantItem.id, variantItem.name),
            emoji: variantItem.emoji,
            description: variantItem.description,
            priceRupiah: variantItem.priceRupiah,
            variantConfig: variantItem.variantConfig,
          }}
          onClose={() => setVariantItem(null)}
          onConfirm={(selections) => {
            addToCart(variantItem, selections);
            setVariantItem(null);
          }}
        />
      )}
    </div>
  );
}
