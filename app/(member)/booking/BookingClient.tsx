"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, MapPin, AlertCircle, Loader2 } from "lucide-react";
import { Stepper } from "@/components/ui/Stepper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

import { Step1Type, type BookingType } from "@/components/member/booking/Step1Type";
import { Step2Time, type TimeSelection } from "@/components/member/booking/Step2Time";
import { FloorPlan, type FacilitySeat } from "@/components/member/booking/FloorPlan";
import { Step4Confirm, type CreatedBookingResult } from "@/components/member/booking/Step4Confirm";
import { createBookingAction, getFloorPlanAction } from "./actions";
import type { BookingPaymentChoice } from "@/lib/db/bookings";

// ---------------------------------------------------------------------------
// Wizard step metadata
// ---------------------------------------------------------------------------

const STEPS = ["Tipe", "Waktu", "Pilih Tempat", "Konfirmasi"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultTime(): TimeSelection {
  return { date: todayStr(), startTime: "09:00", durationHours: 2 };
}

export interface BookingClientProps {
  /** The member's real tier-discount percentages (server-resolved — never client-supplied). */
  discounts: { coworkingDiscountPct: number; meetingDiscountPct: number };
  /** The member's current time-credit balance (informational, for the payment picker). */
  timeCredits: number;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BookingClient({ discounts, timeCredits }: BookingClientProps) {
  const [step, setStep] = useState(0);
  const [bookingType, setBookingType] = useState<BookingType | null>(null);
  const [time, setTime] = useState<TimeSelection>(defaultTime());
  const [place, setPlace] = useState<FacilitySeat | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<BookingPaymentChoice>("cashier");
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [result, setResult] = useState<CreatedBookingResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server-driven floor plan (OBS-836 fix) — loaded when the wizard reaches
  // step 2 (Pilih Tempat), re-fetched whenever the type/time selection changes.
  const [seats, setSeats] = useState<FacilitySeat[] | null>(null);
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [seatsError, setSeatsError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 2 || !bookingType) return;
    let cancelled = false;
    setSeatsLoading(true);
    setSeatsError(null);
    getFloorPlanAction({ bookingType, time })
      .then((rows) => {
        if (!cancelled) setSeats(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setSeatsError(err instanceof Error ? err.message : "Gagal memuat denah tempat.");
        }
      })
      .finally(() => {
        if (!cancelled) setSeatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, bookingType, time.date, time.startTime, time.durationHours]);

  // Selecting a type on step 0 auto-advances to step 1
  function handleSelectType(type: BookingType) {
    setBookingType(type);
    // Reset downstream selections when type changes
    setTime(defaultTime());
    setPlace(null);
    setSeats(null);
    setResult(null);
    setError(null);
    setPaymentMethod("cashier");
    setPolicyAccepted(false);
    // Small delay so the selection animation is visible before advancing
    setTimeout(() => setStep(1), 180);
  }

  function canAdvance(): boolean {
    if (step === 1) {
      if (!time.date) return false;
      const isWalkin = bookingType === "walkin-coworking" || bookingType === "walkin-meeting";
      if (!isWalkin && !time.startTime) return false;
      return time.durationHours > 0;
    }
    if (step === 2) {
      return place !== null;
    }
    return true;
  }

  function goBack() {
    if (step > 0) setStep(step - 1);
  }

  function goNext() {
    if (step < STEPS.length - 1 && canAdvance()) {
      setStep(step + 1);
    }
  }

  async function handleConfirm() {
    if (!bookingType || !place || !policyAccepted) return;
    setError(null);
    setSubmitting(true);
    try {
      const created = await createBookingAction({
        bookingType,
        time,
        place,
        paymentMethod,
        acceptedPolicy: policyAccepted,
      });
      setResult(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat booking. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const stepTitles: Record<number, string> = {
    0: "Pilih Tipe Booking",
    1: "Pilih Waktu",
    2: "Pilih Tempat",
    3: "Konfirmasi",
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Booking</h1>
        <p className="text-sm text-gray-500 mt-1">
          Reservasi tempat duduk atau ruang meeting
        </p>
      </div>

      {/* Stepper */}
      <Stepper steps={STEPS} current={step} className="max-w-2xl" />

      {/* Step card */}
      <Card className="p-6">
        {/* Step card header */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
            <MapPin className="h-4 w-4 text-teal-600" />
          </div>
          <p className="text-base font-semibold text-gray-800">
            {stepTitles[step]}
          </p>
        </div>

        {/* Step content */}
        <div>
          {step === 0 && (
            <Step1Type selected={bookingType} onSelect={handleSelectType} />
          )}
          {step === 1 && bookingType && (
            <Step2Time
              bookingType={bookingType}
              value={time}
              onChange={setTime}
            />
          )}
          {step === 2 && bookingType && (
            <div className="space-y-4">
              {seatsLoading && (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-10 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Memuat denah tempat...
                </div>
              )}
              {!seatsLoading && seatsError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {seatsError}
                </div>
              )}
              {!seatsLoading && !seatsError && seats && (
                <FloorPlan
                  seats={seats}
                  selectedId={place?.id ?? null}
                  onSelect={(seat) => setPlace(seat)}
                />
              )}
            </div>
          )}
          {step === 3 && bookingType && place && (
            <Step4Confirm
              bookingType={bookingType}
              time={time}
              place={place}
              discounts={discounts}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
              policyAccepted={policyAccepted}
              onPolicyAcceptedChange={setPolicyAccepted}
              onConfirm={handleConfirm}
              submitting={submitting}
              result={result}
            />
          )}
        </div>
      </Card>

      {/* Inline server-action error (money-path defect surface, AC-842). */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation buttons — hidden on step 0 (auto-advance on selection) and after confirmation */}
      {step > 0 && !result && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={goBack}
            className="gap-1.5"
            disabled={submitting}
          >
            <ChevronLeft className="h-4 w-4" />
            Kembali
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              variant="primary"
              onClick={goNext}
              disabled={!canAdvance() || submitting}
            >
              Lanjut
            </Button>
          ) : null}
        </div>
      )}

      {/* Restart after confirmation */}
      {result && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => {
              setStep(0);
              setBookingType(null);
              setTime(defaultTime());
              setPlace(null);
              setSeats(null);
              setResult(null);
              setError(null);
              setPaymentMethod("cashier");
              setPolicyAccepted(false);
            }}
          >
            Buat Booking Baru
          </Button>
        </div>
      )}

      {timeCredits > 0 && step === 3 && !result && (
        <p className="text-center text-xs text-gray-400">
          Saldo Time Credits Anda: {timeCredits.toFixed(1)} jam
        </p>
      )}
    </div>
  );
}
