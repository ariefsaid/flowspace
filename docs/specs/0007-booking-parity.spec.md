# Spec 0007 — Booking parity overhaul (flagship)

- Status: Draft (I-040; owner decisions locked)
- Source: ORIG booking/facility source (`app/api/bookings/**`, `app/api/facilities/**`, `app/booking/`,
  `app/dashboard/`, `components/floor-plan.tsx`, `lib/types.ts`, `scripts/seed.ts`, and the Prisma booking,
  facility, and credit models), plus the audited delta in `docs/gap-analysis-original.md` §2.1–§2.2.
- Depends on: specs 0002/0004, ADR-0004, ADR-0010, ADR-0011, ADR-0013–0015, and the I-041 tier-config keys.
  This spec supersedes the booking/time-credit behavior listed below; auth and unrelated vertical ACs remain valid.

## Scope

**In:** the complete booking state/payment model; conflict-safe availability and facility catalog; expiring
FIFO time-credit lots; tier-driven booking discounts; the member four-step wizard and floor-plan behavior;
active-session extension; cashier approval/start and admin checkout; authenticated status sweep; member dashboard
session panel and cafe ACTIVE gate; typed Drizzle repositories, server actions, and ordered Supabase migration/seed.

**Out:** WiFi voucher and door verification (I-045), tier values and tier CRUD (I-041), admin users CRUD/manual
booking/facility CRUD (I-042), payment gateway, and visual implementation beyond the separate design workflow.

**Superseded ACs:** spec 0004 `AC-130..135`, `AC-ADM-01..05`, `AC-143..145`, `AC-ADM-BK-01..04`, and
`AC-ADM-PEND-01..03`; its `AC-200` is superseded for aggregate time-credit semantics by this spec. Spec 0002
has no booking ACs; its auth, route-gate, and tenancy ACs remain in force.

## Observations (ORIG behavior, EARS form)

### Catalog, availability, and member booking
- **OBS-400** — When the catalog is seeded, it contains 12 desks A–L at Rp25.000/hour, capacity 1, zone `DESK`, cap 4h.
- **OBS-401** — When the catalog is seeded, it contains counter seats 1–8 at Rp20.000/hour, capacity 1, zone `COUNTER`, cap 4h.
- **OBS-402** — When the catalog is seeded, it contains Meeting Room A (capacity 10, Rp150.000/hour) and B (capacity 8, Rp120.000/hour), zone `MEETING`.
- **OBS-403** — When the catalog is seeded, it contains a capacity-20 full-room event facility at Rp350.000/hour, zone `FULL_ROOM`.
- **OBS-404** — While a facility is bookable, its name, capacity, rate, availability, zone, seat label, and max-hour cap are displayed/read from the catalog.
- **OBS-405** — When a member opens booking, the flow has four steps: `Tipe`, `Waktu`, `Pilih Tempat`, and `Konfirmasi`.
- **OBS-406** — When step one is shown, it offers walk-in coworking, walk-in meeting, scheduled coworking, scheduled meeting, and full-room event.
- **OBS-407** — When a scheduled booking is configured, its duration is selectable from 1 through 8 hours and its end is derived from start plus duration.
- **OBS-408** — When a walk-in is configured, coworking is open-duration and meeting has a selected duration; the session starts only after cashier approval.
- **OBS-409** — When coworking place selection is shown, an interactive floor plan renders desk labels A–L and counter labels 1–8 with available, occupied, and selected states.
- **OBS-410** — When a facility overlaps a `PENDING`, `CONFIRMED`, or `ACTIVE` booking, availability marks it occupied and selection is disabled.
- **OBS-411** — When individual seats have any booking during a calendar day, the full-room facility is unavailable for that day; a full-room booking makes individual seats unavailable for its reserved interval.
- **OBS-412** — When a full-room event is selected by a member, the UI presents a contact-for-price request rather than an online booking write.

### Lifecycle, payment, and pricing
- **OBS-413** — When a scheduled booking is created, its lifecycle is `PENDING → CONFIRMED → ACTIVE → COMPLETED|CANCELLED`; a walk-in follows `PENDING → ACTIVE → COMPLETED|CANCELLED` after cashier start.
- **OBS-414** — When a scheduled booking is paid by `online` or `time_credits`, it is `CONFIRMED` with `PAID_ONLINE`; `cashier` creates `PENDING`/`WAITING_CASHIER`.
- **OBS-415** — When a walk-in is submitted, it is `PENDING`/`WAITING_CASHIER`; cashier approval changes it to `ACTIVE`, not directly to `COMPLETED`.
- **OBS-416** — When a booking is priced, the tier's coworking or meeting discount percentage is applied to `rate × hours`.
- **OBS-417** — When a walk-in session is displayed, elapsed time counts upward, running cost rounds up by hour, and the facility cap limits the provisional charge.
- **OBS-418** — While a scheduled session has 15 minutes or less remaining, the member dashboard shows an extension affordance.
- **OBS-419** — While an ACTIVE scheduled session is past its end, the dashboard shows a red overtime warning and does not auto-complete it.
- **OBS-420** — When an ACTIVE session is checked out by an admin, billed hours are recomputed and payment may be `cash`, `qris`, or `time_credits`.
- **OBS-421** — When checkout uses cash or QRIS, the booking becomes `COMPLETED`/`PAID_CASHIER`; when it uses credits, it becomes `COMPLETED`/`PAID_ONLINE`.
- **OBS-422** — When an ACTIVE session is extended, total duration cannot exceed 4 hours and a later booking starting less than 60 minutes after the proposed end blocks it.
- **OBS-423** — When an extension succeeds, a separate PENDING booking transaction records the extension charge.

### Credits and operational surfaces
- **OBS-424** — When time credits are purchased, ORIG records a lot with total and remaining hours and expiry 90 days after purchase.
- **OBS-425** — When credits are spent, lots are consumed oldest-expiring-first and expired or empty lots are skipped.
- **OBS-426** — When the standard packages are shown, they are 5h/Rp75.000, 10h/Rp140.000, 20h/Rp260.000, and 50h/Rp600.000.
- **OBS-427** — When the admin pending surface is shown, it lists cashier-waiting bookings and provides per-item and bulk approval affordances.
- **OBS-428** — When the admin booking surface is shown, it exposes Pending, Confirmed, and Active counts plus active-session checkout.
- **OBS-429** — When the authenticated status sweep runs, paid CONFIRMED bookings at their start become ACTIVE.
- **OBS-430** — When the status sweep finds an unactivated CONFIRMED booking past its end, it changes it to CANCELLED.
- **OBS-431** — When the status sweep finds an ACTIVE booking past its end, it flags overtime but never changes it to COMPLETED.

### Current FlowSpace delta and ORIG defects
- **OBS-432** — While the current repository runs, booking status omits CONFIRMED and creates scheduled rows ACTIVE, so the locked lifecycle is absent.
- **OBS-433** — While the current repository runs, walk-ins are ACTIVE immediately, use fixed rates, and have no cashier start transition.
- **OBS-434** — While the current repository runs, `app_users.time_credits` is an aggregate integer; lots, expiry, and booking spend are absent.
- **OBS-435** — While the current seed runs, it has only nine desks and one meeting room and lacks seat label, zone, capacity, and cap columns.
- **OBS-436** — While the current member place component renders, its seat map is hardcoded and is not the server availability/floor-plan catalog.
- **OBS-437** — While the current booking repository checks overlaps, the check is outside the insert transaction and is race-prone.
- **OBS-438** — While the current extension path runs, it mutates the booking before creating its transaction and does not enforce the 60-minute guard atomically.
- **OBS-439** — While the current checkout path runs, it has no billing dialog/recomputation or payment-method settlement.
- **OBS-440** — While the current sweep endpoint runs, it accepts unauthenticated requests; this is a defect, not behavior to copy.
- **OBS-441** — When ORIG approves a walk-in, it writes a placeholder end 24 hours later; this is a defect and the intent is an open-ended session.
- **OBS-442** — When ORIG spends multiple credit lots, each debit is a separate non-transactional update; this is a defect and spend must be atomic.
- **OBS-443** — When ORIG creates two overlapping bookings concurrently, its application-only check can admit both; this is a defect and the database must arbitrate.
- **OBS-444** — While the current cafe eligibility helper resolves a discount, it requires an org-scoped ACTIVE booking; this ACTIVE gate remains and now follows cashier approval.
- **OBS-445** — While the current tier config is read, it has cafe/print keys but no `coworkingDiscountPct` or `meetingRoomDiscountPct` keys.
- **OBS-446** — When the current member dashboard renders, it has a walk-in timer/cost panel but no scheduled extension or overtime parity.
- **OBS-447** — When the current admin actions run, role and org are checked server-side, but there is no approve-and-start walk-in action or checkout action.
- **OBS-448** — When the current transaction row is written, it links a booking but has no booking payment-method field for the required cash/QRIS/credit settlement.
- **OBS-449** — When the current schema is reset, booking/facility/credit changes must be introduced through the ordered Supabase migration stream, not Drizzle-kit.

## Functional requirements (new behavior/defect fixes, EARS)

- **FR-450** (event-driven) — When a booking or extension is written, the server shall perform the overlap check and insert/update in one transaction, and a database exclusion/locking constraint shall reject any `PENDING`, `CONFIRMED`, or `ACTIVE` overlap for the same facility.
- **FR-451** (event-driven) — When a full-room or individual-seat booking is written, the transaction shall serialize on `(org_id, calendar day)`, enforce the full-room exclusivity rule in both directions, and reject races without a double booking.
- **FR-452** (event-driven) — When the status sweep is invoked, it shall require an authenticated scheduled-job credential or server-only invocation, resolve one org scope, and reject unauthenticated/public requests before any write.
- **FR-453** (event-driven) — When credits are spent for a booking or checkout, the lot selection, FIFO decrements, derived-balance update, booking state, and ledger settlement shall commit or roll back as one transaction; concurrent spend shall not overspend.
- **FR-454** (event-driven) — When a cashier starts a walk-in, the server shall set `start_at` to approval time and leave `end_at` null until checkout; it shall never manufacture a 24-hour end.
- **FR-455** (ubiquitous) — When any booking route/action/repository resolves a user, facility, booking, lot, or transaction, it shall use the server-derived `org_id` and role/ownership check; cross-org identifiers shall behave as not found/forbidden with no write.
- **FR-456** (event-driven) — When an admin checks out an ACTIVE booking, billed hours and the tier discount shall be recomputed, and credit debit, booking transition, payment status, and linked ledger settlement shall be atomic and compare-and-set guarded.
- **FR-457** (event-driven) — When an ACTIVE booking is extended, the server shall enforce the four-hour and 60-minute rules inside the same transaction as the booking/transaction write; a conflict shall leave both unchanged.
- **FR-458** (state-driven) — While a booking is not in the source state for its requested transition, the server shall reject it without a partial write; concurrent approval, activation, cancellation, sweep, or checkout shall be idempotent/compare-and-set safe.
- **FR-459** (event-driven) — When a scheduled booking is created with an accepted online or credit payment, the server shall persist the final tier-discounted amount and `CONFIRMED`/`PAID_ONLINE`; cashier payment shall persist `PENDING`/`WAITING_CASHIER`, never client-selected status.

## Non-functional requirements

- **NFR-400** (ubiquitous) — All money and whole-hour fields are integer Rupiah/whole hours; discount rounding is `Math.round`; no client rate, amount, tier, org, or balance is trusted.
- **NFR-401** (ubiquitous) — Every introduced table and route is `org_id` scoped, server-authorized, indexed for org/status/facility/time lookups, and protected by RLS as defense in depth.
- **NFR-402** (ubiquitous) — The transaction ledger is the reporting source; booking and all related charge rows are linked by real foreign keys and settle atomically.
- **NFR-403** (ubiquitous) — UI follows `DESIGN.md`, all loading/empty/error/edge states, keyboard/focus/WCAG-AA behavior, and the two-round design workflow; pixel review is separate from this SDD.

## Migration/schema delta

1. Add `CONFIRMED` to `BookingStatus`; replace the current ACTIVE default with `PENDING`. Replace walk-in pseudo-types with a `booking_mode` (`SCHEDULED|WALKIN`) plus the catalog `facility_type`; retain snapshots for rate, facility name, base amount, discount, and final amount. `facility_id` becomes required for every selected catalog facility; walk-ins use `end_at NULL` until checkout and no fake end.
2. Extend `facilities` with `capacity`, `seat_label`, `zone`, and nullable `max_hours_cap`; extend `FacilityType` with `FULL_ROOM`. Keep `available`, `archived_at`, timestamps, org FK, and indexes. Add a GiST/exclusion strategy (with an org/day advisory-lock fallback for cross-facility full-room exclusivity) over half-open booking intervals.
3. Add `booking_payment_method`/transaction payment-method data supporting booking `time_credits|online|cashier` and checkout `cash|qris|time_credits`; preserve `PAID_ONLINE|WAITING_CASHIER|PAID_CASHIER`. Add indexes for `(org_id, facility_id, status, start_at, end_at)` and enforce non-negative money/duration checks.
4. Add `time_credit_lots(org_id, user_id, package_id, purchase_transaction_id, total_hours, remaining_hours, purchased_at, expires_at, created_at, updated_at)` with org/user/expiry indexes and checks. `app_users.time_credits` becomes a derived cache of non-expired remaining lots: it is updated in the same transaction but is never the authority for spend. A fresh reset seeds lots; an existing aggregate is migrated into one explicitly transitional 90-day lot before normal spending.
5. Add `coworking_discount_pct` and `meeting_room_discount_pct` to `membership_tier_config`; booking reads these keys server-side. I-041 owns their values and seed correction, so this spec does not hardcode tier percentages.
6. Add idempotent seed rows for the 23 facilities in OBS-400..403 and retain the four package amounts in OBS-426. Update Drizzle `lib/db/schema.ts`, enum mirrors, repositories, and server actions in lockstep with the ordered migration. `supabase db reset` is the migration verification path.

## Repository/action and UI contract

- `lib/db/bookings.ts` shall expose org-scoped catalog/availability reads, `createBooking`, `approveAndStartWalkIn`, `extendBooking`, `previewCheckout`, `checkoutBooking`, and `runStatusSweep`; all money paths accept a transaction context.
- `app/(member)/booking/` shall render the four-step flow using server facilities and availability; place selection shall use the interactive floor plan, never hardcoded seats. The confirmation screen shall show payment choice, server-calculated estimate/discount, policy acceptance, and honest success/error states.
- `app/(admin)/admin/pending/` shall distinguish walk-in approve-and-start from payment settlement; `app/(admin)/admin/bookings/` shall expose status counts, active sessions, checkout preview, and cash/QRIS/credit settlement. Both remain ADMIN-only and refresh after compare-and-set errors.
- `app/(member)/dashboard/` shall show scheduled countdown, ≤15-minute extension warning, overtime warning, and walk-in live cost. `lib/cafe/eligibility.ts` shall continue returning true only for a server-resolved MEMBER with an ACTIVE booking.
- The sweep shall be an authenticated scheduled route/job, not a public GET; it shall auto-activate paid CONFIRMED rows, cancel expired unactivated CONFIRMED rows, report overtime, and never complete ACTIVE rows.

## Acceptance criteria (Given/When/Then; owning test layer)

- **AC-400** (integration) — Given a fresh org, when facilities are seeded, then all 23 rows and their exact rates, capacities, zones, labels, and caps match OBS-400..403.
- **AC-401** (unit/RTL) — Given the member booking page, when it renders, then the four labeled steps and five booking choices are present.
- **AC-402** (unit) — Given a scheduled selection, when duration is chosen, then only 1–8 hours are accepted and end equals start plus duration.
- **AC-403** (unit/RTL) — Given an interactive floor plan, when an available labeled seat is clicked, then it becomes selected and an occupied seat cannot be selected.
- **AC-404** (integration) — Given overlapping active-like bookings, when availability is requested, then the facility is marked occupied and all three statuses block it.
- **AC-405** (integration) — Given an individual booking on a calendar day, when full-room availability is requested, then full room is unavailable for that day.
- **AC-406** (unit/RTL) — Given full-room member selection, when confirmation is submitted, then a contact state appears and no online booking action is called.
- **AC-407** (integration) — Given the lifecycle enum, when legal transitions run, then scheduled rows accept PENDING→CONFIRMED→ACTIVE→COMPLETED/CANCELLED and walk-ins accept PENDING→ACTIVE→COMPLETED/CANCELLED only.
- **AC-408** (integration) — Given an online scheduled booking, when it is created, then it is CONFIRMED/PAID_ONLINE with server-priced amount.
- **AC-409** (integration) — Given a cashier scheduled booking, when it is created, then it is PENDING/WAITING_CASHIER and its ledger row is pending.
- **AC-410** (integration) — Given a walk-in request, when it is created, then it is PENDING/WAITING_CASHIER with no chargeable end.
- **AC-411** (integration) — Given a walk-in pending row, when an ADMIN approves and starts it, then it becomes ACTIVE with start time at approval and end null.
- **AC-412** (integration) — Given a walk-in started for elapsed 62 minutes on a capped facility, when checkout computes billing, then billed hours are ceil(62/60), capped by the facility cap.
- **AC-413** (integration) — Given a scheduled ACTIVE booking, when checkout computes billing, then billed hours equal its booked duration regardless of current elapsed time.
- **AC-414** (unit) — Given a tier percentage and rate/hours, when booking price is computed, then discount applies to rate×hours and rounds with Math.round.
- **AC-415** (integration) — Given two concurrent creates for one interval, when both commit, then at most one succeeds and the other has no booking/ledger write.
- **AC-416** (integration) — Given a full-room and individual-seat race on one day, when both create, then at most one exclusivity class succeeds.
- **AC-417** (unit/integration) — Given an ACTIVE scheduled booking and a next booking, when proposed end leaves less than 60 minutes, then extension is rejected unchanged.
- **AC-418** (integration) — Given an ACTIVE booking with total extension ≤4 hours and a 60-minute gap, when extension runs, then end/duration update and a PENDING extension transaction are atomic.
- **AC-419** (integration) — Given a non-ACTIVE booking, when extension is requested, then it is rejected with no write.
- **AC-420** (integration) — Given an ADMIN and ACTIVE booking, when checkout uses cash, then booking is COMPLETED/PAID_CASHIER and ledger is settled.
- **AC-421** (integration) — Given an ADMIN and ACTIVE booking, when checkout uses QRIS, then booking is COMPLETED/PAID_CASHIER and ledger records qris.
- **AC-422** (integration) — Given an ADMIN and ACTIVE booking with sufficient lots, when checkout uses credits, then hours are FIFO-debited and booking is COMPLETED/PAID_ONLINE atomically.
- **AC-423** (integration) — Given insufficient credit lots, when credit booking or checkout is attempted, then no lot, booking, balance, or ledger row changes.
- **AC-424** (integration) — Given lots expiring at different dates, when hours are spent, then the soonest-expiring lot is consumed first and expired lots are ignored.
- **AC-425** (integration) — Given two concurrent credit spends, when their combined demand exceeds available lots, then one rolls back and the cache never goes negative.
- **AC-426** (integration) — Given a newly purchased package, when purchase completes, then a lot expires exactly 90 days after purchase and the derived balance increases by package hours.
- **AC-427** (unit/integration) — Given each tier config row, when booking prices are resolved, then the correct coworking/meeting config key is read and missing config grants 0%.
- **AC-428** (integration) — Given a checkout transaction, when the booking is settled, then its real booking FK ledger row is updated and included in completed revenue.
- **AC-429** (unit/RTL) — Given a member with a scheduled ACTIVE booking, when the dashboard renders near end, then countdown and the ≤15-minute extension banner appear.
- **AC-430** (unit/RTL) — Given an ACTIVE scheduled booking past end, when dashboard state updates, then overtime appears and no completion action runs.
- **AC-431** (unit/RTL) — Given an ACTIVE walk-in, when elapsed time updates, then timer counts up and provisional cost is capped and rounded hourly.
- **AC-432** (unit) — Given no ACTIVE booking, when cafe eligibility resolves, then it is false; given an ACTIVE member booking, then it is true.
- **AC-433** (integration) — Given a member's org and another org's booking, when member reads history/active booking, then only the member-org rows return.
- **AC-434** (integration) — Given a cross-org facility or user identifier, when create is attempted, then it is rejected before any write.
- **AC-435** (integration) — Given a non-ADMIN actor, when approve/start, checkout, or sweep is invoked, then it is forbidden before any write.
- **AC-436** (integration) — Given two concurrent transition requests, when one wins the compare-and-set, then the loser returns a transition error and does not mutate ledger/state.
- **AC-437** (integration) — Given a public request to the sweep route, when it is called by GET or POST without job authentication, then it returns unauthorized and writes nothing.
- **AC-438** (integration) — Given paid CONFIRMED rows at start, expired CONFIRMED rows, and overdue ACTIVE rows, when an authenticated sweep runs, then it activates, cancels, and reports overtime respectively.
- **AC-439** (integration) — Given an overdue ACTIVE booking, when the sweep runs repeatedly, then it remains ACTIVE until cashier checkout.
- **AC-440** (unit/RTL) — Given the pending admin list, when it renders, then walk-in start and scheduled cashier approval affordances are distinct and refresh after success.
- **AC-441** (unit/RTL) — Given admin booking rows in each lifecycle state, when the page renders, then Pending/Confirmed/Active counts and checkout action reflect them.
- **AC-442** (unit/RTL) — Given a server booking-action failure, when the member confirms, then an inline error appears and success is not shown.
- **AC-443** (unit) — Given a facility response, when the floor plan renders, then it uses response labels/status/rates and imports no hardcoded seat catalog.
- **AC-444** (integration) — Given a facility with maxHoursCap 4, when walk-in checkout exceeds four hours, then amount uses exactly four billed hours.
- **AC-445** (integration) — Given CANCELLED, COMPLETED, or already ACTIVE rows, when an invalid transition is requested, then it is rejected without a state change.
- **AC-446** (integration) — Given every introduced table and action, when an org-isolation test runs, then cross-org reads and writes are absent, including lots and ledger rows.
- **AC-447** (integration) — Given a walk-in approved at time T, when its row is inspected before checkout, then start_at=T and end_at is null; no +24h placeholder exists.
- **AC-448** (integration) — Given availability is queried for a date/window, when a booking touches either boundary, then half-open overlap semantics match creation conflict semantics.
- **AC-449** (curated e2e) — Given a seeded member, when they choose scheduled coworking, date/time, an available floor-plan seat, payment method, and policy acceptance, then a server-priced booking is created and the resulting status/payment are visible.

## Traceability and implementation notes

The repository money paths, RLS/tenancy, exclusion/locking, FIFO spend, and checkout ACs are owned by Drizzle/Postgres
integration tests; pure billing, transition, timer, and eligibility functions are owned by Vitest; wizard, floor-plan,
admin, and dashboard rendering are owned by RTL; AC-449 is the single curated Playwright journey (ADR-0010). Changed
code must meet the project ≥80% line coverage, typecheck, lint, build, and design-review gates. No client-identifying
brand, tier display name, seed identity, or source URL may enter this spec or its implementation.

## Out of scope

I-045 integrations; I-041 discount values/tier CRUD; I-042 facility/admin CRUD and manual booking; real online gateway;
WiFi/door access; email; and any change to print/cafe behavior except the existing server-resolved ACTIVE cafe gate.
