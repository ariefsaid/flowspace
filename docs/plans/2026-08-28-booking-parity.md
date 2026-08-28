# Plan — Booking parity overhaul · I-040 (flagship) · 2026-08-28

Spec: `docs/specs/0007-booking-parity.spec.md` (signed off). Migrations claimed: **0011 and 0012** (0010 is
I-041's — **I-041 merges FIRST**; tasks that consume `coworking_discount_pct` / `meeting_discount_pct` /
`getTierDiscounts`' 4-dim return are marked **[AFTER-I-041-MERGE]`**). No ADR — no irreversible decision beyond
what the spec locks.

---

## Design

### Locking / race-safety decision (deliberate, reversible — no ADR)

The spec's migration-note item 2 offers a choice: a GiST/exclusion constraint **or** an org/day advisory-lock
fallback. **We pick advisory-lock serialization as the authoritative mechanism** and deliberately omit a hard
exclusion constraint, because:

1. **AC-804 / AC-810 require overlapping active-like rows to exist** to assert availability (three statuses
   blocking the same facility). A real `EXCLUDE` on `(facility_id, tstzrange(start,end)) WHERE status IN
   (PENDING,CONFIRMED,ACTIVE)` would make it impossible to seed those fixtures — the test is the oracle and
   must stay constructible. An advisory lock does not block row representation.
2. **ACTIVE walk-ins have `end_at = NULL`** (open-ended until checkout, OBS-841/FR-854). In a GiST range a NULL
   upper bound means `+infinity`, so a walk-in on a seat would exclude every future booking on it forever,
   which is wrong (walk-ins arbitrate against real bookings via the lock + overlap check, not by brute
   exclusion).
3. The syndicated single-writer path is `createBooking`/`extendBooking` — both take the advisory lock in the
   *same transaction* as the overlap check + insert/update. This satisfies **FR-850/FR-851** ("perform the
   overlap check and insert/update in one transaction … a database … locking constraint shall reject …") and
   the race ACs **AC-815 / AC-816 / AC-836**. RLS + server-authority remain the tenancy backstop, so there is no
   supported path that bypasses the lock.

Lock key: `pg_advisory_xact_lock` on two 64-bit halves derived from `hashtext(org_id || ':' || calendar_day)`
for the full-room/individual-seat exclusivity, and `hashtext(org_id || ':' || facility_id)` for same-facility
overlap checks. Cross-facility full-room exclusivity (FR-851, AC-805/806/816) serializes on the **org-day** key;
same-facility seat/room overlap (FR-850, AC-815) serializes on the **org-facility** key.

Half-open semantics live in ONE pure function `intervalsOverlap` (`lib/booking/interval.ts`) consumed by the
availability read model, the creation conflict check, and the extension 60-minute guard — so **AC-848**
("availability semantics match creation conflict semantics") holds by construction.

### Schema (migration 0011)

- `BookingStatus` gains `CONFIRMED`; `FacilityType` gains `FULL_ROOM`; new enums `BookingMode
  (SCHEDULED|WALKIN)` and `BookingPaymentMethod (time_credits|online|cashier)`.
- `bookings` gains `booking_mode`, `base_amount_rupiah`, `discount_rupiah`, `payment_method`; status default
  flips **ACTIVE→PENDING**; a CHECK enforces `booking_mode='WALKIN' OR facility_id IS NOT NULL`; money CHECK
  widened for the two new snapshot columns; index `(org_id, facility_id, status, start_at, end_at)`.
- `facilities` gains `capacity`, `seat_label`, `zone`, `max_hours_cap` (all nullable).
- New `time_credit_lots(org_id, user_id, package_id, purchase_transaction_id, total_hours, remaining_hours,
  purchased_at, expires_at, created_at, updated_at)` with org/user/expiry indexes, a non-negativity CHECK, and
  the `_org_isolation` RLS backstop (copied from `0006_domain_verticals.sql`).
- `transactions.payment_method` (settlement detail `cash|qris|time_credits|online`, loose text + CHECK).

### Migration 0012 — idempotent seed

The 23-facility catalog (OBS-800..803) + the four package amounts (OBS-826) are seeded idempotently into the
seeded org (slug `flowspace`) so `supabase db reset` alone yields a bookable catalog; `scripts/seed-supabase.ts`
is widened to the same 23 rows + new columns (and a transitional 90-day lot for any legacy `app_users.time_credits`
aggregate — spec delta 4).

### Repositories / actions contract (`lib/db/bookings.ts`)

`listFacilities`, availability reads, `createBooking(paymentMethod)`, `approveAndStartWalkIn`,
`approvePayment` (scheduled settlement PENDING→CONFIRMED), `extendBooking`, `previewCheckout`,
`checkoutBooking(paymentMethod)`, `runStatusSweep`. Pure math extracted to `lib/booking/pricing.ts` and
`lib/booking/interval.ts`; FIFO credit spend to `lib/db/time-credit-lots.ts`; `purchasePackage`
(`lib/db/packages.ts`) rewired to create a lot instead of only bumping the aggregate.

All money paths accept a Drizzle `tx` context so they enlist in the caller's transaction (FR-853/856/857).
Every read/write is org-scoped and role-rechecked in action; extensions/create/checkout are compare-and-set
guarded (FR-858). `app_users.time_credits` becomes a derived cache of non-expired `remaining_hours`,
recomputed in the same transaction after every purchase/spend — never the authority (FR-853).

### Status sweep seam (FR-852)

`app/api/cron/booking-status-sweep/route.ts` requires `Authorization: Bearer $BOOKING_SWEEP_SECRET` and rejects
public/GET-without-credential with 401 before any write (AC-837). `middleware.ts` releases `/api/cron/*` from the
edge role-gate (the route does its own credential auth), leaving server-only invocation of `runStatusSweep(orgId,
now)` as the in-process path. Provider scheduling (vercel cron / external) is deployment config wired to that
route + secret.

### Superseded behavior

Spec-0004 booking ACs (AC-130..135, AC-ADM-*, AC-200 aggregate semantics, AC-143..145) are superseded; existing
integration tests in `lib/db/bookings.int.test.ts` and `lib/db/admin.int.test.ts` must be migrated to the new
lifecycle (scheduled `PENDING→CONFIRMED→ACTIVE→…`, walk-in `PENDING→ACTIVE→…`, no client status). `completeBooking`
is replaced by `checkoutBooking`.

---

## Tasks

### PHASE 1 — Migration 0011 + schema mirror

**Task 1 — Red migration/integration test for the new schema shape**
`lib/db/booking-schema.int.test.ts` (new). Failing `AC-846`/`AC-800`-prefix fixtures: after `supabase db reset`,
`bookings` has `booking_mode`/`base_amount_rupiah`/`discount_rupiah`/`payment_method`, `BookingStatus` contains
`CONFIRMED`, `FacilityType` contains `FULL_ROOM`, `facilities` has `capacity`/`seat_label`/`zone`/
`max_hours_cap`, `time_credit_lots` exists with its CHECKs, and `transactions.payment_method` exists. Direct
`db.execute` inserting a negative `time_credit_lots.remaining_hours` is rejected by the CHECK; and a scheduled
row with `facility_id IS NULL` is rejected.
Verify (red): `pnpm exec supabase db reset && pnpm test:int -- 'lib/db/booking-schema.int.test.ts'`.

**Task 2 — Migration 0011 DDL**
`supabase/migrations/0011_booking_parity.sql`:
```sql
ALTER TYPE "public"."BookingStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "public"."FacilityType" ADD VALUE 'FULL_ROOM';
CREATE TYPE "public"."BookingMode" AS ENUM ('SCHEDULED','WALKIN');
CREATE TYPE "public"."BookingPaymentMethod" AS ENUM ('time_credits','online','cashier');

ALTER TABLE "bookings"
  ADD COLUMN "booking_mode" "BookingMode" NOT NULL DEFAULT 'WALKIN',
  ADD COLUMN "base_amount_rupiah" integer NOT NULL DEFAULT 0,
  ADD COLUMN "discount_rupiah" integer NOT NULL DEFAULT 0,
  ADD COLUMN "payment_method" "BookingPaymentMethod";
UPDATE "bookings" SET "booking_mode" = CASE
  WHEN "facility_type" IN ('COWORKING_SEAT','MEETING_ROOM') THEN 'SCHEDULED' ELSE 'WALKIN' END;
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_mode_facility" CHECK ("booking_mode"='WALKIN' OR "facility_id" IS NOT NULL);
DROP CONSTRAINT IF EXISTS "bookings_money_duration";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_money_duration" CHECK (
  "rate_per_hour_rupiah" >= 0 AND "amount_rupiah" >= 0
  AND "base_amount_rupiah" >= 0 AND "discount_rupiah" >= 0
  AND ("duration_hours" IS NULL OR "duration_hours" >= 0)
);
CREATE INDEX "bookings_org_facility_status_time_idx" ON "bookings" USING btree ("org_id","facility_id","status","start_at","end_at");

ALTER TABLE "facilities"
  ADD COLUMN "capacity" integer,
  ADD COLUMN "seat_label" text,
  ADD COLUMN "zone" text,
  ADD COLUMN "max_hours_cap" integer;
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_capacity_nonneg" CHECK ("capacity" IS NULL OR "capacity" > 0);

ALTER TABLE "transactions" ADD COLUMN "payment_method" text;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_method_known" CHECK (
  "payment_method" IS NULL OR "payment_method" IN ('cash','qris','time_credits','online')
);

CREATE TABLE "time_credit_lots" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "public"."app_users"("id") ON DELETE cascade,
  "package_id" text REFERENCES "public"."time_credit_packages"("id") ON DELETE set null,
  "purchase_transaction_id" text REFERENCES "public"."transactions"("id") ON DELETE set null,
  "total_hours" integer NOT NULL,
  "remaining_hours" integer NOT NULL,
  "purchased_at" timestamp (3) DEFAULT now() NOT NULL,
  "expires_at" timestamp (3) NOT NULL,
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL
);
ALTER TABLE "time_credit_lots" ADD CONSTRAINT "time_credit_lots_remaining" CHECK ("total_hours" > 0 AND "remaining_hours" >= 0 AND "remaining_hours" <= "total_hours");
CREATE INDEX "time_credit_lots_org_id_idx" ON "time_credit_lots" USING btree ("org_id");
CREATE INDEX "time_credit_lots_org_user_expires_idx" ON "time_credit_lots" USING btree ("org_id","user_id","expires_at");
CREATE INDEX "time_credit_lots_user_expires_idx" ON "time_credit_lots" USING btree ("user_id","expires_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "time_credit_lots" TO authenticated;
ALTER TABLE "time_credit_lots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_credit_lots_org_isolation" ON "time_credit_lots" FOR ALL TO authenticated
  USING ("org_id" = current_org()) WITH CHECK ("org_id" = current_org());
```
Verify: `pnpm exec supabase db reset && pnpm test:int -- 'lib/db/booking-schema.int.test.ts'` (green).

**Task 3 — Drizzle schema mirror + enum module**
`lib/db/schema.ts`: add `bookingModeEnum`, `bookingPaymentMethodEnum`; extend `bookings` with `bookingMode`
(`bookingModeEnum("booking_mode").notNull().default("WALKIN")`), `baseAmountRupiah`, `discountRupiah`,
`paymentMethod` (`bookingPaymentMethodEnum("payment_method")`, nullable); add the four `facilities` columns
(`capacity` int, `seatLabel` text, `zone` text, `maxHoursCap` int); add `timeCreditLots` pgTable + `TimeCreditLot`
type; add `paymentMethod: text("payment_method")` to `transactions`; extend `bookingStatusEnum` and
`facilityTypeEnum` with `"CONFIRMED"` / `"FULL_ROOM"`. `lib/db/enums.ts`: add `"CONFIRMED"` to `BOOKING_STATUSES`,
add `"FULL_ROOM"` to `FACILITY_TYPES`, add `BOOKING_MODES`, `BOOKING_PAYMENT_METHODS`.
Verify: `pnpm typecheck && pnpm test:unit -- 'lib/db/schema.test.ts'`.

### PHASE 2 — Facilities seed

**Task 4 — Migration 0012: idempotent facilities + packages seed**
`supabase/migrations/0012_booking_seed.sql` seeds the 23 facilities (OBS-800..803) + the 4 packages (OBS-826)
into the org with slug `flowspace`, idempotent via `ON CONFLICT (id) DO NOTHING` using deterministic ids
`` `${org_id}__fac-${slug}` `` / `` `${org_id}__pkg-${slug}` `` derived from the org row:
```sql
INSERT INTO "facilities" ("id","org_id","name","type","rate_per_hour_rupiah","capacity","seat_label","zone","max_hours_cap","available")
SELECT o."id" || '__fac-meja-a', o."id", 'Meja A','COWORKING_SEAT',25000,1,'A','DESK',4,true FROM "public"."organizations" o WHERE o."slug"='flowspace'
ON CONFLICT ("id") DO NOTHING;
-- ... repeat for Meja B..L (25000, zone DESK, cap 4), Counter 1..8 (20000, zone COUNTER, cap 4, seat_label '1'..'8'),
-- Meeting Room A (150000, capacity 10, zone MEETING), Meeting Room B (120000, capacity 8, zone MEETING),
-- Full Room Event (FULL_ROOM, 350000, capacity 20, zone FULL_ROOM)
-- the 4 packages: 5H/75000, 10H/140000, 20H/260000, 50H/600000 with price_per_hour 15000/14000/13000/12000
```
(The full 27-row literal is expanded in the file; the pattern is exactly as above.) Verify:
`pnpm exec supabase db reset && pnpm test:int -- 'lib/db/facilities-seed.int.test.ts'` (red first in Task 5).

**Task 5 — Red + green AC-800 facilities-seed test**
`lib/db/facilities-seed.int.test.ts`: seed via the SQL `0012` (or a local catalog mirroring OBS-800..803 for the
test org), then assert exactly 23 rows and exact rates/capacities/zones/labels/caps (desks 25k, counters 20k,
Meeting A 150k cap10, Meeting B 120k cap8, Full Room 350k cap20 zone FULL_ROOM), and that org B's identical query
returns none (org isolation). Verify: `pnpm test:int -- 'lib/db/facilities-seed.int.test.ts'`.

**Task 6 — Widen `scripts/seed-supabase.ts` catalog**
Replace `FACILITIES`/`PACKAGES` literals with the 23-row catalog + new columns (`capacity`, `seatLabel`, `zone`,
`maxHoursCap`, type `FULL_ROOM` for the event room); extend the facility insert to include the new columns. After
seeding users, if a member has `timeCredits > 0` and no `time_credit_lots` rows, insert one transitional lot
(`total=remaining=timeCredits`, `expires_at = now()+90d`, `package_id null`). Verify:
`pnpm exec supabase db reset && pnpm db:seed:supabase && pnpm test:int` (existing suite stays green).

### PHASE 3 — Time-credit lots repo + purchase rewire

**Task 7 — Red unit test for FIFO lot selection**
`lib/db/time-credit-lots.test.ts` (new, repo/DB mocked via `vi.mock`): pure-selection helper
`selectLotsToSpend(lots, hours)` returns the oldest-expiring-first subset, skips expired/empty, and throws
`INSUFFICIENT_CREDITS` when the remaining total is short. Verify: `pnpm test:unit -- 'lib/db/time-credit-lots.test.ts'` (red).

**Task 8 — `lib/db/time-credit-lots.ts` repository**
```ts
export async function spendTimeCredits(opts: {
  orgId: string; userId: string; hours: number;
  tx: Pick<typeof db, "select"|"update">;
}): Promise<void> {
  // SELECT lots WHERE org+user AND remaining_hours>0 ORDER BY expires_at ASC FOR UPDATE (row locks → AC-825)
  // prune expired (expires_at <= now) by setting remaining 0; selectLotsToSpend; decrement each lot's
  // remaining_hours (setting empty lots to 0) via tx.update; then recompute the derived cache.
}
export async function recomputeCreditCache(opts: { orgId: string; userId: string;
  tx: Pick<typeof db, "update"|"select"> }): Promise<number> // sets app_users.time_credits = SUM(remaining_hours) of non-expired lots; returns value
export function listLots(orgId: string, userId: string): Promise<TimeCreditLot[]>
```
All writes go through the passed `tx`. `spendTimeCredits` throws `INSUFFICIENT_CREDITS` before any decrement when
short. Verify: `pnpm typecheck && pnpm test:unit -- 'lib/db/time-credit-lots.test.ts'` (green).

**Task 9 — Rewire `purchasePackage` to create a lot**
`lib/db/packages.ts`: in `purchasePackage`'s transaction, after inserting the `PACKAGE_PURCHASE` ledger row, insert
a `time_credit_lots` row (`total=remaining=pkg.hours`, `expires_at = new Date(Date.now()+90*864e5)`,
`package_id`, `purchase_transaction_id = txn.id`), then call `recomputeCreditCache` on `tx` and return its value.
Keep the `sql` increment removed (cache is now derived). Extend `lib/db/packages.int.test.ts`: AC-826 asserts the
lot expires exactly +90 days, the derived balance increases by `pkg.hours`, and `app_users.time_credits` equals the
non-expired remaining sum. Verify: `pnpm test:int -- 'lib/db/packages.int.test.ts'`.

**Task 10 — Lot + spend integration contract (FIFO, insufficient, concurrency)**
`lib/db/time-credit-lots.int.test.ts` (new): AC-824 (two lots far/soon expiry + an expired lot → spend consumes
the soonest first, skips expired), AC-823 (spend > available → throws, no lot/balance/bookings/ledger change),
AC-825 (two concurrent `spendTimeCredits` where combined demand exceeds supply → exactly one succeeds, the other
rolls back, cache never negative), AC-846 cross-org lots invisible/untouchable. Verify:
`pnpm test:int -- 'lib/db/time-credit-lots.int.test.ts'`.

### PHASE 4 — Math, availability, overlap/exclusivity

**Task 11 — Pure pricing + interval helpers (red)**
`lib/booking/pricing.ts`:
```ts
export function computeBookingPrice(o: { hours: number; ratePerHourRupiah: number; discountPct: number }) {
  const baseAmountRupiah = o.hours * o.ratePerHourRupiah;
  const discountRupiah = Math.round((baseAmountRupiah * o.discountPct) / 100);
  return { baseAmountRupiah, discountRupiah, amountRupiah: baseAmountRupiah - discountRupiah };
}
export function computeWalkinBilledHours(elapsedMs: number, maxHours: number): number {
  return Math.min(Math.max(Math.ceil(elapsedMs / 3_600_000), 1), maxHours);
}
```
`lib/booking/interval.ts`:
```ts
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime(); // half-open [ , )
}
```
Failing unit tests in `lib/booking/pricing.test.ts` (`AC-814`, `AC-812`, `AC-844`) and `lib/booking/interval.test.ts`
(`AC-848` boundary semantics at the write/create level). Verify (red): `pnpm test:unit -- 'lib/booking/pricing.test.ts lib/booking/interval.test.ts'`.

**Task 12 — Availability read model**
`lib/db/bookings.ts`: add
```ts
export function activeLikeStatuses(): BookingStatus[] { return ["PENDING","CONFIRMED","ACTIVE"]; }
export async function facilitiesAvailableInWindow(orgId: string, start: Date, end: Date): Promise<Facility[]>
export async function getFacilityAvailability(orgId: string, facilityId: string, start: Date, end: Date): Promise<boolean> {
  // org-scoped SELECT count(1) on bookings WHERE facility_id AND status IN active-like
  //   AND intervalsOverlap(start,end,start_at,end_at) [end_at null counts as +inf → overlaps]
  //   — implemented with a raw tstzrange overlap or a JS post-filter over the org's window rows.
}
export async function getFullRoomAvailability(orgId: string, dayStart: Date, dayEnd: Date): Promise<boolean>
```
`getFullRoomAvailability` is true only when **no** individual-seat booking exists on that calendar day (FR-851,
AC-805); `getFacilityAvailability` for individual seats considers active-like rows (AC-804). Green unit/integration:
extend `lib/db/bookings.int.test.ts` with `AC-804`/`AC-805`/`AC-806` under engine:
- AC-804: three non-overlapping rows on seat A (PENDING [8-9], CONFIRMED [10-11], ACTIVE [12-13]) each mark an
  overlapping query window occupied.
- AC-805: an individual booking on day D → `getFullRoomAvailability(D)` false.
- AC-806: seed a FULL_ROOM facility; a member books it online at its 350k rate; then every individual seat's
  window availability for that interval is false.
Verify: `pnpm test:int -- 'lib/db/bookings.int.test.ts'`.

### PHASE 5 — createBooking (3 payment methods) + walk-in PENDING

**Task 13 — Red lifecycle + creation contract tests**
Extend `lib/db/bookings.int.test.ts` first (migrate superseded AC-130..135 fixtures to the new lifecycle):
- `AC-808` online scheduled → `CONFIRMED`/`PAID_ONLINE`, `booking_mode SCHEDULED`, server-priced discounted
  amount, ledger COMPLETED.
- `AC-809` cashier scheduled → `PENDING`/`WAITING_CASHIER`, ledger PENDING.
- `AC-810` walk-in → `PENDING`/`WAITING_CASHIER`, `end_at` null, booking_mode WALKIN.
- `AC-807` legal transitions only; `AC-845` invalid transitions rejected.
- `AC-815` two concurrent creates for one window → at most one succeeds (advisory-lock serialized);
  `AC-816` full-room + seat race on a day → at most one exclusivity class.
- `AC-834` cross-org facility/user create rejected before any write; `AC-833` org-scoped reads.
Verify (red): `pnpm test:int -- 'lib/db/bookings.int.test.ts'`.

**Task 14 — Rewrite `createBooking`**
`lib/db/bookings.ts`:
```ts
export type BookingPaymentChoice = "online" | "time_credits" | "cashier";
export type CreateBookingInput = {
  orgId: string; userId: string; tier: MembershipTier;
  facilityType: BookingFacilityType; facilityId?: string | null; facilityName: string;
  startAt?: Date; endAt?: Date; paymentMethod: BookingPaymentChoice;
};
```
Scheduled: resolve facility in-org (rate = row); derive `durationHours = ceil((end-start)/HOUR_MS)`; price via
`computeBookingPrice({hours, rate, discountPct})` where `discountPct` comes from **[AFTER-I-041-MERGE]**
`getTierDiscounts(orgId, tier)` → `.coworkingDiscountPct` (COWORKING_SEAT) / `.meetingDiscountPct` (MEETING_ROOM)
else 0 (AC-827 fail-safe). Status/payment by method: `online`→CONFIRMED/PAID_ONLINE ledger COMPLETED;
`time_credits`→CONFIRMED/PAID_ONLINE ledger COMPLETED + `spendTimeCredits(tx)` (throws → txn rolls back, AC-823);
`cashier`→PENDING/WAITING_CASHIER ledger PENDING. Walk-in: **always** PENDING/WAITING_CASHIER, `end_at` null,
`booking_mode WALKIN`, facility_id null, ledger PENDING (AC-810). In the transaction: take
`pg_advisory_xact_lock(hashtext(org+"|"+day))` for FULL_ROOM and `pg_advisory_xact_lock(hashtext(org+"|"+facilityId))`
otherwise; re-run `intervalsOverlap` against active-like rows; insert booking + `recordTransaction` (with
`payment_method` on the ledger row) atomically. Set `start_at` for walk-in to now (transient; overwritten at
approval per FR-854). Verify: `pnpm test:int -- 'lib/db/bookings.int.test.ts'` (green) and `pnpm typecheck`.

**Task 15 — Member booking server action (payment choice)**
`app/(member)/booking/actions.ts`: `createBookingAction` accepts a `paymentMethod: BookingPaymentChoice`, resolves
`requireSession()`, passes `tier` (`user` → profile tier via `findById` or an `app_users` read), schedules
FULL_ROOM booking **online** (OBS-812 / FR: full-room IS online-bookable per 04f5a69 — remove the
`FULL_ROOM_NOT_BOOKABLE_ONLINE` throw) at its catalog rate, and dispatches all five choices. Scheduled walk-in /
cashier paths set the right method. Verify: `pnpm typecheck`.

### PHASE 6 — approve-and-start / extend / previewCheckout / checkout / sweep

**Task 16 — Red transitions + checkout + extension + sweep contract tests**
Extend `lib/db/bookings.int.test.ts`:
- `AC-811`/`AC-847` approve-and-start: PENDING walk-in → ACTIVE, `start_at`=approval time, `end_at` null, no +24h.
- `AC-812`/`AC-844` previewCheckout on a 62-min capped walk-in → `ceil(62/60)=2`, capped at 4 for >4h.
- `AC-813` scheduled ACTIVE checkout → billed = booked duration regardless of elapsed.
- `AC-820`/`AC-821` checkout cash/qris → COMPLETED/PAID_CASHIER, ledger settled (payment_method cash/qris), real
  booking FK ledger row included in completed revenue (AC-828).
- `AC-822` checkout credits → FIFO-debit + COMPLETED/PAID_ONLINE atomic.
- `AC-817`/`AC-819` extension guard: non-ACTIVE rejected; <60-min next booking or >4h total → rejected unchanged.
- `AC-818` extension ≤4h + 60-min gap → end/duration update + a separate PENDING extension ledger row, atomic.
- `AC-836` concurrent CAS: loser gets a transition error, no state/ledger mutation.
- `AC-838`/`AC-839` sweep: paid CONFIRMED at start → ACTIVE; CONFIRMED past end unactivated → CANCELLED; overdue
  ACTIVE reported overtime, stays ACTIVE across repeated sweeps.
Verify (red): `pnpm test:int -- 'lib/db/bookings.int.test.ts'`.

**Task 17 — `approveAndStartWalkIn`, `approvePayment` (scheduled settlement)**
`lib/db/bookings.ts`:
```ts
export async function approveAndStartWalkIn(orgId: string, id: string): Promise<Booking> // PENDING+WAITING_CASHIER
  // → ACTIVE, start_at=now, end_at stays null, CAS on status='PENDING'; ledger remains PENDING
export async function approvePayment(orgId: string, id: string): Promise<Booking> // PENDING+WAITING_CASHIER scheduled
  // → status CONFIRMED, payment PAID_CASHIER, ledger COMPLETED; CAS on status='PENDING'
```
Both take the `(org,facility)` advisory lock, resolve the row in-org (`NOT_FOUND` cross-org, FR-855). Verify:
`pnpm test:int -- 'lib/db/bookings.int.test.ts'`.

**Task 18 — `previewCheckout` + `checkoutBooking`**
```ts
export type CheckoutPrice = { baseAmountRupiah: number; discountRupiah: number; amountRupiah: number;
  billedHours: number; maxHours: number };
export async function previewCheckout(orgId: string, id: string): Promise<CheckoutPrice>
export async function checkoutBooking(orgId: string, id: string, paymentMethod: "cash"|"qris"|"time_credits"): Promise<Booking>
```
`previewCheckout` resolves a non-COMPLETED booking in-org, computes `billedHours` (walk-in `computeWalkinBilledHours`
then unit-verify AC-812/844; scheduled = `durationHours`, AC-813), re-runs `computeBookingPrice` with the member
tier discount (discount frozen for cache is the ORIG behavior; here recompute against current tier config). For
`checkoutBooking`, inside one transaction under the advisory lock: CAS on `status='ACTIVE'` (else INVALID_TRANSITION,
AC-845/836), set `end_at=now` (walk-in) / keep (scheduled), `duration_hours`, `amount/base/discount`, status
`COMPLETED`; payment by method — `cash`/`qris` → `PAID_CASHIER`, `time_credits` → `spendTimeCredits(tx)` +
`PAID_ONLINE`; settle the linked BOOKING ledger row via `updateBookingTransaction({amount, status:COMPLETED,
payment_method})`; if `time_credits` short → whole txn rolls back (AC-823). Verify:
`pnpm test:int -- 'lib/db/bookings.int.test.ts'`.

**Task 19 — `extendBooking`**
```ts
export async function extendBooking(orgId: string, id: string, extraHours: number): Promise<Booking>
```
In one transaction under the lock: resolve ACTIVE scheduled (AC-819 else reject); `proposedEnd = startAt +
(Math.min(durationHours + extraHours, 4))*HOUR_MS` (cap 4, AC-818/AC-822-part); reject if
`proposedEnd - endAt <= 0`; check no future active-like booking on the same facility starts within 60 min after
`proposedEnd` (AC-817: `start_at >= proposedEnd && start_at < proposedEnd+60min` → reject). Set `end_at`,
`duration_hours`, recompute `amount/base/discount` for the delta and **insert a new PENDING BOOKING ledger row**
scoped to this booking (OBS-823/AC-818) capturing the extension charge; CAS on ACTIVE. Verify:
`pnpm test:int -- 'lib/db/bookings.int.test.ts'`.

**Task 20 — `runStatusSweep` repo**
```ts
export async function runStatusSweep(orgId: string, now: Date): Promise<{
  activated: number; cancelled: number; overtime: number[];
}>
```
Single org scope (FR-852). In one transaction: (a) CONFIRMED paid `start_at <= now` → ACTIVE (AC-829/838);
(b) CONFIRMED (unactivated) `end_at < now` → CANCELLED (AC-830/838); (c) ACTIVE `end_at < now` → count into
`overtime` and **do not** change status (AC-831/839). All updates CAS on source state (FR-858). Verify:
`pnpm test:int -- 'lib/db/bookings.int.test.ts'`.

**Task 21 — Admin actions rewire**
`app/(admin)/admin/bookings/actions.ts`: replace `completeBookingAction(bookingId)` with
`checkoutBookingAction(bookingId, paymentMethod)` (ADMIN gate, `FORBIDDEN` before write) → `checkoutBooking`.
`app/(admin)/admin/pending/actions.ts`: `approveAndStartWalkInAction(bookingId)` (ADMIN) → `approveAndStartWalkIn`;
keep `approvePaymentAction` (ADMIN) → `approvePayment` (now scheduled settlement). Extend `lib/admin/authz.ts` with
test seams `checkoutBookingAsActor`, `approveAndStartWalkInAsActor` mirroring the existing pattern. `lib/db/admin.int.test.ts`:
update superseded SoD tests; add `AC-835` (non-ADMIN approve/start/checkout/sweep → FORBIDDEN, no write) and
`AC-836` already at repo. Verify: `pnpm test:int -- 'lib/db/admin.int.test.ts' && pnpm test:unit -- 'lib/admin/authz.test.ts'`.

### PHASE 7 — [UI] member wizard + floor plan (server-driven)

**Task 22 — Red RTL wizard-shell test**
`app/(member)/booking/BookingClient.test.tsx`: `AC-801` four labeled steps (`Tipe`,`Waktu`,`Pilih
Tempat`,`Konfirmasi`) and five choices present; `AC-842` a server-action failure shows an inline error and **no**
success. Rework the existing test to the new props (server facilities + availability + time-credit balance).
Verify (red): `pnpm test:unit -- 'app/(member)/booking/BookingClient.test.tsx'`.

**Task 23 — Red RTL duration test**
`components/member/booking/Step2Time.test.tsx` (new): `AC-802` scheduled only accepts 1–8h and end = start +
duration; walk-in accepts the 1–4h estimate list. Verify (red): `pnpm test:unit -- 'components/member/booking/Step2Time.test.tsx'`.

**Task 24 — Server-driven floor plan component + red RTL**
`components/member/booking/FloorPlan.tsx` (new): consumes `FacilitySeat[]` props (`{id, label, seatLabel, zone,
status:'available'|'occupied'|'selected', ratePerHourRupiah}`) from the server availability read model — **no
hardcoded seat catalog** (AC-843). Renders desk labels A–L + counters 1–8 with available/occupied/selected states
(AC-803, AC-809-reuse). New `FloorPlan.test.tsx`: `AC-803` click an available seat selects it, an occupied seat
cannot be selected; `AC-843` asserts it imports/renders only the passed facility props and no hardcoded `Meja X`
array. Verify (red): `pnpm test:unit -- 'components/member/booking/FloorPlan.test.tsx'`.

**Task 25 — Wire the wizard + page/server availability**
`app/(member)/booking/page.tsx`: load server `listFacilities` + `facilitiesAvailableInWindow` (or a per-selection
`getFacilityAvailability` via the action) and pass `FacilitySeat[]` + member `timeCredits` to
`BookingClient`; include a `confirmAllowed` flag for policy acceptance. `BookingClient.tsx`: replace the local
`Step3Place` hardcoded use with `FloorPlan`; add a payment-method picker (online / time credits / cashier) and a
**policy-acceptance checkbox** gating the confirm button (required for AC-849). Keep DESIGN.md tokens (teal/slate/
orange), keyboard focus, and the existing inline-error surface. `Step4Confirm.tsx`: consume server-priced estimate +
discount instead of the hardcoded `TYPE_META` rates; show honest success (created booking status/payment) vs error.
`Step2Time.tsx`: bound scheduled duration to 1–8 and derive `end` (not just start+duration for the meeting/walk-in
cases). Verify: `pnpm test:unit -- 'app/(member)/booking/BookingClient.test.tsx components/member/booking/Step2Time.test.tsx components/member/booking/FloorPlan.test.tsx' && pnpm typecheck`.

### PHASE 8 — [UI] dashboard session panel

**Task 26 — Red RTL session-panel tests**
`components/member/SessionPanel.test.tsx` (new, replaces/extend ActiveSessionCard coverage):
- `AC-829` scheduled ACTIVE near end → countdown + ≤15-min extension banner.
- `AC-830` ACTIVE past end → red overtime warning, **no** completion action.
- `AC-831` ACTIVE walk-in → timer counts up, provisional cost capped + rounded hourly (reuse `computeWalkinBilledHours`).
Verify (red): `pnpm test:unit -- 'components/member/SessionPanel.test.tsx'`.

**Task 27 — Session panel component + extension action**
`components/member/SessionPanel.tsx`: renders countdown w/ progress, the ≤15-min extension affordance (calls
`extendBookingAction` server action), overtime red banner (no auto-complete), and the walk-in live cost/timer.
`lib/db/bookings.ts` exposes `getActiveBooking` already; add `app/(member)/dashboard/actions.ts`:
`extendBookingAction(bookingId, extraHours)` → `requireSession()` + repo (re-check role not needed — member-owned),
`checkoutNotify` not member-facing. `components/member/ActiveSessionCard.tsx` is delegated/replaced by
`SessionPanel`. Wire `app/(member)/dashboard/DashboardClient.tsx` + `page.tsx` to pass the richer scheduled session
view (startAt/endAt/status/bookingMode) for both walk-in and scheduled ACTIVE states. Verify:
`pnpm test:unit -- 'components/member/SessionPanel.test.tsx' && pnpm typecheck`.

### PHASE 9 — [UI] admin pending + bookings surfaces

**Task 28 — Red RTL admin pending test**
`app/(admin)/admin/pending/PendingClient.test.tsx`: `AC-840` walk-in PENDING rows show a distinct
"Mulai Sesi (Walk-in)" approve-and-start affordance vs scheduled "Approve Pembayaran"; after a success the list
refreshes and the row leaves. Import `approveAndStartWalkInAction`/`approvePaymentAction`. Verify (red):
`pnpm test:unit -- 'app/(admin)/admin/pending/PendingClient.test.tsx'`.

**Task 29 — Red RTL admin bookings test**
`app/(admin)/admin/bookings/BookingsClient.test.tsx`: `AC-841` Pending/Confirmed/Active counts reflect rows, and an
ACTIVE row shows a checkout action (opens a cash/QRIS/credits settlement affordance). Verify (red):
`pnpm test:unit -- 'app/(admin)/admin/bookings/BookingsClient.test.tsx'`.

**Task 30 — Admin pages + clients**
`app/(admin)/admin/pending/PendingClient.tsx`: split the two approval affordances by `bookingMode` (walk-in →
`approveAndStartWalkInAction`; scheduled → `approvePaymentAction`), `router.refresh()` after CAS errors.
`app/(admin)/admin/pending/page.tsx`: guard `(b.startAt ?? b.createdAt).toISOString()` for PENDING walk-ins whose
`start_at` is the creation time (kept NOT NULL) so no `toISOString` crash. `app/(admin)/admin/bookings/BookingsClient.tsx`:
compute real `confirmedCount = bookings.filter(status==='CONFIRMED').length` (replace the hardcoded `0`),
`pendingCount` from status/booking_mode, active checkout button opens a small cash/QRIS/credits chooser calling
`checkoutBookingAction`. `app/(admin)/admin/bookings/page.tsx`: pass `bookingMode` + `payment` into the view. Verify:
`pnpm test:unit -- 'app/(admin)/admin/pending/PendingClient.test.tsx app/(admin)/admin/bookings/BookingsClient.test.tsx' && pnpm typecheck`.

### PHASE 10 — Sweep auth + scheduling seam + org/eligibility proofs

**Task 31 — Red sweep-auth integration test**
`lib/db/sweep-auth.int.test.ts` (new): `AC-837` invoking the route handler with public GET and with a wrong/missing
Bearer writes nothing and returns 401; with `BOOKING_SWEEP_SECRET` it returns 200 and the repo ran. Verify (red):
`pnpm test:int -- 'lib/db/sweep-auth.int.test.ts'`.

**Task 32 — Sweep route + middleware seam**
`app/api/cron/booking-status-sweep/route.ts`:
```ts
import { NextResponse } from "next/server";
export async function GET(_req: Request) {
  const auth = _req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.BOOKING_SWEEP_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); // AC-837 before any write
  }
  const { getSessionUser } = await import("@/lib/auth/session");
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const result = await runStatusSweep(user.orgId, new Date());
  return NextResponse.json(result);
}
```
`middleware.ts`: early-return `response()` for `/api/cron/*` (before the session gate) so the route's own Bearer
auth is the authority; add `/api/cron/booking-status-sweep` handling. `.env.example`: add `BOOKING_SWEEP_SECRET`.
Verify: `pnpm typecheck && pnpm test:int -- 'lib/db/sweep-auth.int.test.ts'` (green).

**Task 33 — Cafe eligibility + AC-832 (unchanged gate, now after approval)**
`lib/cafe/eligibility.test.ts`: `AC-832` — member with no ACTIVE booking → false; member with an ACTIVE booking →
true. Confirm `resolveDiscountEligibility` (ADRs 0011) still resolves `getActiveBooking` (which now returns only
ACTIVE — i.e. cashier-approved) — no logic change needed; the unit test proves the invariant. Verify:
`pnpm test:unit -- 'lib/cafe/eligibility.test.ts'`.

**Task 34 — Tier-discount consumption (unit) [AFTER-I-041-MERGE]**
`lib/booking/pricing.test.ts`: add `AC-827` — the click-path resolver picks `getTierDiscounts(orgId,
tier).coworkingDiscountPct` for COWORKING_SEAT and `.meetingDiscountPct` for MEETING_ROOM, defaults to 0 for a
missing row, and `computeBookingPrice` applies `Math.round`. (Unit-mock `getTierDiscounts`.) Also confirm the
`[AFTER-I-041-MERGE]` seam by running `pnpm typecheck` once I-041's 4-dim return is merged. Verify:
`pnpm test:unit -- 'lib/booking/pricing.test.ts' && pnpm typecheck`.

**Task 35 — Org-isolation sweep (`AC-846`)**
`lib/db/time-credit-lots.int.test.ts` + `lib/db/bookings.int.test.ts`: an `AC-846` case iterating lots + ledger
rows + bookings asserting that org A's queries/writes never observe org B rows (read AND write), including a
cross-org `time_credit_lots` spend attempting to read org B's lots (must throw / no-op). Verify:
`pnpm test:int -- 'lib/db/time-credit-lots.int.test.ts lib/db/bookings.int.test.ts'`.

### PHASE 11 — e2e AC-849 + full gates

**Task 36 — Curated e2e AC-849**
`e2e/AC-849-member-books-scheduled-tenant.spec.ts` (the single curated journey, ADR-0010): login seeded member →
`/booking` → choose scheduled coworking → pick date + 2h → select an **available** seat from the server floor plan →
choose payment method `online` → accept policy → confirm → the created booking's status `CONFIRMED`/payment are
visible on the success state (and `/history`). Follow the AC-200 helper patterns (`loginAs`, seeded
`budi@flowspace.test`). Oracle is the goal (booking created + CONFIRMED), reboot from server state. Verify:
`pnpm exec supabase db reset && pnpm db:seed:supabase && pnpm e2e -- e2e/AC-849-member-books-scheduled-tenant.spec.ts`.

**Task 37 — Traceability + full gates**
Confirm each `AC-8XX` appears in exactly one owning test title:
`for id in $(seq 800 849); do grep -rl "AC-$id" lib app e2e | wc -l; done` (AC-849 owns `e2e/`; AC-800..848 owned at
their spec layer/task above). Then the full gate suite:
`pnpm exec supabase db reset && pnpm db:seed:supabase && pnpm typecheck && pnpm lint:ci && pnpm test:unit && pnpm test:int && pnpm build`.

---

## Traceability (every AC → one owning test + layer)

| AC | Owning test | Layer |
|---|---|---|
| AC-800 | `lib/db/facilities-seed.int.test.ts` — `AC-800` | Integration |
| AC-801 | `app/(member)/booking/BookingClient.test.tsx` — `AC-801` | Unit (RTL) |
| AC-802 | `components/member/booking/Step2Time.test.tsx` — `AC-802` | Unit (RTL) |
| AC-803 | `components/member/booking/FloorPlan.test.tsx` — `AC-803` | Unit (RTL) |
| AC-804 | `lib/db/bookings.int.test.ts` — `AC-804` | Integration |
| AC-805 | `lib/db/bookings.int.test.ts` — `AC-805` | Integration |
| AC-806 | `lib/db/bookings.int.test.ts` — `AC-806` | Integration |
| AC-807 | `lib/db/bookings.int.test.ts` — `AC-807` | Integration |
| AC-808 | `lib/db/bookings.int.test.ts` — `AC-808` | Integration |
| AC-809 | `lib/db/bookings.int.test.ts` — `AC-809` | Integration |
| AC-810 | `lib/db/bookings.int.test.ts` — `AC-810` | Integration |
| AC-811 | `lib/db/bookings.int.test.ts` — `AC-811` | Integration |
| AC-812 | `lib/booking/pricing.test.ts` — `AC-812` | Unit |
| AC-813 | `lib/db/bookings.int.test.ts` — `AC-813` | Integration |
| AC-814 | `lib/booking/pricing.test.ts` — `AC-814` | Unit |
| AC-815 | `lib/db/bookings.int.test.ts` — `AC-815` | Integration |
| AC-816 | `lib/db/bookings.int.test.ts` — `AC-816` | Integration |
| AC-817 | `lib/db/bookings.int.test.ts` — `AC-817` | Integration |
| AC-818 | `lib/db/bookings.int.test.ts` — `AC-818` | Integration |
| AC-819 | `lib/db/bookings.int.test.ts` — `AC-819` | Integration |
| AC-820 | `lib/db/bookings.int.test.ts` — `AC-820` | Integration |
| AC-821 | `lib/db/bookings.int.test.ts` — `AC-821` | Integration |
| AC-822 | `lib/db/bookings.int.test.ts` — `AC-822` | Integration |
| AC-823 | `lib/db/time-credit-lots.int.test.ts` — `AC-823` | Integration |
| AC-824 | `lib/db/time-credit-lots.int.test.ts` — `AC-824` | Integration |
| AC-825 | `lib/db/time-credit-lots.int.test.ts` — `AC-825` | Integration |
| AC-826 | `lib/db/packages.int.test.ts` — `AC-826` | Integration |
| AC-827 | `lib/booking/pricing.test.ts` — `AC-827` | Unit |
| AC-828 | `lib/db/bookings.int.test.ts` — `AC-828` | Integration |
| AC-829 | `components/member/SessionPanel.test.tsx` — `AC-829` | Unit (RTL) |
| AC-830 | `components/member/SessionPanel.test.tsx` — `AC-830` | Unit (RTL) |
| AC-831 | `components/member/SessionPanel.test.tsx` — `AC-831` | Unit (RTL) |
| AC-832 | `lib/cafe/eligibility.test.ts` — `AC-832` | Unit |
| AC-833 | `lib/db/bookings.int.test.ts` — `AC-833` | Integration |
| AC-834 | `lib/db/bookings.int.test.ts` — `AC-834` | Integration |
| AC-835 | `lib/db/admin.int.test.ts` — `AC-835` | Integration |
| AC-836 | `lib/db/bookings.int.test.ts` — `AC-836` | Integration |
| AC-837 | `lib/db/sweep-auth.int.test.ts` — `AC-837` | Integration |
| AC-838 | `lib/db/bookings.int.test.ts` — `AC-838` | Integration |
| AC-839 | `lib/db/bookings.int.test.ts` — `AC-839` | Integration |
| AC-840 | `app/(admin)/admin/pending/PendingClient.test.tsx` — `AC-840` | Unit (RTL) |
| AC-841 | `app/(admin)/admin/bookings/BookingsClient.test.tsx` — `AC-841` | Unit (RTL) |
| AC-842 | `app/(member)/booking/BookingClient.test.tsx` — `AC-842` | Unit (RTL) |
| AC-843 | `components/member/booking/FloorPlan.test.tsx` — `AC-843` | Unit (RTL) |
| AC-844 | `lib/booking/pricing.test.ts` — `AC-844` | Unit |
| AC-845 | `lib/db/bookings.int.test.ts` — `AC-845` | Integration |
| AC-846 | `lib/db/time-credit-lots.int.test.ts` — `AC-846` | Integration |
| AC-847 | `lib/db/bookings.int.test.ts` — `AC-847` | Integration |
| AC-848 | `lib/booking/interval.test.ts` — `AC-848` | Unit |
| AC-849 | `e2e/AC-849-member-books-scheduled-tenant.spec.ts` — `AC-849` | E2E |

Task count: **37** (flagship). Migrations claimed: **0011 and 0012**.

Riskiest task: **Task 14 (`createBooking` rewrite)** — it touches the money path, the advisory-lock arithmetic,
three payment methods, the tier-discount consumption seam **[AFTER-I-041-MERGE]**, and invalidates/supersedes the
existing AC-130..135 integration fixtures (Task 13 must migrate them in lockstep or the suite goes red).
Second-riskiest: Task 6 (catalog/seed + transitional-lot migration) and Task 2 (enum `ADD VALUE` ordering — the
`CONFIRMED`/`FULL_ROOM` additions must not break `supabase db reset` on a fresh 0000→0012 chain).

Open questions for the Director (aim zero):
1. **I-041 column-name drift:** the spec delta §5 says `meeting_room_discount_pct`; I-041's plan/task 2 creates
   `meeting_discount_pct`. I planned consumption against I-041's merged API (`getTierDiscounts(...).meetingDiscountPct`).
   Confirm I-041's 0010 emits `meeting_discount_pct` (its plan says so) so Task 14/34 bind correctly.
2. **Full-room online bookability:** commit `04f5a69` corrected the spec (OBS-812 — full-room IS online-bookable);
   Task 15 removes the old `FULL_ROOM_NOT_BOOKABLE_ONLINE` throw. Confirm the Director wants online full-room
   booking wired this pass (it is, per spec), since it also needs `getFullRoomAvailability` in the wizard.
3. **Sandbox discount recompute at checkout:** Task 18 recomputes the tier discount at `checkoutBooking` using the
   *current* tier config. ORIG freezes the amount at create for scheduled bookings; walk-ins are only priced at
   checkout. This asymmetry is faithful to OBS/FR-856 ("billed hours and tier discount recomputed" at checkout).
   No decision needed unless the Director prefers a frozen booking-time discount for walk-ins too.
4. **Transitional credit lot:** Task 6 seeds one 90-day transitional lot from the legacy `app_users.time_credits`
   aggregate (spec delta 4). Confirm the seeded member's 139h should become one lot (it will; no owner input
   required).

**No ADR** (regression plan) — advisory-lock-vs-exclusion is reversible and spec-permitted; it is documented in
the Design section, not an ADR.
## Director answers to open questions (2026-08-28)

1. **Column naming:** bind to I-041's `meeting_discount_pct` / `getTierDiscounts(...).meetingDiscountPct` —
   I-041 owns the column; spec 0007's migration-delta line has been corrected to match.
2. **Full-room online booking:** confirmed, ships this pass (owner-approved OBS-812/AC-806).
3. **Checkout discount timing:** approved as planned — recompute at checkout (ORIG re-applies at billing);
   scheduled amounts stay frozen at create.
4. **Transitional lot:** approved — one 90-day lot from any legacy aggregate. No production data exists yet;
   revisit only at a real prod cutover.
