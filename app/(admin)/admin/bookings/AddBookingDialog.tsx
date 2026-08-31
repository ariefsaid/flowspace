"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input, Select, Button } from "@/components/ui";
import type { FacilityType } from "@/lib/db/enums";
import type { BookingPaymentChoice } from "@/lib/db/bookings";
import { parseBookingFieldError, bookingErrorMessage } from "./bookingErrors";

export interface AddBookingMemberOption {
  id: string;
  name: string;
  email: string;
}

export interface AddBookingFacilityOption {
  id: string;
  name: string;
  type: FacilityType;
  ratePerHourRupiah: number;
}

export interface AddBookingValues {
  userId: string;
  facilityId: string;
  facilityType: FacilityType;
  facilityName: string;
  startAt: Date;
  endAt: Date;
  paymentMethod: BookingPaymentChoice;
}

const PAYMENT_METHOD_LABELS: Record<BookingPaymentChoice, string> = {
  cashier: "Bayar di Kasir",
  online: "Sudah Bayar Online",
  time_credits: "Time Credits",
};

const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as BookingPaymentChoice[];

interface FormState {
  userId: string;
  facilityId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  paymentMethod: BookingPaymentChoice;
}

function defaultForm(): FormState {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const hour = now.getHours();
  return {
    userId: "",
    facilityId: "",
    startDate: dateStr,
    startTime: `${hour.toString().padStart(2, "0")}:00`,
    endDate: dateStr,
    endTime: `${(hour + 1).toString().padStart(2, "0")}:00`,
    paymentMethod: "cashier",
  };
}

export function AddBookingDialog({
  members,
  facilities,
  onCancel,
  onSave,
}: {
  members: AddBookingMemberOption[];
  facilities: AddBookingFacilityOption[];
  onCancel: () => void;
  onSave: (values: AddBookingValues) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: "userId"; message: string } | null>(null);

  async function handleSubmit() {
    if (!form.userId || !form.facilityId || !form.startDate || !form.startTime || !form.endDate || !form.endTime) {
      setFormError("Semua field wajib diisi.");
      setFieldError(null);
      return;
    }
    const facility = facilities.find((f) => f.id === form.facilityId);
    if (!facility) {
      setFormError("Fasilitas tidak valid. Pilih ulang.");
      return;
    }

    setSaving(true);
    setFormError(null);
    setFieldError(null);
    try {
      await onSave({
        userId: form.userId,
        facilityId: facility.id,
        facilityType: facility.type,
        facilityName: facility.name,
        startAt: new Date(`${form.startDate}T${form.startTime}:00`),
        endAt: new Date(`${form.endDate}T${form.endTime}:00`),
        paymentMethod: form.paymentMethod,
      });
    } catch (e) {
      const fe = parseBookingFieldError(e);
      if (fe) {
        setFieldError(fe);
      } else {
        setFormError(bookingErrorMessage(e));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-booking-title"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 id="add-booking-title" className="text-lg font-semibold text-gray-900">
            Tambah Booking Baru
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-gray-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block" htmlFor="add-booking-user">
            <span className="text-sm font-medium text-gray-700">Member</span>
            <Select
              id="add-booking-user"
              className="mt-1"
              value={form.userId}
              aria-invalid={fieldError?.field === "userId"}
              aria-describedby={fieldError?.field === "userId" ? "add-booking-user-error" : undefined}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
            >
              <option value="">Pilih member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </Select>
            {fieldError?.field === "userId" && (
              <p id="add-booking-user-error" role="alert" className="mt-1 text-xs text-red-600">
                {fieldError.message}
              </p>
            )}
          </label>

          <label className="block" htmlFor="add-booking-facility">
            <span className="text-sm font-medium text-gray-700">Fasilitas</span>
            <Select
              id="add-booking-facility"
              className="mt-1"
              value={form.facilityId}
              onChange={(e) => setForm((f) => ({ ...f, facilityId: e.target.value }))}
            >
              <option value="">Pilih fasilitas</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — Rp{f.ratePerHourRupiah.toLocaleString("id-ID")}/jam
                </option>
              ))}
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block" htmlFor="add-booking-start-date">
              <span className="text-sm font-medium text-gray-700">Tanggal Mulai</span>
              <Input
                id="add-booking-start-date"
                type="date"
                className="mt-1"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>
            <label className="block" htmlFor="add-booking-start-time">
              <span className="text-sm font-medium text-gray-700">Jam Mulai</span>
              <Input
                id="add-booking-start-time"
                type="time"
                className="mt-1"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block" htmlFor="add-booking-end-date">
              <span className="text-sm font-medium text-gray-700">Tanggal Selesai</span>
              <Input
                id="add-booking-end-date"
                type="date"
                className="mt-1"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </label>
            <label className="block" htmlFor="add-booking-end-time">
              <span className="text-sm font-medium text-gray-700">Jam Selesai</span>
              <Input
                id="add-booking-end-time"
                type="time"
                className="mt-1"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </label>
          </div>

          <label className="block" htmlFor="add-booking-payment">
            <span className="text-sm font-medium text-gray-700">Metode Pembayaran</span>
            <Select
              id="add-booking-payment"
              className="mt-1"
              value={form.paymentMethod}
              onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as BookingPaymentChoice }))}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {formError && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {formError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
