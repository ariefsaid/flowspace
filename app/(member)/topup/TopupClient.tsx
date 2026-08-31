"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Printer, Star, CreditCard, CheckCircle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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

export interface PrintPackageView {
  id: string;
  pages: number;
  priceRupiah: number;
  sortOrder: number;
  popular?: boolean;
}

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

export type TabKey = "time" | "print";

/** Purchase-confirm dialog recap — a display-only snapshot of the clicked
 *  card, not sent back to the server (the action still takes only the id). */
interface SelectedPurchase {
  kind: "time" | "print";
  id: string;
  label: string;
  sub: string;
  priceRupiah: number;
}

/** ~2s mock processing delay (matches the captured original's payment-gateway
 *  simulation) before the (unchanged) server action is called. */
const PROCESSING_DELAY_MS = 1800;
/** How long the success dialog stays up before auto-closing. */
const SUCCESS_AUTOCLOSE_MS = 1500;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TopupClientProps {
  packages: PackageView[];
  printPackages?: PrintPackageView[];
  timeCredits: number;
  printBalance: number;
  /** Deep-link initial tab (?tab=print, or the original's ?tab=papercut). */
  initialTab?: TabKey;
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
  printPackages = [],
  timeCredits,
  printBalance,
  initialTab = "time",
}: TopupClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [error, setError] = useState<string | null>(null);

  // Confirm-dialog flow (AC-i049-7): card click opens a recap dialog, never
  // purchases directly. `selected` is the display-only recap; `processing`
  // and `success` are the dialog's sub-states.
  const [selected, setSelected] = useState<SelectedPurchase | null>(null);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  function openConfirm(purchase: SelectedPurchase) {
    if (selected) return; // a purchase is already in flight/open
    setError(null);
    setSelected(purchase);
  }

  function closeDialog() {
    setSelected(null);
    setProcessing(false);
    setSuccess(false);
  }

  async function handleConfirm() {
    if (!selected || processing) return;
    setProcessing(true);

    // Mock payment-gateway delay, same as the original, before the (real,
    // unchanged) server action fires.
    await new Promise((resolve) => setTimeout(resolve, PROCESSING_DELAY_MS));

    try {
      if (selected.kind === "time") {
        await purchasePackageAction(selected.id);
      } else {
        await topUpPrintAction(selected.id);
      }
    } catch (err) {
      setError(toErrorMessage(err));
      closeDialog();
      return;
    }

    setProcessing(false);
    setSuccess(true);
    startTransition(() => {
      router.refresh();
    });
    setTimeout(closeDialog, SUCCESS_AUTOCLOSE_MS);
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
              const isSelected = selected?.kind === "time" && selected.id === pkg.id;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  disabled={selected !== null}
                  onClick={() =>
                    openConfirm({
                      kind: "time",
                      id: pkg.id,
                      label: `${pkg.hours} Hours`,
                      sub: `${pkg.hours} hours of workspace access`,
                      priceRupiah: pkg.priceRupiah,
                    })
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
          printPackages.length === 0 ? <p className="py-10 text-center text-sm text-gray-400">Belum ada paket print tersedia.</p> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {printPackages.map((pkg) => {
              const isSelected = selected?.kind === "print" && selected.id === pkg.id;
              const pricePerPage = Math.round(pkg.priceRupiah / pkg.pages);
              return (
                <button
                  key={pkg.id}
                  type="button"
                  disabled={selected !== null}
                  onClick={() =>
                    openConfirm({
                      kind: "print",
                      id: pkg.id,
                      label: `${pkg.pages} Pages`,
                      sub: `${pkg.pages} pages of print balance`,
                      priceRupiah: pkg.priceRupiah,
                    })
                  }
                  className={cn(
                    "relative rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40",
                    isSelected
                      ? "border-2 border-purple-500 bg-white shadow-md"
                      : "border border-slate-200 bg-white shadow-sm hover:border-purple-300",
                  )}
                >
                  <p className="text-base font-semibold text-gray-900">
                    {pkg.pages} Pages
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {pkg.pages} pages of print balance
                  </p>
                  <p className="mt-3 text-xl font-bold text-gray-900">
                    {formatRupiah(pkg.priceRupiah)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatRupiah(pricePerPage)}/page
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Purchase confirm dialog — recap + payment method → processing → success (AC-i049-7) */}
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={success ? "Pembelian Berhasil" : processing ? "Memproses Pembayaran" : "Konfirmasi Pembelian"}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={processing ? undefined : closeDialog}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-md">
            {success ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-8 w-8 text-green-600" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Pembelian Berhasil!</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {selected.label} telah ditambahkan ke akun Anda.
                </p>
              </div>
            ) : processing ? (
              <div className="text-center py-2">
                <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-teal-600" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-gray-900">Memproses...</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Mohon tunggu, kami sedang memproses pembayaran Anda.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Konfirmasi Pembelian</h3>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-gray-500">Paket</p>
                  <p className="font-semibold text-gray-900">{selected.label}</p>
                  <p className="text-sm text-gray-500">{selected.sub}</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {formatRupiah(selected.priceRupiah)}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="mb-2 text-sm font-medium text-gray-700">Metode Pembayaran</p>
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-8 w-8 text-teal-600" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-gray-900">Mock Payment Gateway</p>
                      <p className="text-sm text-gray-500">QRIS / Virtual Account</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={closeDialog}>
                    Batal
                  </Button>
                  <Button className="flex-1" onClick={handleConfirm}>
                    Konfirmasi
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
