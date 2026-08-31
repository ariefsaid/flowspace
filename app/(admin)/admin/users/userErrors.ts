/**
 * Maps admin user-management action rejections
 * (`app/(admin)/admin/users/actions.ts`) to inline UI messages. Money-adjacent
 * (credit / print-balance adjust) and auth-adjacent (password reset) — a
 * rejected action must surface inline, never a silent fail (I-047).
 */
export type UserField = "name" | "role" | "membershipTier";
export type UserFieldError = { field: UserField; message: string };

const FIELD_MESSAGES: Record<string, UserFieldError> = {
  INVALID_NAME: { field: "name", message: "Nama tidak boleh kosong." },
  INVALID_ROLE: { field: "role", message: "Role tidak valid." },
  INVALID_TIER: { field: "membershipTier", message: "Membership tidak valid." },
};

/** Returns the field error for a known name/role/tier rejection, or null (caller falls back to a generic message). */
export function parseUserFieldError(error: unknown): UserFieldError | null {
  if (!(error instanceof Error)) return null;
  return FIELD_MESSAGES[error.message] ?? null;
}

/** Password-reset rejections — surfaced next to the password field, never the generic form error. */
export const PASSWORD_ERROR_CODES = new Set([
  "PASSWORD_TOO_SHORT",
  "NO_AUTH_LINK",
  "PASSWORD_RESET_FAILED",
]);

export function isPasswordError(error: unknown): boolean {
  return error instanceof Error && PASSWORD_ERROR_CODES.has(error.message);
}

const GENERIC_MESSAGES: Record<string, string> = {
  NOT_FOUND: "User tidak ditemukan.",
  CANNOT_ARCHIVE_ADMIN: "Admin tidak bisa diarsipkan. Turunkan role-nya terlebih dahulu.",
  PASSWORD_TOO_SHORT: "Password minimal 6 karakter.",
  NO_AUTH_LINK: "User ini belum tertaut ke akun login.",
  PASSWORD_RESET_FAILED: "Gagal me-reset password. Coba lagi.",
  INVALID_DELTA: "Jumlah penyesuaian harus berupa angka bulat.",
  FORBIDDEN: "Anda tidak memiliki izin untuk aksi ini.",
};

/** Friendly inline message for any known action rejection; falls back to a generic retry message. */
export function userErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  return GENERIC_MESSAGES[code] ?? "Terjadi kesalahan. Coba lagi.";
}
