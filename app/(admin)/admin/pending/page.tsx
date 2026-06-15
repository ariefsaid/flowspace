"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, MapPin, User, Phone, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { formatRupiah, formatDateID, formatDateRangeID } from "@/lib/format";
import { bookings, members } from "@/lib/mock";

// ---------------------------------------------------------------------------
// Derive pending items from mock data
// ---------------------------------------------------------------------------

interface PendingItem {
  id: string;
  facility: string;
  start: string;
  end: string;
  durationHours: number;
  amount: number;
  member: { name: string; phone: string } | null;
}

const memberBySession: Record<string, { name: string; phone: string }> = {
  "Meja F": { name: "Budi Santoso", phone: "+62 812 1111 1111" },
};

const pendingItems: PendingItem[] = bookings
  .filter((b) => b.payment === "WAITING_CASHIER" && b.status !== "CANCELLED")
  .map((b) => {
    // Try to find the member with an active session on this facility
    const matched = members.find(
      (m) => m.activeSession?.table === b.facility
    );
    const fallback = memberBySession[b.facility] ?? null;
    return {
      id: b.id,
      facility: b.facility,
      start: b.start,
      end: b.end,
      durationHours: b.durationHours,
      // Amount is 0 for walk-in sessions still ongoing (matches screenshot: Rp 0)
      amount: matched?.activeSession ? 0 : b.durationHours * 15000,
      member: matched
        ? { name: matched.name, phone: fallback?.phone ?? "" }
        : fallback,
    };
  });

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPendingPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allIds = pendingItems.map((p) => p.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  }

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleApprove() {
    // mock action — would call server action in production
    setSelected(new Set());
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pending Payments</h1>
          <p className="mt-1 text-sm text-gray-500">Approve offline cashier payments</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button variant="outline" size="md" onClick={toggleSelectAll}>
            Select All
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleApprove}
            disabled={selected.size === 0}
            className="gap-1.5"
          >
            <CircleCheck className="h-4 w-4" />
            Approve ({selected.size})
          </Button>
        </div>
      </div>

      {/* Waiting for cashier section */}
      {pendingItems.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-10 text-center">
          <CircleCheck className="mx-auto h-10 w-10 text-teal-400 mb-3" />
          <p className="text-gray-500 text-sm">Tidak ada pembayaran yang menunggu persetujuan.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Section title */}
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-200">
            <CircleAlert className="h-5 w-5 text-orange-500" />
            <span className="text-sm font-semibold text-gray-800">
              Waiting for Cashier Payment ({pendingItems.length})
            </span>
          </div>

          {/* Items */}
          <ul className="divide-y divide-slate-200">
            {pendingItems.map((item) => {
              const isChecked = selected.has(item.id);
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-start gap-4 px-6 py-4 transition-colors",
                    isChecked && "bg-teal-50/40"
                  )}
                >
                  {/* Checkbox */}
                  <div className="mt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleItem(item.id)}
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 accent-teal-600 cursor-pointer"
                      aria-label={`Select ${item.facility}`}
                    />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Facility + status badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="text-sm font-semibold text-gray-900">
                        {item.facility}
                      </span>
                      <Badge tone="pending">WAITING CASHIER</Badge>
                    </div>

                    {/* Member info row */}
                    {item.member && (
                      <div className="flex items-center gap-4 flex-wrap text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5 shrink-0" />
                          {item.member.name}
                        </span>
                        {item.member.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            {item.member.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {item.durationHours}h
                        </span>
                      </div>
                    )}

                    {/* Date range */}
                    <p className="text-xs text-gray-400">
                      {formatDateRangeID(item.start, item.end)}
                    </p>
                  </div>

                  {/* Amount + created */}
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-teal-600">
                      {formatRupiah(item.amount)}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Created {formatDateID(item.start)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
