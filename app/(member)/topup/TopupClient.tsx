"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Printer, Star } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/format";
import { purchasePackageAction, topUpPrintAction } from "@/app/(member)/topup/actions";

// ---------------------------------------------------------------------------
// View shapes — DB TimeCreditPackage → what this component consumes.
// ---------------------------------------------------------------------------

export interface PackageView {
  id: string;
  name: string;
  hours: number;
  priceRupiah: number;
  pricePerHourRupiah: number;
  popular: boolean;
}

// ---------------------------------------------------------------------------
// Print-balance packages (denomination shortcuts).
// ponytail: these are UI-only denominations — there is no print-package table.
// The displayed price == the server charge (pages × flat Rp500/page), so the
// member is never shown a price the ledger doesn't match ([SEC]). Must stay in
// sync with lib/db/packages.ts PRINT_RATE_PER_PAGE_RUPIAH (server is authority).
// ---------------------------------------------------------------------------

const PRINT_RATE_PER_PAGE = 500;

interface PrintPackage {
  id: string;
  pages: number;
  price: number;
  pricePerPage: number;
  popular?: boolean;
}

const printPackages: PrintPackage[] = [
  { id: "pp-50", pages: 50 },
  { id: "pp-100", pages: 100 },
  { id: "pp-200", pages: 200, popular: true },
  { id: "pp-500", pages: 500 },
].map((p) => ({
  id: p.id,
  pages: p.pages,
  price: p.pages * PRINT_RATE_PER_PAGE,
  pricePerPage: PRINT_RATE_PER_PAGE,
  popular: p.popular,
}));

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type TabKey = "time" | "print";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TopupClientProps {
  packages: PackageView[];
  timeCredits: number;
  printBalance: number;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Map server-action error sentinels to user-facing Indonesian copy. */
function toErrorMessage(err: unknown): string {
  const sentinel = err instanceof Error ? err.message : String(err);
  const map: Record<string, string> = {
    UNKNOWN_PACKAGE: "Paket tidak tersedia.",
    INVALID_PAGES: "Jumlah halaman tidak valid.",
    USER_NOT_FOUND: "Sesi berakhir. Silakan masuk kembali.",
    UNAUTHENTICATED: "Sesi berakhir. Silakan masuk kembali.",
  };
  return map[sentinel] ?? "Pembelian gagal diproses. Coba lagi.";
}

export function TopupClient({
  packages,
  timeCredits,
  printBalance,
}: TopupClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabKey>("time");
  // ponytail: the card click IS the purchase (no confirm button in the existing
  // markup; click-to-buy is the minimal wire). Add a confirm step if misclick
  // protection is wanted — that is a deliberate UX change, out of scope here.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePurchaseTime(packageId: string) {
    if (pendingId) return;
    setError(null);
    setPendingId(packageId);
    try {
      await purchasePackageAction(packageId);
    } catch (err) {
      setError(toErrorMessage(err));
      setPendingId(null);
      return;
    }
    setPendingId(null);
    startTransition(() => {
      router.refresh();
    });
  }

  async function handlePurchasePrint(pages: number, packageId: string) {
    if (pendingId) return;
    setError(null);
    setPendingId(packageId);
    try {
      await topUpPrintAction(pages);
    } catch (err) {
      setError(toErrorMessage(err));
      setPendingId(null);
      return;
    }
    setPendingId(null);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Top Up</h1>
        <p className="mt-1 text-sm text-gray-500">
          Purchase time credits or add print balance
        </p>
      </div>

      {/* Balance tiles — act as tabs */}
      <div className="grid grid-cols-2 gap-4">
        {/* Time Credits tile */}
        <button
          type="button"
          onClick={() => setActiveTab("time")}
          className={cn(
            "flex items-center justify-between rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
            activeTab === "time"
              ? "border-2 border-teal-500 bg-white shadow-md"
              : "border border-slate-200 bg-white shadow-sm hover:border-teal-200",
          )}
        >
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Time Credits</p>
            <p className="mt-1 text-3xl font-bold text-teal-600">
              {timeCredits}.0
            </p>
            <p className="text-sm text-gray-500">hours available</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </div>
        </button>

        {/* Print Balance tile */}
        <button
          type="button"
          onClick={() => setActiveTab("print")}
          className={cn(
            "flex items-center justify-between rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40",
            activeTab === "print"
              ? "border-2 border-purple-500 bg-white shadow-md"
              : "border border-slate-200 bg-white shadow-sm hover:border-purple-200",
          )}
        >
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Print Balance</p>
            <p className="mt-1 text-3xl font-bold text-purple-600">
              {printBalance}
            </p>
            <p className="text-sm text-gray-500">pages available</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <Printer className="h-5 w-5" aria-hidden="true" />
          </div>
        </button>
      </div>

      {/* Package list panel */}
      <Card className="p-6 space-y-4">
        {/* Panel header */}
        <div className="flex items-center gap-2">
          {activeTab === "time" ? (
            <Clock className="h-5 w-5 text-teal-600" aria-hidden="true" />
          ) : (
            <Printer className="h-5 w-5 text-purple-600" aria-hidden="true" />
          )}
          <h2 className="text-lg font-semibold text-gray-800">
            {activeTab === "time"
              ? "Time Credit Packages"
              : "Print Balance Packages"}
          </h2>
        </div>

        {/* Inline error feedback for the money path ([SEC] — server sentinel → ID copy). */}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
          >
            {error}
          </p>
        )}

        {/* Package grid */}
        {activeTab === "time" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {packages.map((pkg) => {
              const isPending = pendingId === pkg.id;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  disabled={pendingId !== null}
                  onClick={() => handlePurchaseTime(pkg.id)}
                  className={cn(
                    "relative rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
                    isPending
                      ? "border-2 border-teal-500 bg-white shadow-md"
                      : "border border-slate-200 bg-white shadow-sm hover:border-teal-300",
                  )}
                >
                  {/* Popular badge */}
                  {pkg.popular && (
                    <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-medium text-white shadow-sm">
                      <Star className="h-3 w-3 fill-white" aria-hidden="true" />
                      Popular
                    </span>
                  )}

                  <p className="text-base font-semibold text-gray-900">
                    {pkg.hours} Hours
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {pkg.hours} hours of workspace access
                  </p>
                  <p className="mt-3 text-xl font-bold text-gray-900">
                    {formatRupiah(pkg.priceRupiah)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatRupiah(pkg.pricePerHourRupiah)}/hour
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {printPackages.map((pkg) => {
              const isPending = pendingId === pkg.id;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  disabled={pendingId !== null}
                  onClick={() => handlePurchasePrint(pkg.pages, pkg.id)}
                  className={cn(
                    "relative rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40",
                    isPending
                      ? "border-2 border-purple-500 bg-white shadow-md"
                      : "border border-slate-200 bg-white shadow-sm hover:border-purple-300",
                  )}
                >
                  {/* Popular badge */}
                  {pkg.popular && (
                    <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-medium text-white shadow-sm">
                      <Star className="h-3 w-3 fill-white" aria-hidden="true" />
                      Popular
                    </span>
                  )}

                  <p className="text-base font-semibold text-gray-900">
                    {pkg.pages} Pages
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {pkg.pages} pages of print balance
                  </p>
                  <p className="mt-3 text-xl font-bold text-gray-900">
                    {formatRupiah(pkg.price)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatRupiah(pkg.pricePerPage)}/page
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
