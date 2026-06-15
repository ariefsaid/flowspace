"use client";

import { useState } from "react";
import { RefreshCw, User, Clock, Trash2, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatRupiah } from "@/lib/format";

// Original uses abbreviated month names ("6 Mei 2026, 11.36" / "30 Apr 2026, 13.54").
const shortDateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const shortTimeFmt = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function formatOrderDate(iso: string): string {
  const d = new Date(iso);
  return `${shortDateFmt.format(d)}, ${shortTimeFmt.format(d).replace(/:/g, ".")}`;
}

// ---------------------------------------------------------------------------
// Admin orders mock data (exact replica from recon text-admin-orders.txt)
// ---------------------------------------------------------------------------

type AdminOrderStatus = "completed" | "new" | "preparing" | "ready" | "cancelled";

interface AdminOrderLine {
  name: string;
  qty: number;
  price: number;
  variant?: string;
}

interface AdminOrder {
  id: string;
  code: string;
  customer?: string;
  email?: string;
  placedAt: string;
  status: AdminOrderStatus;
  lines: AdminOrderLine[];
  discountPct?: number;
  notes?: string;
}

const adminOrders: AdminOrder[] = [
  {
    id: "ao_001",
    code: "#vohwrk",
    customer: "Budi Santoso",
    email: "budi@gmail.com",
    placedAt: "2026-05-06T11:36:00+07:00",
    status: "completed",
    lines: [{ name: "Item", qty: 1, price: 28000 }],
  },
  {
    id: "ao_002",
    code: "#0339xu",
    customer: "Budi Santoso",
    email: "budi@gmail.com",
    placedAt: "2026-04-30T13:54:00+07:00",
    status: "completed",
    lines: [{ name: "Item", qty: 1, price: 35000 }],
    discountPct: 5,
  },
  {
    id: "ao_003",
    code: "#v9smde",
    customer: undefined,
    email: undefined,
    placedAt: "2026-04-30T13:33:00+07:00",
    status: "completed",
    lines: [{ name: "Item", qty: 1, price: 28000 }],
    notes: "[Guest: gfhfghf] hfghf",
  },
  {
    id: "ao_004",
    code: "#wno2cz",
    customer: "Budi Santoso",
    email: "budi@gmail.com",
    placedAt: "2026-04-08T11:32:00+07:00",
    status: "completed",
    lines: [{ name: "Item", qty: 1, price: 40000 }],
  },
  {
    id: "ao_005",
    code: "#okr5ky",
    customer: "mahestya adhy sanjaya",
    email: "mahestya.a.sanjaya@gmail.com",
    placedAt: "2026-03-22T12:21:00+07:00",
    status: "completed",
    lines: [{ name: "Item", qty: 1, price: 32000 }],
  },
  {
    id: "ao_006",
    code: "#v2vzoa",
    customer: "mahestya adhy sanjaya",
    email: "mahestya.a.sanjaya@gmail.com",
    placedAt: "2026-03-22T12:19:00+07:00",
    status: "completed",
    lines: [{ name: "Item", qty: 1, price: 25000 }],
  },
];

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<AdminOrderStatus, string> = {
  completed: "Completed",
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  cancelled: "Cancelled",
};

const STATUS_BADGE_TONE: Record<
  AdminOrderStatus,
  "completed" | "active" | "pending" | "info" | "cancelled" | "neutral"
> = {
  completed: "completed",
  new: "info",
  preparing: "pending",
  ready: "active",
  cancelled: "cancelled",
};

const STATUS_OPTIONS: AdminOrderStatus[] = [
  "new",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];

const FILTER_OPTIONS: { value: "all" | AdminOrderStatus; label: string }[] = [
  { value: "all", label: "Semua Status" },
  { value: "new", label: "New" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OrderRow({
  order,
  onStatusChange,
  onDelete,
}: {
  order: AdminOrder;
  onStatusChange: (id: string, status: AdminOrderStatus) => void;
  onDelete: (id: string) => void;
}) {
  const subtotal = order.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discountAmt = order.discountPct
    ? Math.round(subtotal * (order.discountPct / 100))
    : 0;
  const total = subtotal - discountAmt;

  return (
    /* Plain div — dividers come from parent divide-y; no per-row Card border/shadow/rounded */
    <div data-testid="order-row" className="px-5 py-4 flex items-start justify-between gap-6">
      {/* LEFT: badge / code / customer / timestamp / items / totals / notes */}
      <div data-testid="order-left" className="flex-1 min-w-0">
        {/* Header: badge + discount chip + code */}
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <Badge tone={STATUS_BADGE_TONE[order.status]}>
            {STATUS_LABELS[order.status]}
          </Badge>
          {order.discountPct && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              <span>%</span>
              <span>{order.discountPct}% OFF</span>
            </span>
          )}
          <span className="text-sm font-semibold text-gray-800">
            {order.code}
          </span>
        </div>

        {/* Customer */}
        {order.customer && (
          <div className="flex items-center gap-1.5 text-sm text-gray-700 mb-1">
            <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>
              {order.customer}
              {order.email && (
                <span className="text-gray-500"> ({order.email})</span>
              )}
            </span>
          </div>
        )}

        {/* Timestamp */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{formatOrderDate(order.placedAt)}</span>
        </div>

        {/* Items — no grey band */}
        <div data-testid="order-items" className="py-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Items:</p>
          <div className="space-y-1">
            {order.lines.map((line, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  x{line.qty}
                  {line.variant && (
                    <span className="ml-1 text-gray-400">({line.variant})</span>
                  )}
                </span>
                <span className="text-gray-700">{formatRupiah(line.price * line.qty)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="py-3 space-y-1">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          {order.discountPct && discountAmt > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-teal-600">Discount ({order.discountPct}%)</span>
              <span className="text-red-500">-{formatRupiah(discountAmt)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm font-bold">
            <span className="text-gray-900">Total</span>
            <span className="text-teal-600">{formatRupiah(total)}</span>
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <p className="text-xs text-gray-500 mt-1">
            <span className="font-medium">Notes:</span> {order.notes}
          </p>
        )}
      </div>

      {/* RIGHT: status select + Hapus button */}
      <div data-testid="order-right" className="w-44 shrink-0 flex flex-col gap-2">
        <select
          aria-label={`Status pesanan ${order.code}`}
          value={order.status}
          onChange={(e) =>
            onStatusChange(order.id, e.target.value as AdminOrderStatus)
          }
          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 cursor-pointer"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onDelete(order.id)}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white text-red-600 text-sm font-medium h-9 hover:bg-red-50 transition-colors cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Hapus
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>(adminOrders);
  const [statusFilter, setStatusFilter] = useState<"all" | AdminOrderStatus>("all");

  const filtered =
    statusFilter === "all"
      ? orders
      : orders.filter((o) => o.status === statusFilter);

  function handleStatusChange(id: string, newStatus: AdminOrderStatus) {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
    );
  }

  function handleDelete(id: string) {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }

  function handleRefresh() {
    setOrders(adminOrders);
    setStatusFilter("all");
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cafe Orders</h1>
          <p className="mt-1 text-sm text-gray-500">Kelola semua pesanan cafe</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="shrink-0 mt-1 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 h-9 text-sm font-medium text-gray-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Filter Status */}
      <Card className="p-4">
        <label
          htmlFor="filter-status"
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          Filter Status
        </label>
        <select
          id="filter-status"
          aria-label="Filter Status"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "all" | AdminOrderStatus)
          }
          className="h-10 w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 cursor-pointer"
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Card>

      {/* Orders — single outer panel */}
      <Card data-testid="orders-panel" className="p-0 overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <ShoppingBag className="h-5 w-5 text-orange-500" />
          <h2 className="text-base font-semibold text-gray-800">
            Orders ({filtered.length})
          </h2>
        </div>

        {filtered.length === 0 ? (
          /* Empty state — inside the panel */
          <div className="border-t border-slate-200 py-16 text-center">
            <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-gray-500">
              Belum ada pesanan
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {statusFilter === "all"
                ? "Pesanan cafe akan muncul di sini."
                : `Tidak ada pesanan dengan status "${STATUS_LABELS[statusFilter as AdminOrderStatus]}".`}
            </p>
          </div>
        ) : (
          /* Divider-separated rows */
          <div className="divide-y divide-slate-200 border-t border-slate-200">
            {filtered.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
