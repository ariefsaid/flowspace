/**
 * Maps facilities-admin repo rejections (`lib/db/facilities-admin.ts`) to the
 * offending form field + an inline Indonesian message. Money-adjacent
 * (`ratePerHourRupiah` feeds booking pricing) — a rejected save must surface
 * as a field-level error, never a silent fail (I-042).
 */
export type FacilityField = "ratePerHourRupiah" | "capacity" | "maxHoursCap";

export type FacilityFieldError = { field: FacilityField; message: string };

const MESSAGES: Record<string, FacilityFieldError> = {
  INVALID_RATE: {
    field: "ratePerHourRupiah",
    message: "Tarif per jam harus angka bulat ≥ 0.",
  },
  INVALID_CAPACITY: {
    field: "capacity",
    message: "Kapasitas harus angka bulat ≥ 0.",
  },
  INVALID_MAX_HOURS_CAP: {
    field: "maxHoursCap",
    message: "Maks jam billing harus angka bulat ≥ 0.",
  },
};

/** Returns the field error for a known repo rejection, or null (caller falls back to a generic message). */
export function parseFacilityFieldError(error: unknown): FacilityFieldError | null {
  if (!(error instanceof Error)) return null;
  return MESSAGES[error.message] ?? null;
}
