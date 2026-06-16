"use client";

import { X, Plus, Minus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatRupiah } from "@/lib/format";
import type { CartItem } from "./types";

interface CartPanelProps {
  items: CartItem[];
  hasActiveSession: boolean;
  onClose: () => void;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onCheckout: () => void;
  /** Indonesian error message to display above the CTA; cleared by the parent on next submit. */
  checkoutError?: string | null;
  /** Whether the checkout action is in flight. */
  checkoutPending?: boolean;
}

const CAFE_DISCOUNT = 0.05;

export function CartPanel({
  items,
  hasActiveSession,
  onClose,
  onIncrement,
  onDecrement,
  onCheckout,
  checkoutError,
  checkoutPending,
}: CartPanelProps) {
  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const discountAmt = hasActiveSession ? subtotal * CAFE_DISCOUNT : 0;
  const total = subtotal - discountAmt;

  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-end"
      onClick={onClose}
    >
      {/* dim */}
      <div className="absolute inset-0 bg-black/30" />
      {/* panel */}
      <div
        className="relative z-10 w-full sm:w-[380px] sm:h-full sm:max-h-screen bg-white shadow-xl flex flex-col rounded-t-2xl sm:rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-teal-600" />
            <h2 className="text-base font-semibold text-gray-900">
              Keranjang
            </h2>
            {items.length > 0 && (
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                {items.reduce((s, i) => s + i.qty, 0)} item
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:bg-slate-100 transition-colors"
            aria-label="Tutup keranjang"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="h-10 w-10 text-slate-300 mb-3" />
              <p className="text-sm text-gray-500">Keranjang masih kosong</p>
              <p className="text-xs text-gray-400 mt-1">
                Tambahkan menu favorit Anda
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.key}
                className="flex items-start gap-3"
              >
                <div className="text-2xl flex-shrink-0">{item.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.name}
                  </p>
                  {item.variant && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.variant.temp === "Hot" ? "Panas" : "Dingin"},{" "}
                      {item.variant.sugar === "Normal"
                        ? "Normal"
                        : item.variant.sugar === "Less Sugar"
                        ? "Kurang Manis"
                        : "Tanpa Gula"}
                    </p>
                  )}
                  <p className="text-sm text-teal-600 font-medium mt-0.5">
                    {formatRupiah(item.price)}
                  </p>
                </div>
                {/* qty controls */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onDecrement(item.key)}
                    className="rounded-full h-7 w-7 flex items-center justify-center border border-slate-200 text-gray-600 hover:border-teal-400 hover:text-teal-600 transition-colors"
                    aria-label="Kurangi"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-medium text-gray-900">
                    {item.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => onIncrement(item.key)}
                    className="rounded-full h-7 w-7 flex items-center justify-center border border-slate-200 text-gray-600 hover:border-teal-400 hover:text-teal-600 transition-colors"
                    aria-label="Tambah"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* footer summary + CTA */}
        {items.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-200 space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>{formatRupiah(subtotal)}</span>
              </div>
              {hasActiveSession && (
                <div className="flex justify-between text-sm text-green-700">
                  <span>Diskon sesi aktif (5%)</span>
                  <span>- {formatRupiah(discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-gray-900 pt-1 border-t border-slate-200">
                <span>Total</span>
                <span>{formatRupiah(total)}</span>
              </div>
            </div>
            {checkoutError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {checkoutError}
              </div>
            )}
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={onCheckout}
              disabled={checkoutPending}
            >
              {checkoutPending ? "Memproses…" : "Pesan Sekarang"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
