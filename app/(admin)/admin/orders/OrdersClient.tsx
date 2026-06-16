"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, User, Clock, Trash2, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatRupiah } from "@/lib/format";
import { setOrderStatusAction } from "@/app/(admin)/admin/orders/actions";

// ---------------------------------------------------------------------------
// View shape — DB CafeOrder mapped for this component
// ---------------------------------------------------------------------------

export interface AdminOrderItemView {
  nameSnapshot: string;
  qty: number;
  unitPriceRupiah: number;
  variant?: string;
}

export interface AdminOrderView {
  id: string;
  code: string;
  customer?: string;
  email?: string;
  guestName?: string;
  placedAt: string;
  /** DB enum uppercase: NEW / PREPARING / READY / COMPLETED / CANCELLED */
  status: string;
  subtotalRupiah: number;
  discountRupiah: number;
  totalRupiah: number;
  items: AdminOrderItemView[];
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type AdminOrderStatus = "COMPLETED" | "NEW" | "PREPARING" | "READY" | "CANCELLED";

const STATUS_LABELS: Record<AdminOrderStatus, string> = {
  COMPLETED: "Completed",
  NEW: "New",
  PREPARING: "Preparing",
  READY: "Ready",
  CANCELLED: "Cancelled",
};

const STATUS_BADGE_TONE: Record<
  AdminOrderStatus,
  "completed" | "active" | "pending" | "info" | "cancelled" | "neutral"
> = {
  COMPLETED: "completed",
  NEW: "info",
  PREPARING: "pending",
  READY: "active",
  CANCELLED: "cancelled",
};

const STATUS_OPTIONS: AdminOrderStatus[] = [
  "NEW",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
];

const FILTER_OPTIONS: { value: "all" | AdminOrderStatus; label: string }[] = [
  { value: "all", label: "Semua Status" },
  { value: "NEW", label: "New" },
  { value: "PREPARING", label: "Preparing" },
  { value: "READY", label: "Ready" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

// ---------------------------------------------------------------------------
// Date formatting (matching original recon format)
// ---------------------------------------------------------------------------

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
// Sub-components
// ---------------------------------------------------------------------------

function OrderRow({
  order,
  onStatusChange,
}: {
  order: AdminOrderView;
  onStatusChange: (id: string, status: AdminOrderStatus) => void;
}) {
  const discountPct =
    order.subtotalRupiah > 0 && order.discountRupiah > 0
      ? Math.round((order.discountRupiah / order.subtotalRupiah) * 100)
      : 0;

  const displayStatus = (STATUS_LABELS[order.status as AdminOrderStatus] ?? order.status);
  const badgeTone = STATUS_BADGE_TONE[order.status as AdminOrderStatus] ?? "neutral";

  const customerDisplay = order.customer ?? (order.guestName ? undefined : "Guest");

  return (
    <div data-testid="order-row" className="px-5 py-4 flex items-start justify-between gap-6">
      {/* LEFT: badge / code / customer / timestamp / items / totals */}
      <div data-testid="order-left" className="flex-1 min-w-0">
        {/* Header: badge + discount chip + code */}
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <Badge tone={badgeTone}>
            {displayStatus}
          </Badge>
          {discountPct > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              <span>%</span>
              <span>{discountPct}% OFF</span>
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
        {!order.customer && order.guestName && (
          <div className="flex items-center gap-1.5 text-sm text-gray-700 mb-1">
            <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-gray-500">Guest: {order.guestName}</span>
          </div>
        )}
        {!order.customer && !order.guestName && customerDisplay && (
          <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
            <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>{customerDisplay}</span>
          </div>
        )}

        {/* Timestamp */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{formatOrderDate(order.placedAt)}</span>
        </div>

        {/* Items */}
        <div data-testid="order-items" className="py-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Items:</p>
          <div className="space-y-1">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  x{item.qty} {item.nameSnapshot}
                  {item.variant && (
                    <span className="ml-1 text-gray-400">({item.variant})</span>
                  )}
                </span>
                <span className="text-gray-700">
                  {formatRupiah(item.unitPriceRupiah * item.qty)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals — from persisted server-computed fields */}
        <div className="py-3 space-y-1">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>{formatRupiah(order.subtotalRupiah)}</span>
          </div>
          {discountPct > 0 && order.discountRupiah > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-teal-600">Discount ({discountPct}%)</span>
              <span className="text-red-500">-{formatRupiah(order.discountRupiah)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm font-bold">
            <span className="text-gray-900">Total</span>
            <span className="text-teal-600">{formatRupiah(order.totalRupiah)}</span>
          </div>
        </div>
      </div>

      {/* RIGHT: status select + Hapus button (Hapus dormant per OQ-5) */}
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
        {/* Hapus — dormant per OQ-5 / FU-4 */}
        <button
          type="button"
          disabled
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white text-red-400 text-sm font-medium h-9 cursor-not-allowed opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Hapus
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props & main component
// ---------------------------------------------------------------------------

export interface OrdersClientProps {
  initialOrders: AdminOrderView[];
}

export function OrdersClient({ initialOrders }: OrdersClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [orders, setOrders] = useState<AdminOrderView[]>(initialOrders);
  const [statusFilter, setStatusFilter] = useState<"all" | AdminOrderStatus>("all");

  const filtered =
    statusFilter === "all"
      ? orders
      : orders.filter((o) => o.status === statusFilter);

  async function handleStatusChange(id: string, newStatus: AdminOrderStatus) {
    // Optimistic update
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o)),
    );
    try {
      await setOrderStatusAction(id, newStatus);
    } catch {
      // Revert via refresh on failure
    }
    startTransition(() => {
      router.refresh();
    });
  }

  function handleRefresh() {
    startTransition(() => {
      router.refresh();
    });
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
                : `Tidak ada pesanan dengan status "${STATUS_LABELS[statusFilter as AdminOrderStatus] ?? statusFilter}".`}
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
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
