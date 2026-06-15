/**
 * Locale-aware formatting helpers (id-ID).
 *
 * Currency: "Rp" prefix, dot thousands, no decimals -> "Rp 75.000".
 * Dates: 24h clock, dot time separator -> "22 Mei 2026, 15.01".
 */

const LOCALE = "id-ID";

const rupiahFormatter = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
});

/** Format a number as Rupiah, e.g. `75000` -> `"Rp 75.000"`. */
export function formatRupiah(n: number): string {
  return `Rp ${rupiahFormatter.format(Math.round(n))}`;
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "22 Mei 2026, 15.01" — long date + 24h time (dot separator). */
export function formatDateID(d: Date | string): string {
  const date = toDate(d);
  const datePart = dateFormatter.format(date);
  // id-ID already uses "." as the time separator (e.g. "15.01").
  const timePart = timeFormatter.format(date).replace(/:/g, ".");
  return `${datePart}, ${timePart}`;
}

/** Date-only form: "22 Mei 2026". */
export function formatDateOnlyID(d: Date | string): string {
  return dateFormatter.format(toDate(d));
}

/**
 * Format a start/end pair.
 * Same day -> "22 Mei 2026, 15.01 - 17.01".
 * Different days -> "22 Mei 2026, 15.01 - 23 Mei 2026, 09.00".
 */
export function formatDateRangeID(a: Date | string, b: Date | string): string {
  const start = toDate(a);
  const end = toDate(b);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (sameDay) {
    const endTime = timeFormatter.format(end).replace(/:/g, ".");
    return `${formatDateID(start)} - ${endTime}`;
  }
  return `${formatDateID(start)} - ${formatDateID(end)}`;
}
