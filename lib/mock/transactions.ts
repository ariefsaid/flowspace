import type { Transaction } from "./types";

/**
 * Recent transactions across surfaces (OBS-023): print / booking / cafe /
 * package, each with amount, localized datetime, and COMPLETED|PENDING status.
 */
export const transactions: Transaction[] = [
  {
    id: "trx_5012",
    user: "Budi Santoso",
    kind: "print",
    description: "Print: kontrak-sewa.pdf (12 hal, BW, A4) - diskon 20%",
    amount: 11520,
    datetime: "2026-06-15T15:01:00+07:00",
    status: "COMPLETED",
  },
  {
    id: "trx_5011",
    user: "Sari Wijaya",
    kind: "booking",
    description: "Booking: Meja C - walk-in",
    amount: 45000,
    datetime: "2026-06-15T14:38:00+07:00",
    status: "PENDING",
  },
  {
    id: "trx_5009",
    user: "Budi Santoso",
    kind: "cafe",
    description: "Pesanan Cafe - 3 item",
    amount: 89000,
    datetime: "2026-06-15T13:12:00+07:00",
    status: "COMPLETED",
  },
  {
    id: "trx_5005",
    user: "Andi Pratama",
    kind: "package",
    description: "Purchased 20 Hours package",
    amount: 260000,
    datetime: "2026-06-15T11:47:00+07:00",
    status: "COMPLETED",
  },
  {
    id: "trx_5001",
    user: "Maya Lestari",
    kind: "booking",
    description: "Booking: Meeting Room A - 2 jam",
    amount: 240000,
    datetime: "2026-06-15T10:05:00+07:00",
    status: "PENDING",
  },
  {
    id: "trx_4998",
    user: "Rizki Hidayat",
    kind: "cafe",
    description: "Pesanan Cafe - 1 item",
    amount: 32000,
    datetime: "2026-06-14T17:22:00+07:00",
    status: "COMPLETED",
  },
  {
    id: "trx_4995",
    user: "Dewi Anggraini",
    kind: "print",
    description: "Print: laporan.pdf (40 hal, Color, A4) - diskon 5%",
    amount: 38000,
    datetime: "2026-06-14T16:08:00+07:00",
    status: "COMPLETED",
  },
];

/** Convenience alias for the admin dashboard's "Recent Transactions" list. */
export const recentTransactions: Transaction[] = transactions;
