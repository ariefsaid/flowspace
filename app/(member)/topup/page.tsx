"use client";

import { useState } from "react";
import { Clock, Printer, Star } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/format";
import { creditPackages } from "@/lib/mock/packages";
import { currentMember } from "@/lib/mock/member";

// ---------------------------------------------------------------------------
// Print-balance packages (reasonable mock — spec capture pending OBS-101)
// ---------------------------------------------------------------------------

interface PrintPackage {
  id: string;
  pages: number;
  price: number;
  pricePerPage: number;
  popular?: boolean;
}

const printPackages: PrintPackage[] = [
  { id: "pp-50", pages: 50, price: 25000, pricePerPage: 500 },
  { id: "pp-100", pages: 100, price: 45000, pricePerPage: 450 },
  {
    id: "pp-200",
    pages: 200,
    price: 80000,
    pricePerPage: 400,
    popular: true,
  },
  { id: "pp-500", pages: 500, price: 175000, pricePerPage: 350 },
];

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type TabKey = "time" | "print";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TopUpPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("time");
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedPrint, setSelectedPrint] = useState<string | null>(null);

  const selectedPackageId = activeTab === "time" ? selectedTime : selectedPrint;

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
              {currentMember.timeCredits}.0
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
              {currentMember.printBalance}
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

        {/* Package grid */}
        {activeTab === "time" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {creditPackages.map((pkg) => {
              const isSelected = selectedTime === pkg.id;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() =>
                    setSelectedTime(isSelected ? null : pkg.id)
                  }
                  className={cn(
                    "relative rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
                    isSelected
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
                    {formatRupiah(pkg.price)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatRupiah(pkg.pricePerHour)}/hour
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {printPackages.map((pkg) => {
              const isSelected = selectedPrint === pkg.id;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() =>
                    setSelectedPrint(isSelected ? null : pkg.id)
                  }
                  className={cn(
                    "relative rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40",
                    isSelected
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

        {/* Purchase CTA — enabled only when a package is selected */}
        <div className="pt-2">
          <Button
            variant="primary"
            size="lg"
            disabled={selectedPackageId === null}
            className="w-full"
          >
            {activeTab === "time" ? (
              <>
                <Clock className="h-4 w-4" aria-hidden="true" />
                {selectedPackageId
                  ? `Beli Paket ${creditPackages.find((p) => p.id === selectedPackageId)?.hours} Jam`
                  : "Pilih Paket Waktu"}
              </>
            ) : (
              <>
                <Printer className="h-4 w-4" aria-hidden="true" />
                {selectedPackageId
                  ? `Beli ${printPackages.find((p) => p.id === selectedPackageId)?.pages} Halaman`
                  : "Pilih Paket Print"}
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
