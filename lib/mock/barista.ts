import type { BaristaOrder } from "./types";

/**
 * Barista KDS queue (OBS-120/121). Empty by default to exercise the
 * "Belum ada pesanan" empty state; sample orders provided for populated views.
 */
export const baristaOrders: BaristaOrder[] = [];

/** Optional populated sample for development of the non-empty KDS state. */
export const baristaOrdersSample: BaristaOrder[] = [
  {
    id: "bo_301",
    code: "#A23",
    customer: "Budi Santoso",
    status: "new",
    placedAt: "2026-06-15T16:55:00+07:00",
    lines: [
      { name: "Latte", qty: 1, variant: "Hot, Normal Sugar" },
      { name: "Croissant", qty: 1 },
    ],
  },
  {
    id: "bo_300",
    code: "#A22",
    customer: "Guest",
    status: "preparing",
    placedAt: "2026-06-15T16:50:00+07:00",
    lines: [{ name: "Americano", qty: 2, variant: "Cold, Less Sugar" }],
  },
  {
    id: "bo_299",
    code: "#A21",
    customer: "Sari Wijaya",
    status: "ready",
    placedAt: "2026-06-15T16:42:00+07:00",
    lines: [
      { name: "Matcha Latte", qty: 1, variant: "Cold, No Sugar" },
      { name: "Sandwich", qty: 1 },
    ],
  },
];
