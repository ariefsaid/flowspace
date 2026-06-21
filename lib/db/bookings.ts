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
import { and, eq, isNull, asc, desc, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { bookings, facilities, type Booking, type Facility } from "@/lib/db/schema";
import {
  recordTransaction,
  settleBookingTransaction,
  setBookingTransactionAmount,
} from "@/lib/db/transactions";
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
/** Walk-in open coworking/meeting is charged per started hour, capped at 4h
 *  (recon: "MAX 4h charge"). Enforced in completeBooking. */
const WALKIN_MAX_HOURS = 4;

function isWalkin(t: BookingFacilityType): boolean {
  return t === "WALKIN_COWORKING" || t === "WALKIN_MEETING";
}
function isScheduled(t: BookingFacilityType): boolean {
  return t === "COWORKING_SEAT" || t === "MEETING_ROOM";
}

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

    await setBookingTransactionAmount(orgId, id, amountRupiah, tx);
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
    await settleBookingTransaction(orgId, id, tx);
    return updated;
  });
}
