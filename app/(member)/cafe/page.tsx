"use client";

import { useState, useMemo } from "react";
import { ShoppingCart } from "lucide-react";
import { formatRupiah, formatDateOnlyID } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { menuItems, lastOrder, currentMember } from "@/lib/mock";
import { VariantModal } from "@/components/member/cafe/VariantModal";
import { CartPanel } from "@/components/member/cafe/CartPanel";
import { cartKey } from "@/components/member/cafe/types";
import type { CartItem } from "@/components/member/cafe/types";
import type { VariantSelection } from "@/components/member/cafe/VariantModal";
import type { MenuItem, MenuCategory } from "@/lib/mock";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "FlowSpace";

const CATEGORY_TABS = [
  { key: "Semua", label: "Semua" },
  { key: "Coffee", label: "Coffee" },
  { key: "Food", label: "Food" },
  { key: "Non-Coffee", label: "Non-Coffee" },
  { key: "Snack", label: "Snack" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MenuItemCard({
  item,
  onAddDirect,
  onPickVariant,
}: {
  item: MenuItem;
  onAddDirect: (item: MenuItem) => void;
  onPickVariant: (item: MenuItem) => void;
}) {
  return (
    <Card className="flex flex-col gap-3">
      {/* emoji + category row */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-3xl leading-none">{item.emoji}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {item.category}
        </span>
      </div>

      {/* name + price */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 leading-snug">
          {item.name}
        </h3>
        {item.hasVariants && (
          <p className="text-xs text-gray-400 mt-0.5">+pilihan: panas/dingin, gula</p>
        )}
        <p className="text-sm font-semibold text-teal-600 mt-1">
          {formatRupiah(item.price)}
        </p>
      </div>

      {/* description */}
      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 flex-1">
        {item.description}
      </p>

      {/* CTA */}
      {item.hasVariants ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onPickVariant(item)}
        >
          Pilih Variant
        </Button>
      ) : (
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          onClick={() => onAddDirect(item)}
        >
          Tambah
        </Button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CafePage() {
  const hasActiveSession = currentMember.activeSession !== null;

  // ---- category filter ----
  const [activeCategory, setActiveCategory] = useState("Semua");

  const filteredItems = useMemo(
    () =>
      activeCategory === "Semua"
        ? menuItems
        : menuItems.filter((m) => m.category === (activeCategory as MenuCategory)),
    [activeCategory],
  );

  // ---- variant modal ----
  const [variantItem, setVariantItem] = useState<MenuItem | null>(null);

  // ---- cart ----
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const totalCartQty = cartItems.reduce((s, i) => s + i.qty, 0);

  function addToCart(item: MenuItem, variant?: VariantSelection) {
    const key = cartKey(item, variant);
    setCartItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) =>
          i.key === key ? { ...i, qty: i.qty + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          key,
          id: item.id,
          name: item.name,
          emoji: item.emoji,
          price: item.price,
          qty: 1,
          variant,
        },
      ];
    });
  }

  function incrementCart(key: string) {
    setCartItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i)),
    );
  }

  function decrementCart(key: string) {
    setCartItems((prev) => {
      const updated = prev
        .map((i) => (i.key === key ? { ...i, qty: i.qty - 1 } : i))
        .filter((i) => i.qty > 0);
      return updated;
    });
  }

  function handleCheckout() {
    // Frontend-first: clear cart and close panel
    setCartItems([]);
    setCartOpen(false);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {BRAND_NAME} Cafe
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Pesan makanan &amp; minuman favorit Anda
          </p>
        </div>

        {/* cart button */}
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          aria-label="Buka keranjang"
          className="relative inline-flex items-center justify-center h-11 w-11 rounded-xl border-2 border-teal-500 bg-white text-teal-600 hover:bg-teal-50 transition-colors shadow-sm"
        >
          <ShoppingCart className="h-5 w-5" />
          {totalCartQty > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-[10px] font-bold text-white">
              {totalCartQty > 9 ? "9+" : totalCartQty}
            </span>
          )}
        </button>
      </div>

      {/* ── Active-session discount banner ── */}
      {hasActiveSession && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-3">
          <span className="text-lg leading-none">🎉</span>
          <div>
            <p className="text-sm font-semibold text-green-800">
              Anda sedang dalam sesi aktif!
            </p>
            <p className="text-sm text-green-700 mt-0.5">
              Nikmati diskon 5% untuk semua pesanan cafe
            </p>
          </div>
        </div>
      )}

      {/* ── Category filter tabs ── */}
      <Tabs
        tabs={CATEGORY_TABS}
        value={activeCategory}
        onChange={setActiveCategory}
      />

      {/* ── Menu grid ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filteredItems.map((item) => (
          <MenuItemCard
            key={item.id}
            item={item}
            onAddDirect={(it) => {
              addToCart(it);
            }}
            onPickVariant={(it) => setVariantItem(it)}
          />
        ))}
      </div>

      {/* ── Pesanan Terakhir ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Pesanan Terakhir
        </h2>
        <Card>
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <p className="text-xs text-gray-500">{lastOrder.id}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDateOnlyID(lastOrder.date)}
              </p>
            </div>
            <Badge tone="completed">Selesai</Badge>
          </div>

          <div className="space-y-2">
            {lastOrder.lines.map((line, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-700">
                  {line.name}
                  {line.variant && (
                    <span className="ml-1 text-gray-400 text-xs">
                      ({line.variant})
                    </span>
                  )}
                </span>
                <span className="text-gray-500 text-xs">×{line.qty}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm text-gray-600">Total</span>
            <span className="text-sm font-semibold text-gray-900">
              {formatRupiah(lastOrder.total)}
            </span>
          </div>
        </Card>
      </section>

      {/* ── Variant modal ── */}
      {variantItem && (
        <VariantModal
          item={variantItem}
          onClose={() => setVariantItem(null)}
          onConfirm={(item, variant) => {
            addToCart(item, variant);
            setVariantItem(null);
          }}
        />
      )}

      {/* ── Cart panel ── */}
      {cartOpen && (
        <CartPanel
          items={cartItems}
          hasActiveSession={hasActiveSession}
          onClose={() => setCartOpen(false)}
          onIncrement={incrementCart}
          onDecrement={decrementCart}
          onCheckout={handleCheckout}
        />
      )}
    </div>
  );
}
