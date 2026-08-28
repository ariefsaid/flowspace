/**
 * Repository: bookings (I-021) + facilities read model + keycard read (I-024).
 *
 * All reads/writes are server-side via Drizzle over Supabase Postgres (ADR-0015).
 * Every org-scoped function takes a server-derived `orgId` — the client never
 * supplies it (ADR-0004). Cross-org ids never match (org-scoped WHERE) and
 * cross-org writes throw BEFORE any write.
 *
 * Money path [SEC]:
 * - Scheduled (COWORKING_SEAT / MEETING_ROOM): the facility row is resolved
 *   WITHIN the org and is the source of truth for the rate; the client-supplied
 *   rate is ignored on that branch. durationHours is re-derived server-side from
 *   the start/end timestamps; amount = hours × DB rate. Never client values.
 * - Walk-in (WALKIN_COWORKING / WALKIN_MEETING): opens at amount 0
 *   (WAITING_CASHIER); charged at completeBooking, capped at 4h.
 * - The booking insert + the ledger row (recordTransaction) are atomic in one
 *   db.transaction — the domain write and the reporting write commit together.
 */
import { and, eq, isNull, asc, desc, gte, inArray, or, sql, lt, gt, ne, notExists } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { bookings, facilities, type Booking, type Facility } from "@/lib/db/schema";
import {
  recordTransaction,
  updateBookingTransaction,
} from "@/lib/db/transactions";
import { WALKIN_MAX_HOURS, isWalkin, isScheduled } from "@/lib/booking/walkin";
import type {
  BookingFacilityType,
  BookingPaymentStatus,
  BookingStatus,
  FacilityType,
  TransactionStatus,
} from "@/lib/db/enums";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateBookingInput = {
  orgId: string;
  userId: string;
  facilityType: BookingFacilityType;
  /** If omitted for a scheduled booking, the facility is resolved by
   *  (orgId, type, facilityName) — the UI label, matched server-side. */
  facilityId?: string | null;
  facilityName: string;
  startAt?: Date;
  endAt?: Date;
  /** Walk-in rate (server-derived fixed rate). IGNORED for scheduled bookings,
   *  whose rate is read from the facility row. */
  ratePerHourRupiah: number;
};

const HOUR_MS = 3_600_000;

// ---------------------------------------------------------------------------
// Facilities read model
// ---------------------------------------------------------------------------

/**
 * Org-scoped, bookable (available + non-archived) facilities, optional type
 * filter, ordered by name. AC-### / FR-###.
 */
export function listFacilities(
  orgId: string,
  type?: FacilityType,
): Promise<Facility[]> {
  const conds = [
    eq(facilities.orgId, orgId),
    isNull(facilities.archivedAt),
    eq(facilities.available, true),
  ];
  if (type) conds.push(eq(facilities.type, type));
  return db
    .select()
    .from(facilities)
    .where(and(...conds))
    .orderBy(asc(facilities.name));
}

// ---------------------------------------------------------------------------
// Availability read model (I-040, spec 0007)
//
// Occupancy is decided by two rules (OBS-810/811):
//   (a) same-facility overlap — any active-like (PENDING/CONFIRMED/ACTIVE)
//       booking on the SAME facility overlapping the window occupies it.
//   (b) full-room ↔ individual-seat exclusivity, asymmetric:
//       - a FULL_ROOM booking occupies EVERY individual facility for its own
//         reserved interval (interval-granularity — getFacilityAvailability).
//       - ANY individual-seat/meeting booking on a calendar day makes the
//         full-room facility unavailable for that WHOLE DAY (day-granularity
//         — getFullRoomAvailability), not just the overlapping window.
// Both read paths reuse the half-open overlap semantics from
// lib/booking/interval.ts's intervalsOverlap (AC-848: "availability
// semantics match creation conflict semantics") — expressed here as
// `startAt < end AND (endAt IS NULL OR endAt > start)` via Drizzle's typed
// operators (not a raw sql template — mixing a custom Postgres enum column
// with a Date parameter inside one raw `sql` fragment trips a postgres-js
// param-serialization bug) so it runs as one indexed query rather than a JS
// post-filter; an open-ended walk-in (`end_at IS NULL`) counts as unbounded
// (always the second half of the AND).
// ---------------------------------------------------------------------------

/** The three booking statuses that occupy a facility (OBS-810). */
export function activeLikeStatuses(): BookingStatus[] {
  return ["PENDING", "CONFIRMED", "ACTIVE"];
}

/**
 * Org-scoped, bookable facilities with NO active-like booking overlapping
 * `[start, end)` — either on the facility itself, or (for individual
 * facilities) blocked by a FULL_ROOM booking overlapping the same window.
 */
export async function facilitiesAvailableInWindow(
  orgId: string,
  start: Date,
  end: Date,
): Promise<Facility[]> {
  return db
    .select()
    .from(facilities)
    .where(
      and(
        eq(facilities.orgId, orgId),
        isNull(facilities.archivedAt),
        eq(facilities.available, true),
        notExists(
          db
            .select({ one: sql`1` })
            .from(bookings)
            .where(
              and(
                eq(bookings.orgId, orgId),
                inArray(bookings.status, activeLikeStatuses()),
                lt(bookings.startAt, end),
                or(isNull(bookings.endAt), gt(bookings.endAt, start)),
                or(eq(bookings.facilityId, facilities.id), eq(bookings.facilityType, "FULL_ROOM")),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(facilities.name));
}

/**
 * True when `facilityId` has NO active-like booking overlapping
 * `[start, end)` — either directly, or via a FULL_ROOM booking overlapping
 * the same window (OBS-811, "a full-room booking makes individual seats
 * unavailable for its reserved interval"). AC-804/AC-806.
 */
export async function getFacilityAvailability(
  orgId: string,
  facilityId: string,
  start: Date,
  end: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(1)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        inArray(bookings.status, activeLikeStatuses()),
        lt(bookings.startAt, end),
        or(isNull(bookings.endAt), gt(bookings.endAt, start)),
        or(eq(bookings.facilityId, facilityId), eq(bookings.facilityType, "FULL_ROOM")),
      ),
    );
  return (row?.count ?? 0) === 0;
}

/**
 * True only when NO individual-facility (non-FULL_ROOM) active-like booking
 * exists anywhere in `[dayStart, dayEnd)` — day-granularity, not merely the
 * requested window (OBS-811, FR-851, AC-805).
 */
export async function getFullRoomAvailability(
  orgId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(1)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        inArray(bookings.status, activeLikeStatuses()),
        ne(bookings.facilityType, "FULL_ROOM"),
        lt(bookings.startAt, dayEnd),
        or(isNull(bookings.endAt), gt(bookings.endAt, dayStart)),
      ),
    );
  return (row?.count ?? 0) === 0;
}

// ---------------------------------------------------------------------------
// Race-safe write serialization (Design decision, docs/plans/2026-08-28-
// booking-parity.md — advisory-lock serialization over a hard exclusion
// constraint, chosen because AC-804/810 need overlapping active-like rows to
// exist as fixtures, and an open-ended walk-in's null end_at would make a
// GiST exclusion treat it as +infinity forever).
//
// These two helpers are the reusable lock primitives FR-850/FR-851 require:
// the future createBooking/extendBooking transaction (Phase 5, a separate
// dispatch) takes one of these as its FIRST statement, inside the SAME
// db.transaction as its overlap re-check and insert/update, so the check
// and the write are atomic against a concurrent writer. They are proven
// here as a generic mechanism (lib/db/booking-lock.int.test.ts) — no
// booking-create call site exists yet to integration-test AC-815/AC-816
// against; those land with the createBooking rewrite.
//
// pg_advisory_xact_lock auto-releases at COMMIT/ROLLBACK of the enclosing
// transaction — never needs an explicit unlock. hashtextextended(text, salt)
// collapses the key to one bigint (the single-argument lock overload); the
// salt namespaces this lock domain from any other advisory-lock user in the
// codebase (e.g. lib/db/printers.ts's default-printer lock uses salt 42).
// ---------------------------------------------------------------------------

/**
 * Serializes writers on the same (org, facility) for the life of the
 * caller's transaction — same-facility seat/room overlap (FR-850, AC-815).
 */
export async function acquireFacilityLock(
  tx: Pick<typeof db, "execute">,
  orgId: string,
  facilityId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${orgId} || ':' || ${facilityId}, 850))`,
  );
}

/**
 * Serializes writers across the whole org for one calendar day — full-room ↔
 * individual-seat exclusivity, both directions (FR-851, AC-816). `calendarDay`
 * is caller-normalized (e.g. an ISO `YYYY-MM-DD` in the org's local day).
 */
export async function acquireOrgDayLock(
  tx: Pick<typeof db, "execute">,
  orgId: string,
  calendarDay: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${orgId} || ':' || ${calendarDay}, 851))`,
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Member booking history, newest first. */
export function listBookingsByUser(
  orgId: string,
  userId: string,
  limit = 100,
): Promise<Booking[]> {
  return db
    .select()
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), eq(bookings.userId, userId)))
    .orderBy(desc(bookings.createdAt))
    .limit(limit);
}

/**
 * The member's newest ACTIVE booking (the /keycard source), or null. Cross-org
 * ids never match (org-scoped WHERE). AC-### (I-024).
 */
export async function getActiveBooking(
  orgId: string,
  userId: string,
): Promise<Booking | null> {
  const [row] = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        eq(bookings.userId, userId),
        eq(bookings.status, "ACTIVE"),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(1);
  return row ?? null;
}

/** Admin: org bookings, newest first, optional status / since filter. */
export function listBookings(
  orgId: string,
  opts?: { status?: BookingStatus; since?: Date; limit?: number },
): Promise<Booking[]> {
  const conds = [eq(bookings.orgId, orgId)];
  if (opts?.status) conds.push(eq(bookings.status, opts.status));
  if (opts?.since) conds.push(gte(bookings.createdAt, opts.since));
  return db
    .select()
    .from(bookings)
    .where(and(...conds))
    .orderBy(desc(bookings.createdAt))
    .limit(opts?.limit ?? 200);
}

// ---------------------------------------------------------------------------
// createBooking [SEC] — single tx: booking + ledger row
// ---------------------------------------------------------------------------

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const { orgId, userId, facilityType } = input;

  if (facilityType === "FULL_ROOM") {
    // FULL_ROOM has no online booking (contact for price).
    throw new Error("FULL_ROOM_NOT_BOOKABLE_ONLINE");
  }
  const walkin = isWalkin(facilityType);
  const scheduled = isScheduled(facilityType);
  if (!walkin && !scheduled) throw new Error("INVALID_FACILITY_TYPE");

  let ratePerHourRupiah = input.ratePerHourRupiah;
  let facilityId: string | null = input.facilityId ?? null;
  let facilityName = input.facilityName;

  if (scheduled) {
    if (!input.endAt) throw new Error("SCHEDULED_REQUIRES_END_AT");
    // Resolve the facility row WITHIN this org. The DB row is the source of
    // truth for id/name/rate [SEC]; the client-supplied rate is ignored here.
    const idCond = input.facilityId
      ? and(eq(facilities.id, input.facilityId), eq(facilities.orgId, orgId))
      : and(
          eq(facilities.name, input.facilityName),
          eq(facilities.type, facilityType as FacilityType),
          eq(facilities.orgId, orgId),
        );
    const [facility] = await db
      .select()
      .from(facilities)
      .where(
        and(idCond, eq(facilities.available, true), isNull(facilities.archivedAt)),
      )
      .limit(1);
    if (!facility) throw new Error("INVALID_FACILITY");
    ratePerHourRupiah = facility.ratePerHourRupiah;
    facilityId = facility.id;
    facilityName = facility.name;
  }

  const startAt = input.startAt ?? new Date();
  let endAt: Date | null = input.endAt ?? null;
  let durationHours: number | null = null;
  let amountRupiah = 0;
  let paymentStatus: BookingPaymentStatus;
  let txnStatus: TransactionStatus;
  let txnAmount = 0;

  if (scheduled) {
    // Re-derive hours server-side from the timestamps (never client durationHours).
    endAt = input.endAt!;
    const ms = endAt.getTime() - startAt.getTime();
    durationHours = Math.ceil(ms / HOUR_MS);
    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      throw new Error("INVALID_DURATION");
    }
    amountRupiah = durationHours * ratePerHourRupiah;
    paymentStatus = "PENDING"; // settled online (simulated) later
    txnStatus = "COMPLETED"; // ledger records the charge immediately
    txnAmount = amountRupiah;
  } else {
    // Walk-in: open-ended; charged at completeBooking (cap 4h).
    endAt = null;
    durationHours = null;
    amountRupiah = 0;
    paymentStatus = "WAITING_CASHIER";
    txnStatus = "PENDING";
    txnAmount = 0;
  }

  return db.transaction(async (tx) => {
    const [booking] = await tx
      .insert(bookings)
      .values({
        orgId,
        userId,
        facilityType,
        facilityId,
        facilityName,
        startAt,
        endAt,
        durationHours,
        ratePerHourRupiah,
        amountRupiah,
        status: "ACTIVE",
        paymentStatus,
      })
      .returning();

    await recordTransaction(
      {
        orgId,
        userId,
        type: "BOOKING",
        description: `Booking ${facilityName}`,
        amountRupiah: txnAmount,
        status: txnStatus,
        bookingId: booking.id,
      },
      tx,
    );

    return booking;
  });
}

// ---------------------------------------------------------------------------
// completeBooking — walk-in settlement (cap 4h) + scheduled close-out
// ---------------------------------------------------------------------------

/**
 * Completes an ACTIVE booking.
 *  - Walk-in: computes actual elapsed hours (ceil), caps at 4h, sets
 *    durationHours/endAt/amount from the DB rate × capped hours.
 *  - Scheduled: amount/duration were fixed at creation; just flips to COMPLETED.
 *
 * Org-scoped: a cross-org id resolves to NOT_FOUND before any write. [SEC]
 */
export async function completeBooking(
  orgId: string,
  id: string,
): Promise<Booking> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId)))
    .limit(1);
  if (!booking) throw new Error("NOT_FOUND");
  if (booking.status !== "ACTIVE") throw new Error("INVALID_TRANSITION");

  const now = new Date();
  let endAt = booking.endAt;
  let durationHours = booking.durationHours;
  let amountRupiah = booking.amountRupiah;

  if (isWalkin(booking.facilityType)) {
    const elapsedHours =
      (now.getTime() - booking.startAt.getTime()) / HOUR_MS;
    const hours = Math.min(Math.ceil(elapsedHours), WALKIN_MAX_HOURS);
    durationHours = hours;
    endAt = now;
    amountRupiah = hours * booking.ratePerHourRupiah;
  }

  // Compare-and-set on status (concurrent complete/cancel → 0 rows → reject), and
  // sync the linked ledger row's amount in the SAME tx — a walk-in's BOOKING txn was
  // created at 0 (open duration); its real charge is only known now, so revenue KPIs
  // must see it. Status stays PENDING until the cashier approves (approvePayment).
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(bookings)
      .set({
        status: "COMPLETED",
        endAt,
        durationHours,
        amountRupiah,
        updatedAt: now,
      })
      .where(
        and(
          eq(bookings.id, id),
          eq(bookings.orgId, orgId),
          eq(bookings.status, "ACTIVE"),
        ),
      )
      .returning();
    if (!updated) throw new Error("INVALID_TRANSITION");

    await updateBookingTransaction(orgId, id, { amountRupiah }, tx);
    return updated;
  });
}

// ---------------------------------------------------------------------------
// cancelBooking
// ---------------------------------------------------------------------------

/** Cancels an ACTIVE booking (org-scoped; cross-org → NOT_FOUND). */
export async function cancelBooking(
  orgId: string,
  id: string,
): Promise<Booking> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId)))
    .limit(1);
  if (!booking) throw new Error("NOT_FOUND");
  if (booking.status !== "ACTIVE") throw new Error("INVALID_TRANSITION");

  const [updated] = await db
    .update(bookings)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(bookings.id, id),
        eq(bookings.orgId, orgId),
        eq(bookings.status, "ACTIVE"),
      ),
    )
    .returning();
  if (!updated) throw new Error("INVALID_TRANSITION");
  return updated;
}

// ---------------------------------------------------------------------------
// Pending payments + cashier approve  [SEC][SoD] — ADMIN-only at the action layer
// ---------------------------------------------------------------------------

/**
 * Admin pending-payments surface: bookings whose cashier payment is still
 * WAITING_CASHIER, excluding CANCELLED. A walk-in lands here on creation; a
 * scheduled booking lands here only if its payment has not been recorded.
 * Newest first; org-scoped (cross-org rows never match).
 */
export function listPendingBookings(orgId: string): Promise<Booking[]> {
  return db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        eq(bookings.paymentStatus, "WAITING_CASHIER"),
        // ponytail: exclude CANCELLED explicitly. The status domain is
        // ACTIVE/COMPLETED/CANCELLED, so IN (ACTIVE, COMPLETED) is equivalent
        // to <> CANCELLED and reads as intent.
        inArray(bookings.status, ["ACTIVE", "COMPLETED"]),
      ),
    )
    .orderBy(desc(bookings.createdAt));
}

/**
 * Cashier approves an offline payment for a WAITING_CASHIER booking [SEC][SoD].
 * Atomic in one db.transaction: sets paymentStatus PAID_CASHIER (compare-and-set
 * on WAITING_CASHIER so a concurrent approve/cancel is rejected, not silently
 * overwritten) AND settles the linked BOOKING ledger row to COMPLETED so the
 * amount counts toward revenue. Org-scoped: a cross-org id resolves to
 * NOT_FOUND before any write.
 *
 * ponytail: the booking amount is NOT recomputed here — walk-in charges are
 * computed by completeBooking (cap 4h). This action only records that the
 * cashier accepted payment for the booking's current amount and settles the
 * ledger row; the [SEC] money invariant is "amount stays server-derived".
 */
export async function approvePayment(
  orgId: string,
  id: string,
): Promise<Booking> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId)))
    .limit(1);
  if (!booking) throw new Error("NOT_FOUND");
  if (booking.paymentStatus !== "WAITING_CASHIER") {
    throw new Error("INVALID_TRANSITION");
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(bookings)
      .set({ paymentStatus: "PAID_CASHIER", updatedAt: new Date() })
      .where(
        and(
          eq(bookings.id, id),
          eq(bookings.orgId, orgId),
          eq(bookings.paymentStatus, "WAITING_CASHIER"),
        ),
      )
      .returning();
    if (!updated) throw new Error("INVALID_TRANSITION");
    await updateBookingTransaction(orgId, id, { status: "COMPLETED" }, tx);
    return updated;
  });
}
