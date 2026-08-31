/**
 * Repository: bookings (I-021, rewritten I-040 booking parity, spec 0007) +
 * facilities read model + keycard read (I-024).
 *
 * All reads/writes are server-side via Drizzle over Supabase Postgres (ADR-0015).
 * Every org-scoped function takes a server-derived `orgId` — the client never
 * supplies it (ADR-0004). Cross-org ids never match (org-scoped WHERE) and
 * cross-org writes throw BEFORE any write.
 *
 * Lifecycle (OBS-813, locked I-040 design):
 *   scheduled: PENDING → CONFIRMED → ACTIVE → COMPLETED|CANCELLED
 *   walk-in:   PENDING → ACTIVE → COMPLETED|CANCELLED (cashier starts it)
 *
 * Money path [SEC][MONEY]:
 * - Scheduled (COWORKING_SEAT / MEETING_ROOM / FULL_ROOM): the facility row is
 *   resolved WITHIN the org and is the source of truth for the rate; the
 *   client never supplies a rate/amount. durationHours is re-derived
 *   server-side from the start/end timestamps. The tier discount percentage
 *   is read server-side (`getTierDiscounts` + `resolveDiscountPct`) — never a
 *   client-supplied discount.
 * - Walk-in (WALKIN_COWORKING / WALKIN_MEETING): no facility row (facility_id
 *   stays null); rate is a server-fixed constant (`WALKIN_RATES`). Opens
 *   PENDING/WAITING_CASHIER at amount 0, end_at null; charged at checkout,
 *   capped at `WALKIN_MAX_HOURS`.
 * - Race safety (FR-850/FR-851, AC-815/AC-816): `createBooking` and
 *   `extendBooking` take BOTH the org-day advisory lock AND the org-facility
 *   advisory lock (fixed order: day, then facility) as their first
 *   statements, inside the SAME transaction as the overlap re-check and the
 *   insert/update. Taking both locks — not just the one keyed to the
 *   booking's own class — is what makes a full-room create and an
 *   individual-seat create on the SAME calendar day serialize against each
 *   other (both acquire the identical org-day key), while two same-facility
 *   creates also serialize via the shared org-facility key. A fixed
 *   acquisition order (day before facility) avoids a lock-ordering deadlock
 *   between concurrent writers.
 * - Every booking/ledger write pair (and, for a credits payment, the
 *   FIFO-spend lot decrement) commits atomically in one `db.transaction`.
 */
import { and, eq, isNull, isNotNull, asc, desc, gte, lte, inArray, or, sql, lt, gt, ne, notExists } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { appUsers, bookings, facilities, type Booking, type Facility } from "@/lib/db/schema";
import {
  recordTransaction,
  updateBookingTransaction,
  settleCheckoutTransactions,
  pendingBookingHours,
} from "@/lib/db/transactions";
import { spendTimeCredits } from "@/lib/db/time-credit-lots";
import { getTierDiscounts } from "@/lib/db/tier-config";
import { WALKIN_MAX_HOURS, isWalkin, isScheduled } from "@/lib/booking/walkin";
import { WALKIN_RATES } from "@/lib/booking/catalog";
import { computeBookingPrice, computeWalkinBilledHours, resolveDiscountPct } from "@/lib/booking/pricing";
import type {
  BookingFacilityType,
  BookingPaymentStatus,
  BookingStatus,
  FacilityType,
  MembershipTier,
} from "@/lib/db/enums";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How a member pays when creating a scheduled booking (never client-trusted status/amount — FR-859). */
export type BookingPaymentChoice = "online" | "time_credits" | "cashier";

/** How an admin settles checkout for an ACTIVE booking (OBS-820). */
export type CheckoutPaymentMethod = "cash" | "qris" | "time_credits";
/** [SEC] Runtime guard — the TS union above does not validate a server
 *  action's actual request body (e.g. a crafted "online", a valid
 *  BookingPaymentMethod but never a legitimate CHECKOUT method). */
const CHECKOUT_PAYMENT_METHODS: readonly CheckoutPaymentMethod[] = ["cash", "qris", "time_credits"];

export type CreateBookingInput = {
  orgId: string;
  userId: string;
  /**
   * @deprecated [SEC] IGNORED — kept for caller source-compat only. The
   * discount-eligible tier is resolved INSIDE the transaction from the
   * user's own `app_users` row (org-scoped), never trusted from the caller,
   * so a mismatched/crafted value here can never over- or under-charge.
   */
  tier: MembershipTier;
  facilityType: BookingFacilityType;
  /** If omitted for a scheduled booking, the facility is resolved by
   *  (orgId, type, facilityName) — the UI label, matched server-side. */
  facilityId?: string | null;
  facilityName: string;
  /** Required for scheduled bookings (including FULL_ROOM); ignored for walk-in. */
  startAt?: Date;
  endAt?: Date;
  paymentMethod: BookingPaymentChoice;
  /**
   * [SEC] The caller's own server-side confirmation that the member accepted
   * the cancellation/payment policy — validated by `createBookingAction`
   * BEFORE this function is even called (a caller MUST NOT set this true
   * without having independently checked). Recorded on the booking row
   * (`policyAcceptedAt`) as an audit trail; not itself re-validated here
   * (this repository trusts its caller within the server boundary, same as
   * every other server-derived field on this input).
   */
  acceptedPolicy?: boolean;
};

export type CheckoutPrice = {
  baseAmountRupiah: number;
  discountRupiah: number;
  amountRupiah: number;
  billedHours: number;
  maxHours: number;
};

const HOUR_MS = 3_600_000;
const EXTENSION_CAP_HOURS = 4;
const EXTENSION_GAP_MS = 60 * 60_000;
/** [SEC] Pending-hold DoS bounds (FR-852-adjacent, not a spec'd catalog cap —
 *  a coarse server-side sanity bound on any scheduled create). */
const SCHEDULED_MAX_HOURS = 8;
const MAX_START_HORIZON_MS = 90 * 24 * HOUR_MS;
/** Stale unpaid holds older than this, never approved, are auto-cancelled by the sweep. */
const STALE_PENDING_HOLD_MS = 24 * HOUR_MS;

/** UTC calendar-day key (`YYYY-MM-DD`) — the org-day advisory-lock namespace and the full-room day-window boundary. */
function calendarDayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayBounds(calendarDay: string): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(`${calendarDay}T00:00:00.000Z`);
  return { dayStart, dayEnd: new Date(dayStart.getTime() + 24 * HOUR_MS) };
}

/** The booking-create payment method → the settled ledger's payment_method; null while unsettled ("cashier" pends cashier/checkout settlement). */
function ledgerPaymentMethodForCreate(method: BookingPaymentChoice): "online" | "time_credits" | null {
  return method === "cashier" ? null : method;
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
//
// Both read paths reuse the half-open overlap semantics from
// lib/booking/interval.ts's intervalsOverlap (AC-848: "availability
// semantics match creation conflict semantics") — expressed here as
// `startAt < end AND (endAt IS NULL OR endAt > start)` via Drizzle's typed
// operators (not a raw sql template — mixing a custom Postgres enum column
// with a Date parameter inside one raw `sql` fragment trips a postgres-js
// param-serialization bug) so it runs as one indexed query rather than a JS
// post-filter; an open-ended walk-in (`end_at IS NULL`) counts as unbounded
// (always the second half of the AND).
//
// Both `facilityHasActiveOverlap`/`individualBookingExistsOnDay` accept a
// `dbLike` (either the global `db` or a caller's `tx`) so `createBooking` and
// `extendBooking` can re-run the EXACT same query inside the transaction that
// holds the advisory lock — AC-848 holds by construction, not convention.
// ---------------------------------------------------------------------------

/** The three booking statuses that occupy a facility (OBS-810). */
export function activeLikeStatuses(): BookingStatus[] {
  return ["PENDING", "CONFIRMED", "ACTIVE"];
}

/**
 * The half-open overlap condition `[start, end)` vs a booking's own
 * `[startAt, endAt)` — the SAME semantics as lib/booking/interval.ts's
 * `intervalsOverlap` (AC-848), expressed once as Drizzle conditions and
 * reused by every overlap query in this repository (dedupe: single oracle,
 * never re-inlined per call site). An open-ended walk-in (`end_at IS NULL`)
 * counts as unbounded. See the block comment above for why this is typed
 * Drizzle operators, not a raw `sql` template.
 */
function overlapsWindow(start: Date, end: Date) {
  return and(lt(bookings.startAt, end), or(isNull(bookings.endAt), gt(bookings.endAt, start)));
}

async function facilityHasActiveOverlap(
  dbLike: Pick<typeof db, "select">,
  orgId: string,
  facilityId: string,
  start: Date,
  end: Date,
  excludeBookingId?: string,
): Promise<boolean> {
  const conds = [
    eq(bookings.orgId, orgId),
    inArray(bookings.status, activeLikeStatuses()),
    overlapsWindow(start, end),
    or(eq(bookings.facilityId, facilityId), eq(bookings.facilityType, "FULL_ROOM")),
  ];
  if (excludeBookingId) conds.push(ne(bookings.id, excludeBookingId));
  const [row] = await dbLike
    .select({ count: sql<number>`count(1)::int` })
    .from(bookings)
    .where(and(...conds));
  return (row?.count ?? 0) > 0;
}

async function individualBookingExistsOnDay(
  dbLike: Pick<typeof db, "select">,
  orgId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<boolean> {
  const [row] = await dbLike
    .select({ count: sql<number>`count(1)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        inArray(bookings.status, activeLikeStatuses()),
        ne(bookings.facilityType, "FULL_ROOM"),
        overlapsWindow(dayStart, dayEnd),
      ),
    );
  return (row?.count ?? 0) > 0;
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
                overlapsWindow(start, end),
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
 *
 * [SEC] Resolves the facility row itself FIRST (org-scoped, bookable) — an
 * unknown or cross-org `facilityId` has no matching booking rows either, so
 * an overlap-only check would fail OPEN (report it "available"). Resolving
 * the row first makes an unknown/cross-org id resolve `false` instead.
 */
export async function getFacilityAvailability(
  orgId: string,
  facilityId: string,
  start: Date,
  end: Date,
): Promise<boolean> {
  const [facility] = await db
    .select({ id: facilities.id })
    .from(facilities)
    .where(and(eq(facilities.id, facilityId), eq(facilities.orgId, orgId), isNull(facilities.archivedAt)))
    .limit(1);
  if (!facility) return false;
  return !(await facilityHasActiveOverlap(db, orgId, facilityId, start, end));
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
  return !(await individualBookingExistsOnDay(db, orgId, dayStart, dayEnd));
}

/**
 * True when no active-like booking on `facilityId` starts within
 * `[gapStart, gapEnd)` — the extension 60-minute guard (OBS-822/FR-857,
 * AC-817). `excludeBookingId` omits the booking being extended itself.
 */
async function hasBookingStartingWithinGap(
  dbLike: Pick<typeof db, "select">,
  orgId: string,
  facilityId: string,
  gapStart: Date,
  gapEnd: Date,
  excludeBookingId: string,
): Promise<boolean> {
  const [row] = await dbLike
    .select({ count: sql<number>`count(1)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        // Same full-room↔individual-seat exclusivity as facilityHasActiveOverlap
        // (AC-848 oracle): a booking on the SAME facility, OR any FULL_ROOM
        // booking, starting within the gap also blocks — not just same-facility.
        or(eq(bookings.facilityId, facilityId), eq(bookings.facilityType, "FULL_ROOM")),
        inArray(bookings.status, activeLikeStatuses()),
        ne(bookings.id, excludeBookingId),
        gte(bookings.startAt, gapStart),
        lt(bookings.startAt, gapEnd),
      ),
    );
  return (row?.count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Race-safe write serialization (Design decision, docs/plans/2026-08-28-
// booking-parity.md — advisory-lock serialization over a hard exclusion
// constraint: AC-804/810 need overlapping active-like rows to exist as
// fixtures, which a real EXCLUDE constraint would forbid; an open-ended
// walk-in's null end_at would also make a GiST exclusion treat it as
// +infinity forever).
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
 *
 * Accepts an optional `dbLike` (the global `db` or a caller's `tx`). A plain,
 * UNLOCKED read — fine for a display-only caller (keycard, dashboard), but
 * NOT sufficient for a money-path caller gating a discount on ACTIVE status:
 * a concurrent cancel can still commit between this read and that caller's
 * later write (TOCTOU). Money-path callers must use
 * `getActiveBookingForUpdate` instead, inside their own transaction.
 */
export async function getActiveBooking(
  orgId: string,
  userId: string,
  dbLike: Pick<typeof db, "select"> = db,
): Promise<Booking | null> {
  const [row] = await dbLike
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

/**
 * ROW-LOCKED variant of `getActiveBooking`, for a money-path caller that
 * gates a write on ACTIVE-booking status (e.g. `createOrder`'s cafe-discount
 * eligibility, I-044 [MONEY] TOCTOU fix, round 2). MUST be called with the
 * caller's own `tx` — a `SELECT ... FOR UPDATE` issued outside an explicit
 * transaction releases the lock immediately after the statement, which
 * defeats the purpose entirely.
 *
 * `FOR UPDATE` locks the returned row for the remainder of the transaction:
 * a concurrent writer targeting the SAME booking row (e.g. cancelling it)
 * blocks until this transaction commits or rolls back, and — under READ
 * COMMITTED — re-reads the row's latest committed version once unblocked.
 * This makes the eligibility read and the money-path write it gates
 * genuinely inseparable: no concurrent cancel can land strictly between
 * them, closing the plain-SELECT TOCTOU window a bare re-check (even one
 * re-run inside the same transaction) does not close.
 */
export async function getActiveBookingForUpdate(
  orgId: string,
  userId: string,
  tx: Pick<typeof db, "select">,
): Promise<Booking | null> {
  const [row] = await tx
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
    .for("update")
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
// createBooking [SEC][MONEY] — single tx: lock + overlap re-check + insert + ledger (+ credit spend)
// ---------------------------------------------------------------------------

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const { orgId, userId, facilityType, paymentMethod, acceptedPolicy } = input;
  const policyAcceptedAt = acceptedPolicy ? new Date() : null;
  const isFullRoom = facilityType === "FULL_ROOM";
  const walkin = isWalkin(facilityType);
  const scheduled = isFullRoom || isScheduled(facilityType);
  if (!walkin && !scheduled) throw new Error("INVALID_FACILITY_TYPE");

  // ---- Walk-in: no facility, no overlap concept, always pay-at-cashier ----
  if (walkin) {
    const rate = WALKIN_RATES[facilityType as "WALKIN_COWORKING" | "WALKIN_MEETING"];
    return db.transaction(async (tx) => {
      // [SEC][I-047 fix-1] Same identity/tenancy guard as the scheduled
      // branch below: a walk-in has no facility row to anchor org membership
      // through (its facility_id stays null), so userId is the ONLY org
      // signal — resolve it INSIDE the tx and require it actually belongs to
      // orgId AND is not archived (an archived member's access is meant to
      // be revoked entirely, not just hidden from the directory — matches
      // `findByAuthUserId`'s session-resolution guard) before any write.
      // `FOR UPDATE` here is safe to take immediately (unlike the scheduled/
      // time_credits branch below): a walk-in never touches time_credit_lots
      // in the same transaction, so there is no OTHER contended resource for
      // this lock to reverse-order against (single-resource transactions
      // cannot deadlock). A cross-org or archived userId (or one that
      // doesn't exist) is rejected before any write.
      const [user] = await tx
        .select({ id: appUsers.id })
        .from(appUsers)
        .where(and(eq(appUsers.id, userId), eq(appUsers.orgId, orgId), isNull(appUsers.archivedAt)))
        .for("update")
        .limit(1);
      if (!user) throw new Error("USER_NOT_FOUND");

      const [booking] = await tx
        .insert(bookings)
        .values({
          orgId,
          userId,
          facilityType,
          facilityId: null,
          facilityName: input.facilityName,
          startAt: new Date(),
          endAt: null,
          durationHours: null,
          ratePerHourRupiah: rate,
          amountRupiah: 0,
          baseAmountRupiah: 0,
          discountRupiah: 0,
          status: "PENDING",
          paymentStatus: "WAITING_CASHIER",
          bookingMode: "WALKIN",
          paymentMethod: "cashier",
          policyAcceptedAt,
        })
        .returning();

      await recordTransaction(
        {
          orgId,
          userId,
          type: "BOOKING",
          description: `Booking ${input.facilityName}`,
          amountRupiah: 0,
          status: "PENDING",
          bookingId: booking.id,
          paymentMethod: null,
        },
        tx,
      );

      return booking;
    });
  }

  // ---- Scheduled (COWORKING_SEAT / MEETING_ROOM / FULL_ROOM) ----
  if (!input.endAt) throw new Error("SCHEDULED_REQUIRES_END_AT");
  const startAt = input.startAt ?? new Date();
  const endAt = input.endAt;
  const durationHours = Math.ceil((endAt.getTime() - startAt.getTime()) / HOUR_MS);
  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    throw new Error("INVALID_DURATION");
  }
  // [SEC] Pending-hold DoS guard: an unbounded duration or an arbitrarily
  // far-future start lets a single request pin a facility's inventory (a
  // PENDING/WAITING_CASHIER hold that never expires until an admin/sweep
  // touches it) far beyond any real booking. Bound duration to the
  // documented 1-8h scheduled window and the start horizon to 90 days out.
  if (durationHours > SCHEDULED_MAX_HOURS) {
    throw new Error("INVALID_DURATION");
  }
  if (startAt.getTime() - Date.now() > MAX_START_HORIZON_MS) {
    throw new Error("START_TOO_FAR_OUT");
  }
  // [SEC] One-day constraint: the org-day advisory lock and the full-room
  // day-window exclusivity (individualBookingExistsOnDay) are both keyed by
  // a SINGLE calendarDayOf(startAt). A booking spanning two calendar days
  // would only ever take/check the START day's lock+window, leaving its tail
  // end on the next day unlocked and unchecked against that day's full-room
  // exclusivity — a real race/exclusivity gap, not just a display quirk.
  // Simplest safe fix: reject cross-midnight intervals outright.
  if (calendarDayOf(startAt) !== calendarDayOf(endAt)) {
    throw new Error("CROSS_MIDNIGHT_NOT_ALLOWED");
  }

  // Resolve the facility row WITHIN this org — the DB row is the source of
  // truth for id/name/rate [SEC]; the client-supplied rate is never trusted.
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
    .where(and(idCond, eq(facilities.available, true), isNull(facilities.archivedAt)))
    .limit(1);
  if (!facility) throw new Error("INVALID_FACILITY");
  // [SEC][MONEY] The facility ROW is the source of truth for its type — a
  // client-supplied facilityType that disagrees with the resolved row (e.g.
  // a desk id submitted as "FULL_ROOM") is rejected before any write, never
  // silently honored. This also prevents the booking's stored facilityType
  // (which drives full-room/individual-seat exclusivity) from disagreeing
  // with the rate actually charged.
  if (facility.type !== facilityType) throw new Error("FACILITY_TYPE_MISMATCH");

  let status: BookingStatus;
  let paymentStatus: BookingPaymentStatus;
  if (paymentMethod === "online" || paymentMethod === "time_credits") {
    status = "CONFIRMED";
    paymentStatus = "PAID_ONLINE";
  } else if (paymentMethod === "cashier") {
    status = "PENDING";
    paymentStatus = "WAITING_CASHIER";
  } else {
    throw new Error("INVALID_PAYMENT_METHOD");
  }
  const txnStatus = paymentMethod === "cashier" ? "PENDING" : "COMPLETED";

  const calendarDay = calendarDayOf(startAt);

  return db.transaction(async (tx) => {
    // Fixed lock order (day, then facility): every scheduled/full-room create
    // takes BOTH keys so a same-day full-room↔seat race (AC-816) and a
    // same-facility race (AC-815) both serialize, no matter which class
    // either concurrent writer belongs to.
    await acquireOrgDayLock(tx, orgId, calendarDay);
    await acquireFacilityLock(tx, orgId, facility.id);

    // [SEC][MONEY][I-047 fix-2] Facility TOCTOU close: `facility` above was
    // read BEFORE this transaction (and before its advisory lock) — a
    // concurrent admin archive/availability-toggle/type-change/rate-change
    // could have committed in the window between that read and this lock.
    // Now that this tx holds the facility's own advisory lock, RE-READ the
    // row `FOR UPDATE` and use ONLY this fresh row for every downstream
    // decision (type/rate/name/availability) — never the pre-tx snapshot.
    // `FOR UPDATE` also serializes against a concurrent
    // updateFacility/archiveFacility write (facilities-admin.ts) targeting
    // the SAME row: that single-statement write simply blocks until this tx
    // commits/rolls back, so it can never land strictly between this read
    // and this transaction's own commit either.
    const [freshFacility] = await tx
      .select()
      .from(facilities)
      .where(and(eq(facilities.id, facility.id), eq(facilities.orgId, orgId)))
      .for("update")
      .limit(1);
    if (!freshFacility || !freshFacility.available || freshFacility.archivedAt) {
      throw new Error("FACILITY_UNAVAILABLE");
    }
    if (freshFacility.type !== facilityType) throw new Error("FACILITY_TYPE_MISMATCH");

    // [SEC] Identity/tier seam: resolve the user row + its CURRENT tier
    // INSIDE the tx from the DB — never the caller-supplied `tier` — and
    // require the user actually belongs to `orgId` and is not archived. This
    // is a fast, UNLOCKED fail-fast (tier resolution + the common case); the
    // genuine TOCTOU-closing re-check (below, `FOR UPDATE`) is deliberately
    // deferred until AFTER any time-credit spend so the lock order stays
    // time_credit_lots-before-app_users across every credit-touching path
    // (matches spendTimeCredits/recomputeCreditCache and adjustCredits —
    // see time-credit-lots.ts/users.ts) — locking app_users here, before
    // spendTimeCredits locks the lots rows, would reverse that order for a
    // time_credits payment and reintroduce the lock-order deadlock finding 4
    // fixes elsewhere. A cross-org or archived userId (or one that doesn't
    // exist) is rejected before any write.
    const [user] = await tx
      .select({ membershipTier: appUsers.membershipTier })
      .from(appUsers)
      .where(and(eq(appUsers.id, userId), eq(appUsers.orgId, orgId), isNull(appUsers.archivedAt)))
      .limit(1);
    if (!user) throw new Error("USER_NOT_FOUND");

    if (isFullRoom) {
      const { dayStart, dayEnd } = dayBounds(calendarDay);
      const dayBlocked = await individualBookingExistsOnDay(tx, orgId, dayStart, dayEnd);
      if (dayBlocked) throw new Error("FACILITY_UNAVAILABLE");
    }
    const occupied = await facilityHasActiveOverlap(tx, orgId, freshFacility.id, startAt, endAt);
    if (occupied) throw new Error("FACILITY_UNAVAILABLE");

    const discounts = await getTierDiscounts(orgId, user.membershipTier, tx);
    const discountPct = resolveDiscountPct(facilityType, discounts);
    const price = computeBookingPrice({ hours: durationHours, ratePerHourRupiah: freshFacility.ratePerHourRupiah, discountPct });

    const [booking] = await tx
      .insert(bookings)
      .values({
        orgId,
        userId,
        facilityType: freshFacility.type, // [SEC] derived from the freshly re-read row, never the client request or the pre-tx snapshot
        facilityId: freshFacility.id,
        facilityName: freshFacility.name,
        startAt,
        endAt,
        durationHours,
        ratePerHourRupiah: freshFacility.ratePerHourRupiah,
        amountRupiah: price.amountRupiah,
        baseAmountRupiah: price.baseAmountRupiah,
        discountRupiah: price.discountRupiah,
        status,
        paymentStatus,
        bookingMode: "SCHEDULED",
        paymentMethod,
        policyAcceptedAt,
      })
      .returning();

    if (paymentMethod === "time_credits") {
      // Throws INSUFFICIENT_CREDITS before any debit when short — the whole
      // tx (including the insert above) rolls back (AC-823).
      await spendTimeCredits({ orgId, userId, hours: durationHours, tx });
    }

    // [SEC][I-047 fix-1] Archived-user TOCTOU close: re-verify, holding a
    // REAL row lock, as the LAST app_users touch in this transaction —
    // placed intentionally AFTER the optional time-credit spend above (see
    // the lock-order comment on the unlocked read further up). Either this
    // select blocks on a concurrent archiveUser's still-in-flight UPDATE and
    // then observes its committed result, or archiveUser blocks on THIS
    // lock and only proceeds after this transaction finishes — no interleave
    // can let an archived user's booking commit.
    const [stillActive] = await tx
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(and(eq(appUsers.id, userId), eq(appUsers.orgId, orgId), isNull(appUsers.archivedAt)))
      .for("update")
      .limit(1);
    if (!stillActive) throw new Error("USER_NOT_FOUND");

    await recordTransaction(
      {
        orgId,
        userId,
        type: "BOOKING",
        description: `Booking ${freshFacility.name}`,
        amountRupiah: price.amountRupiah,
        discountRupiah: price.discountRupiah,
        status: txnStatus,
        bookingId: booking.id,
        paymentMethod: ledgerPaymentMethodForCreate(paymentMethod),
      },
      tx,
    );

    return booking;
  });
}

// ---------------------------------------------------------------------------
// approveAndStartWalkIn [SEC][SoD] — ADMIN-only at the action layer
// ---------------------------------------------------------------------------

/**
 * A cashier starts a walk-in: PENDING → ACTIVE, `start_at` = approval time,
 * `end_at` stays null (FR-854 — never a manufactured +24h end, fixing
 * OBS-841). Compare-and-set on `status='PENDING'` (single-row CAS is
 * sufficient here — no cross-row overlap check applies to a facility-less
 * walk-in). Org-scoped: a cross-org id resolves to NOT_FOUND before any write.
 */
export async function approveAndStartWalkIn(orgId: string, id: string): Promise<Booking> {
  const now = new Date();
  const [updated] = await db
    .update(bookings)
    .set({ status: "ACTIVE", startAt: now, updatedAt: now })
    .where(
      and(
        eq(bookings.id, id),
        eq(bookings.orgId, orgId),
        eq(bookings.status, "PENDING"),
        eq(bookings.bookingMode, "WALKIN"),
        eq(bookings.paymentStatus, "WAITING_CASHIER"),
      ),
    )
    .returning();
  if (updated) return updated;

  const [existing] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId)))
    .limit(1);
  throw new Error(existing ? "INVALID_TRANSITION" : "NOT_FOUND");
}

// ---------------------------------------------------------------------------
// approvePayment — scheduled cashier settlement [SEC][SoD] (PENDING→CONFIRMED)
// ---------------------------------------------------------------------------

/**
 * Cashier approves an offline payment for a scheduled, WAITING_CASHIER
 * booking [SEC][SoD]. Atomic in one db.transaction: PENDING→CONFIRMED,
 * paymentStatus WAITING_CASHIER→PAID_CASHIER (compare-and-set — a concurrent
 * approve/cancel is rejected, not silently overwritten) AND settles the
 * linked BOOKING ledger row to COMPLETED so the amount counts toward revenue.
 * Org-scoped: a cross-org id resolves to NOT_FOUND before any write. A
 * walk-in row (bookingMode WALKIN) is rejected here — walk-ins are started
 * via `approveAndStartWalkIn`, never settled through this path.
 */
export async function approvePayment(orgId: string, id: string): Promise<Booking> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(bookings)
      .set({ status: "CONFIRMED", paymentStatus: "PAID_CASHIER", updatedAt: new Date() })
      .where(
        and(
          eq(bookings.id, id),
          eq(bookings.orgId, orgId),
          eq(bookings.status, "PENDING"),
          eq(bookings.bookingMode, "SCHEDULED"),
          eq(bookings.paymentStatus, "WAITING_CASHIER"),
        ),
      )
      .returning();

    if (!updated) {
      const [existing] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId)))
        .limit(1);
      throw new Error(existing ? "INVALID_TRANSITION" : "NOT_FOUND");
    }

    await updateBookingTransaction(orgId, id, { status: "COMPLETED" }, tx);
    return updated;
  });
}

// ---------------------------------------------------------------------------
// activateConfirmedBooking [SEC][SoD] — admin "Aktifkan Sekarang" (I-047)
// ---------------------------------------------------------------------------

/** The payment statuses `runStatusSweep` itself requires before auto-activating a CONFIRMED row — reused here so the manual fallback can never activate a row the sweep itself would refuse. */
const ACTIVATABLE_PAYMENT_STATUSES: BookingPaymentStatus[] = ["PAID_ONLINE", "PAID_CASHIER"];

/**
 * Admin manual activation of a paid, scheduled CONFIRMED booking — the
 * fallback for when `runStatusSweep` (the cron sweep that normally flips
 * CONFIRMED→ACTIVE at its scheduled start) misfires or hasn't run yet.
 * Compare-and-set on `status='CONFIRMED'` AND `payment_status` ∈
 * {PAID_ONLINE, PAID_CASHIER} — matching `runStatusSweep`'s own invariant
 * [SEC][MONEY]: an unpaid WAITING_CASHIER row is CONFIRMED-shaped only in a
 * state the normal create/approvePayment flow never actually produces, but
 * this function must not trust `status` alone to imply payment — a
 * concurrent cancel/sweep/checkout is also rejected, not silently
 * overwritten. Org-scoped: a cross-org id resolves to NOT_FOUND before any
 * write. `startAt` is only ever set to now if it was somehow still unset;
 * the normal case (startAt already holds the member's actual scheduled
 * start, chosen at create) is left untouched — activating early/late never
 * rewrites the booked start time.
 */
export async function activateConfirmedBooking(orgId: string, id: string): Promise<Booking> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ startAt: bookings.startAt })
      .from(bookings)
      .where(
        and(
          eq(bookings.id, id),
          eq(bookings.orgId, orgId),
          eq(bookings.status, "CONFIRMED"),
          eq(bookings.bookingMode, "SCHEDULED"),
          inArray(bookings.paymentStatus, ACTIVATABLE_PAYMENT_STATUSES),
        ),
      )
      .for("update")
      .limit(1);

    if (!current) {
      const [existing] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId)))
        .limit(1);
      throw new Error(existing ? "INVALID_TRANSITION" : "NOT_FOUND");
    }

    const now = new Date();
    const [updated] = await tx
      .update(bookings)
      .set({ status: "ACTIVE", startAt: current.startAt ?? now, updatedAt: now })
      .where(
        and(
          eq(bookings.id, id),
          eq(bookings.orgId, orgId),
          eq(bookings.status, "CONFIRMED"),
          inArray(bookings.paymentStatus, ACTIVATABLE_PAYMENT_STATUSES),
        ),
      )
      .returning();
    if (!updated) throw new Error("INVALID_TRANSITION");
    return updated;
  });
}

// ---------------------------------------------------------------------------
// previewCheckout + checkoutBooking [SEC][MONEY] — ADMIN-only at the action layer
// ---------------------------------------------------------------------------

/**
 * Shared billed-hours + tier-discount pricing for a checkout: walk-in bills
 * `computeWalkinBilledHours(elapsed, WALKIN_MAX_HOURS)` (OBS-817/AC-812/844);
 * scheduled bills its booked `durationHours` regardless of elapsed time
 * (AC-813). The tier discount is RE-resolved against the member's CURRENT
 * tier config at checkout time (Director-approved: scheduled amounts stay
 * frozen at create; checkout always recomputes, matching OBS-820/FR-856).
 */
async function resolveCheckoutPricing(
  dbLike: Pick<typeof db, "select">,
  booking: Booking,
  now: Date,
): Promise<CheckoutPrice> {
  // [SEC][POOL] `dbLike` is forwarded to getTierDiscounts below too — when
  // this runs inside checkoutBooking's transaction (dbLike === tx), the
  // discount lookup MUST reuse that same connection, not open a second one
  // from the pool (see getTierDiscounts's own doc comment).
  const walkin = booking.bookingMode === "WALKIN";
  const billedHours = walkin
    ? computeWalkinBilledHours(now.getTime() - booking.startAt.getTime(), WALKIN_MAX_HOURS)
    : (booking.durationHours ?? 0);

  const [member] = await dbLike
    .select({ membershipTier: appUsers.membershipTier })
    .from(appUsers)
    .where(and(eq(appUsers.id, booking.userId), eq(appUsers.orgId, booking.orgId)))
    .limit(1);
  const discounts = member
    ? await getTierDiscounts(booking.orgId, member.membershipTier, dbLike)
    : { coworkingDiscountPct: 0, meetingDiscountPct: 0, cafeDiscountPct: 0, printDiscountPct: 0 };
  const discountPct = resolveDiscountPct(booking.facilityType, discounts);
  const price = computeBookingPrice({ hours: billedHours, ratePerHourRupiah: booking.ratePerHourRupiah, discountPct });

  return { ...price, billedHours, maxHours: walkin ? WALKIN_MAX_HOURS : billedHours };
}

/** Read-only checkout preview — resolves a non-COMPLETED/CANCELLED booking in-org, recomputes its current price. */
export async function previewCheckout(orgId: string, id: string): Promise<CheckoutPrice> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId)))
    .limit(1);
  if (!booking) throw new Error("NOT_FOUND");
  if (booking.status === "COMPLETED" || booking.status === "CANCELLED") {
    throw new Error("INVALID_TRANSITION");
  }
  return resolveCheckoutPricing(db, booking, new Date());
}

/**
 * Checks out an ACTIVE booking [SEC][MONEY][SoD]. Inside one transaction:
 * compare-and-set on `status='ACTIVE'` (else INVALID_TRANSITION — AC-836/845),
 * recompute billed hours + tier discount, set `end_at`=now for a walk-in
 * (kept unchanged for scheduled), flip to COMPLETED, and settle payment —
 * `cash`/`qris` → PAID_CASHIER; `time_credits` → FIFO-debit
 * (`spendTimeCredits`, throws INSUFFICIENT_CREDITS → whole tx rolls back,
 * AC-823) → PAID_ONLINE. The linked BOOKING ledger row is settled atomically
 * (AC-828). Org-scoped: a cross-org id resolves to NOT_FOUND before any write.
 */
export async function checkoutBooking(
  orgId: string,
  id: string,
  paymentMethod: CheckoutPaymentMethod,
): Promise<Booking> {
  // [SEC] Runtime-validate BEFORE any read/write — the TS union is
  // compile-time only and does not guard a server action's actual request.
  if (!CHECKOUT_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new Error("INVALID_PAYMENT_METHOD");
  }
  return db.transaction(async (tx) => {
    // Cheap pre-read for the lock keys only (mirrors extendBooking's
    // two-phase read). [SEC] Serializes checkout against a concurrent
    // extend/create on the SAME facility+day BEFORE any pricing read — a
    // checkout that read the booking before a concurrent extend committed
    // could otherwise still pass its status='ACTIVE' CAS (extend never
    // changes status) and overwrite the extend's committed
    // duration/amount with a stale, pre-extension value (a lost update).
    const [pre] = await tx
      .select({ facilityId: bookings.facilityId, startAt: bookings.startAt, bookingMode: bookings.bookingMode })
      .from(bookings)
      .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId)))
      .limit(1);
    if (!pre) throw new Error("NOT_FOUND");
    if (pre.bookingMode === "SCHEDULED" && pre.facilityId) {
      await acquireOrgDayLock(tx, orgId, calendarDayOf(pre.startAt));
      await acquireFacilityLock(tx, orgId, pre.facilityId);
    }

    const [booking] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId)))
      .limit(1);
    if (!booking) throw new Error("NOT_FOUND");
    if (booking.status !== "ACTIVE") throw new Error("INVALID_TRANSITION");

    const now = new Date();
    const price = await resolveCheckoutPricing(tx, booking, now);
    const walkin = booking.bookingMode === "WALKIN";

    // [SEC][MONEY] Prepaid double-debit fix: a SCHEDULED booking's base
    // charge is ALWAYS already settled by the time it reaches ACTIVE — via
    // spendTimeCredits/online at create (paymentStatus PAID_ONLINE), or via
    // approvePayment (PAID_CASHIER) BEFORE runStatusSweep ever activates it.
    // Checkout must never re-debit/re-settle that base charge — only a
    // genuinely-PENDING extension charge (if any) is actually owed. A
    // walk-in has no prepay path at all: its full elapsed-based charge is
    // always first owed (and first known) right here, at checkout.
    const owedHours = walkin ? price.billedHours : await pendingBookingHours(orgId, id, booking.ratePerHourRupiah, tx);
    const settling = walkin || owedHours > 0;
    const paymentStatus: BookingPaymentStatus = settling
      ? (paymentMethod === "time_credits" ? "PAID_ONLINE" : "PAID_CASHIER")
      : booking.paymentStatus; // nothing newly settled here — leave as-is

    const [updated] = await tx
      .update(bookings)
      .set({
        status: "COMPLETED",
        endAt: walkin ? now : booking.endAt,
        durationHours: price.billedHours,
        amountRupiah: price.amountRupiah,
        baseAmountRupiah: price.baseAmountRupiah,
        discountRupiah: price.discountRupiah,
        paymentStatus,
        updatedAt: now,
      })
      .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId), eq(bookings.status, "ACTIVE")))
      .returning();
    if (!updated) throw new Error("INVALID_TRANSITION");

    if (paymentMethod === "time_credits" && owedHours > 0) {
      await spendTimeCredits({ orgId, userId: booking.userId, hours: owedHours, tx });
    }

    // [SEC][MONEY] Settle by TRANSACTION ID, preserving each PENDING row's
    // own amount — the base row (if still pending) and any pending
    // extension row settle INDEPENDENTLY, never collapsed into one
    // recomputed total (that was the double-count bug: updateBookingTransaction
    // used to bulk-overwrite every BOOKING row for the booking with the same
    // total). A walk-in's single row is priced only now (amount 0 at
    // create) — its amount IS meant to be set here.
    await settleCheckoutTransactions(
      orgId,
      id,
      { paymentMethod, walkinAmountRupiah: walkin ? price.amountRupiah : undefined },
      tx,
    );

    return updated;
  });
}

// ---------------------------------------------------------------------------
// extendBooking [SEC][MONEY] — ACTIVE scheduled bookings only
// ---------------------------------------------------------------------------

/**
 * Extends an ACTIVE scheduled booking (OBS-822/FR-857). Total duration caps
 * at `EXTENSION_CAP_HOURS` (4h); rejected if already at/above the cap
 * (AC-818). Rejected if another active-like booking on the SAME facility
 * starts within 60 minutes of the proposed end (AC-817). On success: end/
 * duration/amount update AND a new PENDING extension ledger row insert
 * atomically (OBS-823/AC-818). Walk-ins (open-ended, no fixed duration) are
 * rejected — extension only applies to a scheduled booking's fixed end.
 */
export async function extendBooking(orgId: string, id: string, extraHours: number): Promise<Booking> {
  if (!Number.isFinite(extraHours) || extraHours <= 0) throw new Error("INVALID_EXTENSION");

  return db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId)))
      .limit(1);
    if (!booking) throw new Error("NOT_FOUND");
    if (
      booking.status !== "ACTIVE" ||
      booking.bookingMode !== "SCHEDULED" ||
      !booking.facilityId ||
      !booking.endAt ||
      booking.durationHours == null
    ) {
      throw new Error("INVALID_TRANSITION");
    }

    // Lock BEFORE re-reading: serializes against a concurrent extend/create
    // on the same facility (fixed day-then-facility order matches createBooking).
    await acquireOrgDayLock(tx, orgId, calendarDayOf(booking.startAt));
    await acquireFacilityLock(tx, orgId, booking.facilityId);

    const [fresh] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId)))
      .limit(1);
    if (!fresh || fresh.status !== "ACTIVE" || !fresh.endAt || fresh.durationHours == null || !fresh.facilityId) {
      throw new Error("INVALID_TRANSITION");
    }

    const cappedTotalHours = Math.min(fresh.durationHours + extraHours, EXTENSION_CAP_HOURS);
    const proposedEnd = new Date(fresh.startAt.getTime() + cappedTotalHours * HOUR_MS);
    if (proposedEnd.getTime() <= fresh.endAt.getTime()) throw new Error("EXTENSION_LIMIT_REACHED");
    // [SEC] Same one-day constraint as createBooking, for the same reason:
    // the org-day advisory lock + full-room day-window exclusivity taken
    // above are both keyed by the START day's calendarDayOf(fresh.startAt) —
    // an extension whose proposed end lands on the NEXT calendar day would
    // escape that day's lock/exclusivity window for its tail end, exactly
    // like a cross-midnight create would.
    if (calendarDayOf(fresh.startAt) !== calendarDayOf(proposedEnd)) {
      throw new Error("CROSS_MIDNIGHT_NOT_ALLOWED");
    }

    // [SEC] Full-room↔individual-seat exclusivity is DAY-granularity, not
    // interval-granularity (OBS-811, same rule createBooking applies at
    // create time): ANY individual-seat/meeting booking anywhere on the
    // calendar day makes the FULL_ROOM facility unavailable for the WHOLE
    // day, regardless of whether it overlaps the specific extended window or
    // sits inside the 60-min gap. The overlap/gap checks below are keyed to
    // fresh.facilityId (the full room's OWN row) and would miss a seat
    // booking entirely (different facility id) — reuse the same day-window
    // oracle createBooking's FULL_ROOM branch uses, rather than relying on
    // same-facility interval checks that don't apply to this direction.
    if (fresh.facilityType === "FULL_ROOM") {
      const { dayStart, dayEnd } = dayBounds(calendarDayOf(fresh.startAt));
      const dayBlocked = await individualBookingExistsOnDay(tx, orgId, dayStart, dayEnd);
      if (dayBlocked) throw new Error("EXTENSION_BLOCKED_BY_NEXT_BOOKING");
    }

    // [SEC] The extended interval [fresh.endAt, proposedEnd) must not itself
    // overlap another active-like booking on the SAME facility (or a
    // FULL_ROOM booking, via the shared oracle) — the old code only checked
    // whether a booking STARTED within the 60-min gap AFTER proposedEnd,
    // missing a booking that starts strictly BEFORE proposedEnd (a genuine
    // overlap with the newly-claimed time, not merely a close-gap booking).
    const overlapsExtension = await facilityHasActiveOverlap(
      tx, orgId, fresh.facilityId, fresh.endAt, proposedEnd, fresh.id,
    );
    if (overlapsExtension) throw new Error("EXTENSION_BLOCKED_BY_NEXT_BOOKING");

    const gapEnd = new Date(proposedEnd.getTime() + EXTENSION_GAP_MS);
    const blocked = await hasBookingStartingWithinGap(tx, orgId, fresh.facilityId, proposedEnd, gapEnd, fresh.id);
    if (blocked) throw new Error("EXTENSION_BLOCKED_BY_NEXT_BOOKING");

    const deltaHours = cappedTotalHours - fresh.durationHours;
    const [member] = await tx
      .select({ membershipTier: appUsers.membershipTier })
      .from(appUsers)
      .where(and(eq(appUsers.id, fresh.userId), eq(appUsers.orgId, orgId)))
      .limit(1);
    const discounts = member
      ? await getTierDiscounts(orgId, member.membershipTier, tx)
      : { coworkingDiscountPct: 0, meetingDiscountPct: 0, cafeDiscountPct: 0, printDiscountPct: 0 };
    const discountPct = resolveDiscountPct(fresh.facilityType, discounts);
    const price = computeBookingPrice({ hours: deltaHours, ratePerHourRupiah: fresh.ratePerHourRupiah, discountPct });

    const [updated] = await tx
      .update(bookings)
      .set({
        endAt: proposedEnd,
        durationHours: cappedTotalHours,
        amountRupiah: fresh.amountRupiah + price.amountRupiah,
        baseAmountRupiah: fresh.baseAmountRupiah + price.baseAmountRupiah,
        discountRupiah: fresh.discountRupiah + price.discountRupiah,
        updatedAt: new Date(),
      })
      .where(and(eq(bookings.id, id), eq(bookings.orgId, orgId), eq(bookings.status, "ACTIVE")))
      .returning();
    if (!updated) throw new Error("INVALID_TRANSITION");

    await recordTransaction(
      {
        orgId,
        userId: fresh.userId,
        type: "BOOKING",
        description: `Extension ${fresh.facilityName}`,
        amountRupiah: price.amountRupiah,
        discountRupiah: price.discountRupiah,
        status: "PENDING",
        bookingId: fresh.id,
        paymentMethod: null,
      },
      tx,
    );

    return updated;
  });
}

// ---------------------------------------------------------------------------
// runStatusSweep [SEC] — authenticated/server-only entry point (FR-852)
// ---------------------------------------------------------------------------

export type StatusSweepResult = {
  activated: number;
  cancelled: number;
  /** [SEC] Stale unpaid PENDING/WAITING_CASHIER holds (>24h, never approved)
   *  auto-cancelled this run — closes the pending-hold DoS gap (an unpaid
   *  hold would otherwise pin a facility's inventory forever). */
  staleCancelled: number;
  /** Booking ids currently ACTIVE and past their end (flagged, never auto-completed — OBS-831/AC-839). */
  overtime: string[];
};

/**
 * One org's authenticated status sweep (OBS-829..831, FR-852). Single
 * transaction, four CAS-guarded steps in order (each only sees rows the
 * PRIOR step in this same run has not already transitioned):
 *  (a) paid CONFIRMED whose start has arrived → ACTIVE.
 *  (b) CONFIRMED (never activated) past its end → CANCELLED.
 *  (c) [SEC] stale PENDING/WAITING_CASHIER holds (created >24h ago, still
 *      never approved — that combo of status+paymentStatus IS "never
 *      approved": approvePayment/approveAndStartWalkIn always move a row
 *      OUT of it) → CANCELLED, freeing the inventory they were pinning.
 *  (d) ACTIVE past its end → reported in `overtime`, status NEVER changed
 *      (walk-ins have `end_at IS NULL` and are naturally excluded — they have
 *      no scheduled end to be "overdue" against).
 * The caller resolves `orgId` server-side (never client-supplied) and this
 * function itself performs no authentication — it is invoked ONLY from an
 * authenticated entry point (the sweep route, FR-852), never exposed directly.
 */
export async function runStatusSweep(orgId: string, now: Date): Promise<StatusSweepResult> {
  return db.transaction(async (tx) => {
    const activatedRows = await tx
      .update(bookings)
      .set({ status: "ACTIVE", updatedAt: now })
      .where(
        and(
          eq(bookings.orgId, orgId),
          eq(bookings.status, "CONFIRMED"),
          inArray(bookings.paymentStatus, ["PAID_ONLINE", "PAID_CASHIER"]),
          lte(bookings.startAt, now),
          // A CONFIRMED row whose end has ALSO already passed is expired, not
          // "at start" — it belongs to the cancel step below, not activation.
          or(isNull(bookings.endAt), gt(bookings.endAt, now)),
        ),
      )
      .returning({ id: bookings.id });

    const cancelledRows = await tx
      .update(bookings)
      .set({ status: "CANCELLED", updatedAt: now })
      .where(
        and(
          eq(bookings.orgId, orgId),
          eq(bookings.status, "CONFIRMED"),
          isNotNull(bookings.endAt),
          lt(bookings.endAt, now),
        ),
      )
      .returning({ id: bookings.id });

    const staleCancelledRows = await tx
      .update(bookings)
      .set({ status: "CANCELLED", updatedAt: now })
      .where(
        and(
          eq(bookings.orgId, orgId),
          eq(bookings.status, "PENDING"),
          eq(bookings.paymentStatus, "WAITING_CASHIER"),
          // [SEC][MONEY] Cancel only a hold that can no longer be honored —
          // NEVER purely by age. A scheduled hold's own booked start_at is
          // the real "can this still happen" signal: once it's passed
          // unpaid, the slot is gone regardless of how recently it was
          // created. A walk-in has no future slot to protect (its start_at
          // is set at creation, not a scheduled time), so age (>24h,
          // STALE_PENDING_HOLD_MS) is its only staleness signal. The old
          // rule used createdAt>24h for EVERY hold, including a legitimately
          // future-dated scheduled booking — real data loss.
          or(
            and(eq(bookings.bookingMode, "SCHEDULED"), lt(bookings.startAt, now)),
            and(
              eq(bookings.bookingMode, "WALKIN"),
              lt(bookings.createdAt, new Date(now.getTime() - STALE_PENDING_HOLD_MS)),
            ),
          ),
        ),
      )
      .returning({ id: bookings.id });

    const overtimeRows = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.orgId, orgId),
          eq(bookings.status, "ACTIVE"),
          isNotNull(bookings.endAt),
          lt(bookings.endAt, now),
        ),
      );

    return {
      activated: activatedRows.length,
      cancelled: cancelledRows.length,
      staleCancelled: staleCancelledRows.length,
      overtime: overtimeRows.map((r) => r.id),
    };
  });
}

// ---------------------------------------------------------------------------
// cancelBooking
// ---------------------------------------------------------------------------

/** Cancels a PENDING/CONFIRMED/ACTIVE booking (org-scoped; cross-org → NOT_FOUND). */
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
  if (!activeLikeStatuses().includes(booking.status)) throw new Error("INVALID_TRANSITION");

  const [updated] = await db
    .update(bookings)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(bookings.id, id),
        eq(bookings.orgId, orgId),
        inArray(bookings.status, activeLikeStatuses()),
      ),
    )
    .returning();
  if (!updated) throw new Error("INVALID_TRANSITION");
  return updated;
}

// ---------------------------------------------------------------------------
// Pending payments  [SEC][SoD] — ADMIN-only at the action layer
// ---------------------------------------------------------------------------

/** [SEC] Hard ceiling on `listPendingBookings`'s limit — a caller-supplied
 *  value above this is clamped, never honored as-is (pending-hold DoS,
 *  defense-in-depth alongside the soft `limit = 200` default below). */
const PENDING_BOOKINGS_HARD_LIMIT = 500;
/** Fallback used when the caller-supplied limit fails normalization (see
 *  `normalizePendingBookingsLimit`) — the same value as the function's own
 *  default parameter, kept as a named constant so both stay in sync. */
const PENDING_BOOKINGS_DEFAULT_LIMIT = 200;

/**
 * [SEC] Coerces a caller-supplied `limit` to a finite positive integer
 * within `PENDING_BOOKINGS_HARD_LIMIT` — `Math.min(limit, 500)` ALONE does
 * not validate its input: `Math.min(-1, 500) === -1` and
 * `Math.min(NaN, 500) === NaN`, and Drizzle OMITS the SQL `LIMIT` clause
 * entirely for a negative or non-finite value, bypassing the cap outright
 * (an unbounded query — exactly the DoS the cap exists to prevent). Any
 * limit that isn't a finite number > 0 falls back to the safe default,
 * BEFORE the 500 clamp is ever applied.
 */
function normalizePendingBookingsLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return PENDING_BOOKINGS_DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), PENDING_BOOKINGS_HARD_LIMIT);
}

/**
 * Admin pending-payments surface: PENDING bookings still WAITING_CASHIER —
 * a fresh walk-in awaiting cashier start, or a scheduled cashier booking
 * awaiting settlement. Newest first; org-scoped (cross-org rows never match).
 * [SEC] Bounded (LIMIT) — a flood of unpaid PENDING holds must never make
 * this read set unbounded (pending-hold DoS, defense-in-depth alongside the
 * createBooking duration/horizon bound and the sweep's stale-hold cancel).
 * The soft `limit` default is caller-adjustable but normalized+hard-clamped
 * at `PENDING_BOOKINGS_HARD_LIMIT` (see `normalizePendingBookingsLimit`) — a
 * caller can shrink the page, never grow it past the ceiling, and an
 * invalid value (negative/zero/NaN) can never omit the LIMIT clause outright.
 */
export function listPendingBookings(
  orgId: string,
  limit: number = PENDING_BOOKINGS_DEFAULT_LIMIT,
): Promise<Booking[]> {
  return db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        eq(bookings.status, "PENDING"),
        eq(bookings.paymentStatus, "WAITING_CASHIER"),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(normalizePendingBookingsLimit(limit));
}
