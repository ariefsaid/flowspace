"use client";

import { useState } from "react";
import {
  MapPin,
  Receipt,
  CalendarDays,
  Coffee,
  Package,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { bookings, transactions } from "@/lib/mock";
import { formatRupiah, formatDateRangeID, formatDateID } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { TransactionKind } from "@/lib/mock";

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function BookingStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "ACTIVE":
      return <Badge tone="active">ACTIVE</Badge>;
    case "COMPLETED":
      return <Badge tone="completed">COMPLETED</Badge>;
    case "CANCELLED":
      return <Badge tone="cancelled">CANCELLED</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}

function PaymentBadge({ payment }: { payment: string }) {
  switch (payment) {
    case "WAITING_CASHIER":
      return <Badge tone="pending">WAITING CASHIER</Badge>;
    case "PAID_CASHIER":
      return <Badge tone="completed">PAID CASHIER</Badge>;
    case "PAID_ONLINE":
      return <Badge tone="info">PAID ONLINE</Badge>;
    default:
      return <Badge tone="neutral">{payment}</Badge>;
  }
}

function TransactionStatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED") return <Badge tone="completed">COMPLETED</Badge>;
  if (status === "PENDING") return <Badge tone="pending">PENDING</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

// ---------------------------------------------------------------------------
// Transaction kind icon
// ---------------------------------------------------------------------------

function KindIcon({ kind }: { kind: TransactionKind }) {
  const base = "h-4 w-4";
  switch (kind) {
    case "cafe":
      return <Coffee className={base} />;
    case "print":
      return <Printer className={base} />;
    case "package":
      return <Package className={base} />;
    case "booking":
    default:
      return <CalendarDays className={base} />;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<string>("booking");

  const tabs = [
    {
      key: "booking",
      label: "Booking",
      count: bookings.length,
      icon: CalendarDays,
    },
    {
      key: "transaksi",
      label: "Transaksi",
      count: transactions.length,
      icon: Receipt,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Riwayat</h1>
        <p className="mt-1 text-sm text-gray-500">
          Lihat riwayat booking dan transaksi Anda
        </p>
      </div>

      {/* Segmented tab control */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white text-teal-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-800",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label} ({tab.count})
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      <div className="space-y-3">
        {activeTab === "booking" && (
          <>
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
              >
                {/* Icon */}
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                  <MapPin className="h-4 w-4" />
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {booking.facility}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatDateRangeID(booking.start, booking.end)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Durasi: {booking.durationHours} jam
                  </p>
                </div>

                {/* Badges */}
                <div className="flex flex-shrink-0 items-center gap-2">
                  <BookingStatusBadge status={booking.status} />
                  <PaymentBadge payment={booking.payment} />
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === "transaksi" && (
          <>
            {transactions.map((trx) => (
              <div
                key={trx.id}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
              >
                {/* Icon */}
                <div
                  className={cn(
                    "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
                    trx.kind === "cafe" && "bg-orange-50 text-orange-500",
                    trx.kind === "print" && "bg-purple-50 text-purple-500",
                    trx.kind === "package" && "bg-teal-50 text-teal-600",
                    trx.kind === "booking" && "bg-blue-50 text-blue-500",
                  )}
                >
                  <KindIcon kind={trx.kind} />
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {trx.description}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatDateID(trx.datetime)}
                  </p>
                </div>

                {/* Amount + status */}
                <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                  <span className="text-sm font-semibold text-gray-900">
                    {formatRupiah(trx.amount)}
                  </span>
                  <TransactionStatusBadge status={trx.status} />
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
