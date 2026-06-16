"use client";

import { useState, useCallback } from "react";
import { Plus, Search, ShoppingCart, User } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/cn";

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
interface CartLine {
  id: string;
  name: string;
  price: number;
  qty: number;
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MenuItemCardProps {
  name: string;
  price: number;
  isInCart: boolean;
  onAdd: () => void;
}

function MenuItemCardRow({ name, price, isInCart, onAdd }: MenuItemCardProps) {
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
        className="ml-3 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-slate-100 hover:text-gray-700 transition-colors flex-shrink-0"
        aria-label={`Add ${name}`}
      >
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
  const [cart, setCart] = useState<CartLine[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [customerFound, setCustomerFound] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  const addToCart = useCallback((id: string, name: string, price: number) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.id === id);
      if (existing) {
        return prev.map((l) => l.id === id ? { ...l, qty: l.qty + 1 } : l);
      }
      return [...prev, { id, name, price, qty: 1 }];
    });
  }, []);

  const decrementCart = useCallback((id: string) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.id === id);
      if (!existing) return prev;
      if (existing.qty === 1) return prev.filter((l) => l.id !== id);
      return prev.map((l) => l.id === id ? { ...l, qty: l.qty - 1 } : l);
    });
  }, []);

  // Customer lookup is dormant (POS checkout out of scope per OQ-2).
  // We keep the UI but do not wire the member lookup to a real query.
  const handleLookup = useCallback(() => {
    setCustomerFound(false);
    setLookupDone(true);
  }, []);

  const subtotal = cart.reduce((sum, l) => sum + l.price * l.qty, 0);
  const total = subtotal; // no discount wired (OQ-2: POS checkout dormant)

  const cartIds = new Set(cart.map((l) => l.id));

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
                        isInCart={cartIds.has(item.id)}
                        onAdd={() => addToCart(item.id, displayName, item.priceRupiah)}
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
                    setCustomerFound(false);
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
              >
                <Search size={16} />
              </Button>
            </div>

            {/* Lookup result */}
            {lookupDone && (
              <div className="mt-3">
                {customerFound ? (
                  <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2">
                    <p className="text-xs text-teal-600">
                      Member found — discount pending POS checkout wiring (segera).
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
                      key={line.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {line.name}
                        </p>
                        <p className="text-xs text-orange-500">
                          {formatRupiah(line.price)}
                        </p>
                      </div>
                      {/* Qty controls */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => decrementCart(line.id)}
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
                            addToCart(line.id, line.name, line.price)
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

                {/* Divider */}
                <div className="border-t border-slate-200" />

                {/* Totals */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span>{formatRupiah(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-gray-900">
                    <span>Total</span>
                    <span>{formatRupiah(total)}</span>
                  </div>
                </div>

                {/* Checkout button — dormant per OQ-2 / FU-3 */}
                <Button
                  variant="accent"
                  size="lg"
                  className="w-full"
                  disabled
                  title="POS checkout segera hadir"
                >
                  <ShoppingCart size={16} />
                  Checkout (segera)
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
