/**
 * Pure half-open interval-overlap check (I-040, spec 0007). The single
 * source of truth for booking-window overlap semantics — consumed by the
 * availability read model (lib/db/bookings.ts), the creation conflict check,
 * and the extension 60-minute guard — so AC-848 ("availability semantics
 * match creation conflict semantics") holds by construction rather than by
 * convention across call sites.
 *
 * Half-open `[start, end)`: two intervals that merely touch at a boundary
 * (one ends exactly when the other starts) do NOT overlap — a booking
 * ending at 10:00 does not conflict with one starting at 10:00.
 */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
