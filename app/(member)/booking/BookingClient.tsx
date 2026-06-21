"use client";

import { useState } from "react";
import { ChevronLeft, MapPin, AlertCircle } from "lucide-react";
import { Stepper } from "@/components/ui/Stepper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

import { Step1Type, type BookingType } from "@/components/member/booking/Step1Type";
import { Step2Time, type TimeSelection } from "@/components/member/booking/Step2Time";
import { Step3Place, type PlaceSelection } from "@/components/member/booking/Step3Place";
import { Step4Confirm } from "@/components/member/booking/Step4Confirm";
import { createBookingAction } from "./actions";
import type { FacilityType } from "@/lib/db/enums";

// ---------------------------------------------------------------------------
// Facility view (server-read listFacilities → passed down as props)
// ---------------------------------------------------------------------------

export type FacilityView = {
  id: string;
  name: string;
  type: FacilityType;
  ratePerHourRupiah: number;
  available: boolean;
};

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BookingClient({ facilities }: { facilities: FacilityView[] }) {
  const [step, setStep] = useState(0);
  const [bookingType, setBookingType] = useState<BookingType | null>(null);
  const [time, setTime] = useState<TimeSelection>(defaultTime());
  const [place, setPlace] = useState<PlaceSelection | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selecting a type on step 0 auto-advances to step 1
  function handleSelectType(type: BookingType) {
    setBookingType(type);
    // Reset downstream selections when type changes
    setTime(defaultTime());
    setPlace(null);
    setConfirmed(false);
    setError(null);
    // Small delay so the selection animation is visible before advancing
    setTimeout(() => setStep(1), 180);
  }

  function canAdvance(): boolean {
    if (step === 1) {
      if (!time.date) return false;
      const isWalkin =
        bookingType === "walkin-coworking" ||
        bookingType === "walkin-meeting";
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

  // ponytail: client-side bookability guard against the server-read facilities —
  // catches an unavailable/archived seat before the round-trip. The server action
  // remains the authority (it re-resolves the facility within the org).
  function isPlaceBookable(): boolean {
    if (!place) return false;
    if (bookingType === "scheduled-fullroom") return true; // contact request
    const expectedType: FacilityType =
      bookingType === "scheduled-coworking" ? "COWORKING_SEAT" : "MEETING_ROOM";
    return facilities.some(
      (f) => f.type === expectedType && f.name === place.label && f.available,
    );
  }

  async function handleConfirm() {
    if (!bookingType || !place) return;
    setError(null);

    // Full Room has no online booking — the UI keeps this as a contact request.
    if (bookingType === "scheduled-fullroom") {
      setConfirmed(true);
      return;
    }

    if (!isPlaceBookable()) {
      setError("Tempat yang dipilih tidak tersedia. Silakan pilih tempat lain.");
      return;
    }

    setSubmitting(true);
    try {
      await createBookingAction({ bookingType, time, place });
      setConfirmed(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal membuat booking. Silakan coba lagi.",
      );
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
            <Step3Place
              bookingType={bookingType}
              selected={place}
              onSelect={setPlace}
            />
          )}
          {step === 3 && bookingType && place && (
            <Step4Confirm
              bookingType={bookingType}
              time={time}
              place={place}
              onConfirm={handleConfirm}
              confirmed={confirmed}
            />
          )}
        </div>
      </Card>

      {/* Inline server-action error (money-path defect surface, AC-style). */}
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
      {step > 0 && !confirmed && (
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
      {confirmed && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => {
              setStep(0);
              setBookingType(null);
              setTime(defaultTime());
              setPlace(null);
              setConfirmed(false);
              setError(null);
            }}
          >
            Buat Booking Baru
          </Button>
        </div>
      )}
    </div>
  );
}
