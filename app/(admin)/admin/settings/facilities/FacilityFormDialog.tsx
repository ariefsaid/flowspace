"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input, Select, Button } from "@/components/ui";
import type { Facility } from "@/lib/db/schema";
import type { FacilityType } from "@/lib/db/enums";
import { FACILITY_TYPES } from "@/lib/db/enums";
import type { FacilityInput } from "@/lib/db/facilities-admin";
import { parseFacilityFieldError, type FacilityField } from "./facilityErrors";

export type FacilityFormValues = FacilityInput;

const TYPE_LABELS: Record<FacilityType, string> = {
  COWORKING_SEAT: "Coworking Seat",
  MEETING_ROOM: "Meeting Room",
  FULL_ROOM: "Full Room",
};

const EMPTY: FacilityFormValues = {
  name: "",
  type: "COWORKING_SEAT",
  ratePerHourRupiah: 0,
  capacity: null,
  seatLabel: null,
  zone: null,
  maxHoursCap: null,
  available: true,
};

function toValues(facility: Facility | null): FacilityFormValues {
  if (!facility) return EMPTY;
  return {
    name: facility.name,
    type: facility.type,
    ratePerHourRupiah: facility.ratePerHourRupiah,
    capacity: facility.capacity,
    seatLabel: facility.seatLabel,
    zone: facility.zone,
    maxHoursCap: facility.maxHoursCap,
    available: facility.available,
  };
}

/** Parse a number input to a non-negative integer, or null when blank. */
function toOptionalInt(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

export function FacilityFormDialog({
  initial,
  onCancel,
  onSave,
}: {
  initial: Facility | null;
  onCancel: () => void;
  onSave: (values: FacilityFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<FacilityFormValues>(() => toValues(initial));
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [fieldError, setFieldError] = useState<{ field: FacilityField; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = initial !== null;

  async function handleSubmit() {
    setStatus("saving");
    setFieldError(null);
    setFormError(null);
    try {
      await onSave(values);
    } catch (e) {
      setStatus("error");
      const fe = parseFacilityFieldError(e);
      if (fe) {
        setFieldError(fe);
      } else {
        setFormError("Gagal menyimpan fasilitas. Coba lagi.");
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="facility-form-title"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 id="facility-form-title" className="text-lg font-semibold text-gray-900">
            {isEdit ? "Edit Fasilitas" : "Tambah Fasilitas"}
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
          <label className="block" htmlFor="facility-name">
            <span className="text-sm font-medium text-gray-700">Nama Fasilitas</span>
            <Input
              id="facility-name"
              className="mt-1"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder="Contoh: Meeting Room A"
            />
          </label>

          <label className="block" htmlFor="facility-type">
            <span className="text-sm font-medium text-gray-700">Tipe</span>
            <Select
              id="facility-type"
              className="mt-1"
              value={values.type}
              onChange={(e) => setValues((v) => ({ ...v, type: e.target.value as FacilityType }))}
            >
              {FACILITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block" htmlFor="facility-rate">
              <span className="text-sm font-medium text-gray-700">Tarif per Jam (Rp)</span>
              <Input
                id="facility-rate"
                type="number"
                min={0}
                className="mt-1"
                aria-invalid={fieldError?.field === "ratePerHourRupiah"}
                aria-describedby={fieldError?.field === "ratePerHourRupiah" ? "facility-rate-error" : undefined}
                value={values.ratePerHourRupiah}
                onChange={(e) =>
                  setValues((v) => ({ ...v, ratePerHourRupiah: toOptionalInt(e.target.value) ?? 0 }))
                }
              />
              {fieldError?.field === "ratePerHourRupiah" && (
                <p id="facility-rate-error" role="alert" className="mt-1 text-xs text-red-600">
                  {fieldError.message}
                </p>
              )}
            </label>

            <label className="block" htmlFor="facility-capacity">
              <span className="text-sm font-medium text-gray-700">Kapasitas</span>
              <Input
                id="facility-capacity"
                type="number"
                min={0}
                className="mt-1"
                aria-invalid={fieldError?.field === "capacity"}
                aria-describedby={fieldError?.field === "capacity" ? "facility-capacity-error" : undefined}
                value={values.capacity ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, capacity: toOptionalInt(e.target.value) }))}
              />
              {fieldError?.field === "capacity" && (
                <p id="facility-capacity-error" role="alert" className="mt-1 text-xs text-red-600">
                  {fieldError.message}
                </p>
              )}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block" htmlFor="facility-seat-label">
              <span className="text-sm font-medium text-gray-700">Label Kursi (opsional)</span>
              <Input
                id="facility-seat-label"
                className="mt-1"
                value={values.seatLabel ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, seatLabel: e.target.value || null }))}
                placeholder="A, B, 1, 2..."
              />
            </label>
            <label className="block" htmlFor="facility-zone">
              <span className="text-sm font-medium text-gray-700">Zona (opsional)</span>
              <Input
                id="facility-zone"
                className="mt-1"
                value={values.zone ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, zone: e.target.value || null }))}
                placeholder="DESK, COUNTER..."
              />
            </label>
          </div>

          <label className="block" htmlFor="facility-max-hours">
            <span className="text-sm font-medium text-gray-700">Maks Jam Billing (opsional)</span>
            <Input
              id="facility-max-hours"
              type="number"
              min={0}
              className="mt-1"
              aria-invalid={fieldError?.field === "maxHoursCap"}
              aria-describedby={fieldError?.field === "maxHoursCap" ? "facility-max-hours-error" : undefined}
              value={values.maxHoursCap ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, maxHoursCap: toOptionalInt(e.target.value) }))}
              placeholder="Contoh: 4 (maks 4 jam billing untuk walk-in)"
            />
            {fieldError?.field === "maxHoursCap" && (
              <p id="facility-max-hours-error" role="alert" className="mt-1 text-xs text-red-600">
                {fieldError.message}
              </p>
            )}
          </label>

          <label className="flex items-center gap-2" htmlFor="facility-available">
            <input
              id="facility-available"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-200 text-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30"
              checked={values.available ?? true}
              onChange={(e) => setValues((v) => ({ ...v, available: e.target.checked }))}
            />
            <span className="text-sm font-medium text-gray-700">Tersedia untuk booking</span>
          </label>
        </div>

        {formError && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {formError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={status === "saving"}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={status === "saving"}>
            {status === "saving" ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
