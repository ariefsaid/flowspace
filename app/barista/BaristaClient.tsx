"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Volume2, VolumeX, RefreshCw, Coffee, ChefHat } from "lucide-react";
import { brand } from "@/brand.config";
import { cn } from "@/lib/cn";
import { Button, Card } from "@/components/ui";
import { advanceOrderStatusAction } from "@/app/barista/actions";

// ---------------------------------------------------------------------------
// View shape — maps DB CafeOrder → what this component consumes
// ---------------------------------------------------------------------------

export interface BaristaOrderLineView {
  name: string;
  qty: number;
  variant?: string;
}

export interface BaristaOrderView {
  id: string;
  /** Short order code shown on the ticket, e.g. "#ab1234". */
  code: string;
  /** Customer display name or "Guest: <name>". */
  customer: string;
  /** Lowercase status matching KDS columns: new / preparing / ready. */
  status: "new" | "preparing" | "ready";
  /** ISO timestamp. */
  placedAt: string;
  lines: BaristaOrderLineView[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type OrderStatus = "new" | "preparing" | "ready";

const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Pesanan Baru",
  preparing: "Sedang Disiapkan",
  ready: "Siap Diambil",
};

const ADVANCE_LABEL: Record<OrderStatus, string> = {
  new: "Mulai Siapkan",
  preparing: "Tandai Siap",
  ready: "",
};

// Column dot colors (matching screenshot: orange / blue / green)
const COUNTER_DOT: Record<OrderStatus, string> = {
  new: "bg-orange-500",
  preparing: "bg-blue-500",
  ready: "bg-green-500",
};

// Card header accent per status
const CARD_ACCENT: Record<OrderStatus, string> = {
  new: "border-t-4 border-t-orange-400",
  preparing: "border-t-4 border-t-blue-400",
  ready: "border-t-4 border-t-green-500",
};

const ADVANCE_VARIANT: Record<OrderStatus, "primary" | "accent" | "outline"> = {
  new: "primary",
  preparing: "accent",
  ready: "outline",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface OrderCardProps {
  order: BaristaOrderView;
  onAdvance: (id: string) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
}

function OrderCard({ order, onAdvance, onComplete }: OrderCardProps) {
  const hasNext = order.status !== "ready";

  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-4 rounded-xl",
        CARD_ACCENT[order.status],
      )}
    >
      {/* Ticket header */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-gray-900">{order.code}</span>
        <span className="text-xs text-gray-500">{formatTime(order.placedAt)}</span>
      </div>

      {/* Customer */}
      <p className="text-sm font-medium text-gray-700">{order.customer}</p>

      {/* Order lines */}
      <ul className="space-y-1">
        {order.lines.map((line, i) => (
          <li key={i} className="text-sm text-slate-950">
            <span className="font-semibold">{line.qty}×</span> {line.name}
            {line.variant ? (
              <span className="ml-1 text-xs text-gray-500">({line.variant})</span>
            ) : null}
          </li>
        ))}
      </ul>

      {/* Action buttons */}
      <div className="mt-auto flex gap-2">
        {hasNext ? (
          <Button
            variant={ADVANCE_VARIANT[order.status]}
            size="sm"
            className="flex-1"
            onClick={() => onAdvance(order.id)}
          >
            <ChefHat className="h-4 w-4" />
            {ADVANCE_LABEL[order.status]}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 border-green-500 text-green-700 hover:bg-green-50"
            onClick={() => onComplete(order.id)}
          >
            Pesanan Diambil
          </Button>
        )}
      </div>
    </Card>
  );
}

interface KdsColumnProps {
  status: OrderStatus;
  orders: BaristaOrderView[];
  onAdvance: (id: string) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
}

function KdsColumn({ status, orders, onAdvance, onComplete }: KdsColumnProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        {STATUS_LABEL[status]} ({orders.length})
      </h2>
      {orders.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Tidak ada pesanan</p>
      ) : (
        orders.map((o) => (
          <OrderCard key={o.id} order={o} onAdvance={onAdvance} onComplete={onComplete} />
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props & main component
// ---------------------------------------------------------------------------

export interface BaristaClientProps {
  initialOrders: BaristaOrderView[];
}

export function BaristaClient({ initialOrders }: BaristaClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [orders, setOrders] = useState<BaristaOrderView[]>(initialOrders);
  const [soundOn, setSoundOn] = useState(true);
  const [spinning, setSpinning] = useState(false);

  // Counts
  const newCount = orders.filter((o) => o.status === "new").length;
  const preparingCount = orders.filter((o) => o.status === "preparing").length;
  const readyCount = orders.filter((o) => o.status === "ready").length;

  const handleAdvance = useCallback(async (id: string) => {
    // Optimistic update
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const nextMap: Record<OrderStatus, OrderStatus | null> = {
          new: "preparing",
          preparing: "ready",
          ready: null,
        };
        const next = nextMap[o.status];
        return next ? { ...o, status: next } : o;
      }),
    );

    try {
      await advanceOrderStatusAction(id);
    } catch {
      // Revert on error via server refresh
    }

    startTransition(() => {
      router.refresh();
    });
  }, [router, startTransition]);

  const handleComplete = useCallback(async (id: string) => {
    // Optimistically remove from KDS (READY → COMPLETED means it's done)
    setOrders((prev) => prev.filter((o) => o.id !== id));
    try {
      await advanceOrderStatusAction(id);
    } catch {
      // Revert via refresh
    }
    startTransition(() => {
      router.refresh();
    });
  }, [router, startTransition]);

  const handleRefresh = useCallback(() => {
    setSpinning(true);
    startTransition(() => {
      router.refresh();
    });
    setTimeout(() => setSpinning(false), 600);
  }, [router, startTransition]);

  const isEmpty = orders.length === 0;

  return (
    <main>
      {/* ------------------------------------------------------------------ */}
      {/* White header band                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white border-b border-slate-200">
        {/* Title row */}
        <div className="container mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4 flex-wrap border-b border-slate-200">
          {/* Title block */}
          <div className="flex items-center gap-3">
            <span className="text-orange-500">
              <Coffee className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                Dashboard Barista
              </h1>
              <p className="text-sm text-gray-500">{brand.name} Cafe</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSoundOn((v) => !v)}
              aria-pressed={soundOn}
              aria-label={soundOn ? "Matikan suara" : "Nyalakan suara"}
            >
              {soundOn ? (
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <VolumeX className="h-4 w-4" aria-hidden="true" />
              )}
              {soundOn ? "Sound On" : "Sound Off"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              aria-label="Refresh pesanan"
            >
              <RefreshCw
                className={cn("h-4 w-4", spinning && "animate-spin")}
                aria-hidden="true"
              />
              Refresh
            </Button>
          </div>
        </div>

        {/* Live counters bar */}
        <div className="container mx-auto max-w-6xl px-4 py-3 flex items-center gap-6 text-sm font-medium text-gray-700">
          {(
            [
              { status: "new" as OrderStatus, count: newCount },
              { status: "preparing" as OrderStatus, count: preparingCount },
              { status: "ready" as OrderStatus, count: readyCount },
            ] as const
          ).map(({ status, count }) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", COUNTER_DOT[status])} />
              {count} {STATUS_LABEL[status]}
            </span>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* KDS body — slate-50 surface                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="container mx-auto max-w-6xl px-4 py-6">
        {isEmpty ? (
          /* Empty state (OBS-121) */
          <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
            <Coffee className="h-14 w-14 text-slate-300" aria-hidden="true" />
            <div>
              <p className="text-lg font-semibold text-gray-500">Belum ada pesanan</p>
              <p className="text-sm text-gray-400 mt-1">
                Pesanan baru akan muncul di sini
              </p>
            </div>
          </div>
        ) : (
          /* Three-column KDS grid */
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {(["new", "preparing", "ready"] as OrderStatus[]).map((status) => (
              <KdsColumn
                key={status}
                status={status}
                orders={orders.filter((o) => o.status === status)}
                onAdvance={handleAdvance}
                onComplete={handleComplete}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
