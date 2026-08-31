/**
 * Maps `bookings/actions.ts` rejections to friendly Indonesian messages for
 * the admin bookings board (Batalkan / Aktifkan Sekarang / Tambah Booking).
 * A thrown error code must never render as a silent fail — every caller
 * surfaces the mapped message via `role="alert"` (I-047).
 */
export type BookingErrorField = "userId";

export type BookingFieldError = { field: BookingErrorField; message: string };

const FIELD_MESSAGES: Record<string, BookingFieldError> = {
  USER_NOT_FOUND: {
    field: "userId",
    message: "Member tidak ditemukan. Pilih member yang valid.",
  },
};

const GENERIC_MESSAGES: Record<string, string> = {
  FORBIDDEN: "Anda tidak memiliki akses untuk aksi ini.",
  INVALID_TRANSITION: "Booking ini tidak bisa diaktifkan sekarang — statusnya sudah berubah. Refresh halaman.",
  NOT_FOUND: "Booking tidak ditemukan. Mungkin sudah diperbarui — refresh halaman.",
};

/** Field-level error for a known repo rejection (e.g. highlight the member picker), or null. */
export function parseBookingFieldError(error: unknown): BookingFieldError | null {
  if (!(error instanceof Error)) return null;
  return FIELD_MESSAGES[error.message] ?? null;
}

/** A single friendly message for any known/unknown booking-action rejection. */
export function bookingErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Terjadi kesalahan. Coba lagi.";
  return GENERIC_MESSAGES[error.message] ?? FIELD_MESSAGES[error.message]?.message ?? "Terjadi kesalahan. Coba lagi.";
}
