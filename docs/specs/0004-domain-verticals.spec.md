# Spec 0004 — Domain verticals (time-credits, booking, keycard, print, admin console, history)

- Status: **Built (burst, 2026-06-17); spec backfilled retroactively.** This is a *retroactive* spec: every
  acceptance criterion below names an **already-existing test** (the verticals were built + tested in the burst;
  this document formalizes that behavior and records its traceability). No code changes accompany this spec.
- Depends on: spec **0002** (auth/session/middleware/repository seam), spec **0003** (cafe domain + the unified
  `transactions` ledger seam this spec extends); ADR-0013 (Supabase prod + external integrations deferred &
  owner-gated), ADR-0014 / ADR-0015 (Supabase + Drizzle, server-authoritative; Prisma/Neon/NextAuth removed),
  ADR-0011 (server-resolved discount eligibility; client UX flags untrusted), ADR-0012 (id/code generation),
  ADR-0010 (test pyramid — one owning layer per AC), ADR-0004 (server-derived `orgId`, never client).
- Scope (issues backfilled): **I-020** time-credit packages + print top-up · **I-021** booking (scheduled +
  walk-in) + admin pending/approve/bookings + revenue KPIs · **I-024** keycard QR (simulated door) ·
  **I-023** print jobs + member print history · member **dashboard** / **history** surfaces · the unified
  **`transactions`** ledger feeding member /history and the admin console.
- Source of behavior: the live product's member + admin surfaces (recon under `review/recon/`) for `OBS-*`;
  net-new **server-side write/money behavior** (server-pricing, balance debits, ledger atomicity, SoD authz,
  HMAC keycard token) as `FR-*`.

> **Masking note.** This spec uses generic FlowSpace values only — no client brand, tier code, source URL, or
> recon filenames. Membership tiers are `REGULAR` / `PREMIUM` / `GOLD`; example documents are `dokumen.pdf`;
> the package tiers are the generic `5/10/20/50 Hours` already committed in `scripts/seed-supabase.ts`.

---

## Roles (server-trusted, from spec 0002)
`Role = { MEMBER, ADMIN, BARISTA }`, carried in the session (`session.user.{id,role,orgId}`). A MEMBER may
purchase packages, top up print, place bookings, submit print jobs, and view their own dashboard/history. Only
an **ADMIN** may approve a cashier payment or force-complete an active walk-in session (SoD). All money fields
are server-computed; the client never supplies `orgId`, a price, an amount, or a balance delta.

---

## Observed behavior (recon — `OBS-###`)

### Time-credit packages + balances (top-up surface)
- **OBS-200** — The top-up surface shows the member's **Time Credits** (hours available) and **Print Balance**
  (pages available) as two balance cards.
- **OBS-201** — Four time-credit packages are offered, each with name, hours, price, and a per-hour rate; one is
  flagged "Popular":
  `5 Hours = Rp75.000 (Rp15.000/h)`, `10 Hours = Rp140.000 (Rp14.000/h, Popular)`,
  `20 Hours = Rp260.000 (Rp13.000/h)`, `50 Hours = Rp600.000 (Rp12.000/h)`.
- **OBS-202** — Print balance is also toppable (the top-up surface adds print pages); a purchase increases the
  corresponding balance.

### Booking
- **OBS-210** — Booking is a 4-step wizard (`Tipe → Waktu → Pilih Tempat → Konfirmasi`).
- **OBS-211** — Two **walk-in** types: *Walk-in Coworking* ("durasi dihitung saat selesai, maks 4 jam biaya",
  pay at cashier on completion) and *Walk-in Meeting* (start now, choose duration).
- **OBS-212** — Three **scheduled** types: *Coworking Seat* (from `Rp20.000/jam`, seat-map pick), *Meeting Room*
  (from `Rp120.000/jam`), *Full Room Event* ("Hubungi untuk harga" — no online price/booking).
- **OBS-213** — A walk-in booking is created in an **open** state and appears as `ACTIVE` + `WAITING CASHIER`
  with `Durasi: 0 jam` and `Rp 0` until the cashier settles it; the dashboard shows a running "Walk-in Aktif"
  banner with elapsed duration, a provisional per-hour charge, and "Maks: 4 jam".
- **OBS-214** — Booking history rows carry a **booking status** (`ACTIVE` / `COMPLETED` / `CANCELLED`) and a
  separate **payment status** (`WAITING CASHIER` / `PAID CASHIER` / `PAID ONLINE`), with facility name, the
  start/end window, and a computed duration in hours.

### Keycard (digital QR)
- **OBS-220** — With no active booking, the keycard surface shows an **empty state** ("No Active Booking" +
  "Book a Space" CTA).
- **OBS-221** — With an active booking, it shows a **QR access** card for the booked facility; the dashboard's
  combined "QR Akses Pintu & Print" card **rotates** ("Refreshes in 27s").

### Print
- **OBS-230** — The print surface shows the member's print balance and a calculator: **base rate Rp500/page**
  (BW A4), times copies, with a running total and "Saldo Setelah Print" projection.
- **OBS-231** — A **Riwayat Print Terbaru** list shows recent jobs (file name, page count, price, status —
  `Menunggu` / `Siap Ambil`).

### Member dashboard + history
- **OBS-240** — The dashboard summarizes balances (time credits, print pages), membership tier, an access QR,
  facility quick-actions (cafe/print/booking/top-up), and a recent-bookings list; when a walk-in is active it
  leads with the live "Walk-in Aktif" banner (OBS-213).
- **OBS-241** — The history surface has two tabs — **Booking (n)** and **Transaksi (n)** — the first listing
  booking rows (OBS-214), the second listing ledger entries.

### Admin console
- **OBS-250** — The admin dashboard shows KPI tiles: Today's Bookings, Active Sessions, Pending Payments, Total
  Users, and **Today / Weekly / Monthly Revenue**, plus a **Recent Transactions** ledger feed (each row: member,
  description, timestamp, amount, status `COMPLETED` / `PENDING`).
- **OBS-251** — **Pending Payments** lists `WAITING CASHIER` bookings with a per-item + bulk **Approve** action
  ("Approve offline cashier payments").
- **OBS-252** — **Booking Management** shows count pills (Pending / Confirmed / Active), an active-booking card
  with a "Selesaikan Sesi & Bayar" (complete) action, and a history table.
- **OBS-253** — **User Management** lists members with name, **tier badge**, email, join date, and booking /
  transaction counts, filterable by membership and searchable.

---

## Functional requirements (EARS)

### Time-credit packages + top-up (I-020)
- **FR-200** (ubiquitous) — `listPackages(orgId)` *shall* return only the caller-org's **non-archived** packages,
  ordered by `sortOrder`; the client *shall never* supply `orgId`. (Realizes OBS-201.)
- **FR-201** (event-driven) — *When* a member purchases a package, the system *shall* re-load the package **within
  the caller's org** (a cross-org / unknown / archived `packageId` *shall* throw `UNKNOWN_PACKAGE` **before any
  write**), credit `app_users.timeCredits` by the package's `hours` via an **atomic SQL increment**, charge the
  package's **DB `priceRupiah`** (never a client value), and record a `COMPLETED` `PACKAGE_PURCHASE` ledger row
  (with `packageId`) — the balance increment and ledger write atomic in **one** `db.transaction`. (OBS-201.)
- **FR-202** (event-driven) — *When* a member tops up print, the system *shall* validate `pages` as a **positive
  bounded integer** (reject non-integer / `≤0` / `>10_000` before any write), credit `app_users.printBalance` by
  `pages`, charge `amount = pages × PRINT_RATE_PER_PAGE_RUPIAH (500)` (server-computed, never client), and record
  a `COMPLETED` `PRINT_TOPUP` ledger row — increment + ledger atomic in one transaction. (OBS-202, OBS-230.)

### Booking (I-021)
- **FR-210** (event-driven) — *When* a **scheduled** booking (`COWORKING_SEAT` / `MEETING_ROOM`) is created, the
  system *shall* resolve the facility row **within the org** (by id or by `(name,type,org)`; an unmatched /
  cross-org facility throws `INVALID_FACILITY` before any write), take the **rate from the DB facility row**
  (client rate ignored), re-derive `durationHours = ceil((endAt − startAt)/1h)` **server-side**, set
  `amount = hours × DB-rate`, create the booking `ACTIVE` / `paymentStatus=PENDING`, and write a `COMPLETED`
  `BOOKING` ledger row — booking + ledger atomic in one transaction. (OBS-212.)
- **FR-211** (event-driven) — *When* a **walk-in** booking (`WALKIN_COWORKING` / `WALKIN_MEETING`) is created,
  the system *shall* open it with `endAt=null`, `durationHours=null`, `amount=0`, `status=ACTIVE`,
  `paymentStatus=WAITING_CASHIER`, and write a **`PENDING`** `BOOKING` ledger row (the charge is unknown until
  completion). (OBS-211, OBS-213.)
- **FR-212** (event-driven, conditional) — *When* a walk-in booking is completed, the system *shall* compute
  `hours = min(ceil(elapsed), 4)` (the **4-hour charge cap**), set `endAt=now`, `durationHours=hours`,
  `amount = hours × DB-rate`, flip the booking to `COMPLETED` (compare-and-set on `ACTIVE`), and **sync the
  linked `BOOKING` ledger row's amount** in the same transaction (its row was created at 0). (OBS-211, OBS-213.)
- **FR-213** (ubiquitous) — `FULL_ROOM` *shall not* be bookable online (`FULL_ROOM_NOT_BOOKABLE_ONLINE`).
  (OBS-212 "Hubungi untuk harga".)
- **FR-214** (event-driven) — *When* a booking is cancelled, the system *shall* compare-and-set `ACTIVE →
  CANCELLED` (org-scoped; a cross-org id resolves to `NOT_FOUND` with no write). (OBS-214.)
- **FR-215** (ubiquitous) — `getActiveBooking`, `listBookingsByUser`, `listBookings`, `completeBooking`,
  `cancelBooking`, `approvePayment` *shall* be **org-scoped**: a cross-org id never matches → `NOT_FOUND` /
  empty, never a cross-org read or write. (ADR-0004.)

### Admin SoD + revenue (I-021)
- **FR-220** (state-driven, conditional) — *While* the actor's `role ≠ ADMIN`, `approvePaymentAsActor` /
  `completeBookingAsActor` *shall* throw `FORBIDDEN` **before any DB write** (the action layer is the real gate;
  the pure helper mirrors it as a test seam). (OBS-251 — SoD.)
- **FR-221** (event-driven) — *When* an ADMIN approves a `WAITING_CASHIER` booking, the system *shall*
  compare-and-set `paymentStatus WAITING_CASHIER → PAID_CASHIER` and **settle the linked `BOOKING` ledger row to
  `COMPLETED`** in one transaction (so the amount counts toward revenue); a non-`WAITING_CASHIER` row →
  `INVALID_TRANSITION`, a cross-org id → `NOT_FOUND`, neither writes. (OBS-251.)
- **FR-222** (ubiquitous) — `listPendingBookings(orgId)` *shall* return the org's `WAITING_CASHIER` bookings
  (excluding `CANCELLED`), newest first. (OBS-251.)
- **FR-223** (ubiquitous) — `sumRevenueSince(orgId, since)` *shall* sum **only `COMPLETED`** transaction amounts
  for the org since `since` (PENDING excluded) — the source for the dashboard revenue KPIs. (OBS-250.)

### Keycard (I-024 — simulated door)
- **FR-230** (ubiquitous) — The keycard QR value *shall* be a deterministic, **server-signed HMAC** token over
  `${bookingId}|${window}` keyed by a **server-only** secret (`KEYCARD_TOKEN_SECRET`; required in production),
  so a member cannot forge a valid token for another booking or a future window. (OBS-221 — [SEC].)
- **FR-231** (state-driven) — The token *shall* rotate every `TOKEN_WINDOW_MS` (30s) window and differ per
  booking; `generateKeycardToken(bookingId)` *shall* equal `keycardTokenForWindow(bookingId,
  getTokenWindow())`. (OBS-221.)
- **FR-232** (state-driven, conditional) — *While* the member has no `ACTIVE` booking, the keycard surface
  *shall* render the empty state; *while* one exists, it *shall* render the QR + booking details. (OBS-220/221.)

### Print jobs (I-023)
- **FR-240** (event-driven) — *When* a member submits a print job, the system *shall* load the user **within the
  org** (cross-org `userId` → `NOT_FOUND`), compute the total **server-side** via `computePrintTotal` from the
  user's **DB tier** (`BW=Rp500/page`, COLOR `3×`; tier discount `REGULAR 0% / PREMIUM 20% / GOLD 20%`) — never
  a client price — debit `printBalance` by `pages × copies` via a **race-safe conditional UPDATE** guarded
  `printBalance ≥ sheets`, insert a `PENDING` job, and write a `PENDING` `PRINT_JOB` ledger row, all atomic in
  one transaction. (OBS-230.)
- **FR-241** (event-driven, conditional) — *When* the balance is insufficient (`sheets > printBalance`), the
  system *shall* throw `INSUFFICIENT_BALANCE` and **roll back** — no job, no ledger row, no debit. (OBS-230.)
- **FR-242** (ubiquitous) — `submitPrintJob` *shall* validate `fileName` (non-empty, ≤255 chars), `pages`
  (positive int), `copies` (positive int) before any DB work. (OBS-230.)
- **FR-243** (ubiquitous) — `listPrintJobsByUser(orgId, userId)` *shall* return only the caller org+user's jobs,
  newest first. (OBS-231.)

### Unified ledger + member surfaces
- **FR-250** (ubiquitous) — Every money action (`PACKAGE_PURCHASE`, `PRINT_TOPUP`, `BOOKING`, `PRINT_JOB`, and
  `CAFE_ORDER` from spec 0003) *shall* append a row to the unified `transactions` ledger via
  `recordTransaction`, enlistable in the caller's `db.transaction` so the ledger write is **atomic** with the
  domain write. (OBS-241, OBS-250.)
- **FR-251** (ubiquitous) — `listTransactionsByUser(orgId, userId)` (member /history) and
  `listRecentTransactions(orgId)` (admin dashboard feed) *shall* be org-scoped, newest first; cross-org /
  cross-user rows never leak. (OBS-241, OBS-250.)
- **FR-252** (event-driven) — *When* the member dashboard / history / topup surfaces render, they *shall* source
  balances, tier, bookings, and ledger rows from the repositories (no `lib/mock` import). (OBS-240/241.)

### Admin console UI (I-021 surfaces)
- **FR-260** (event-driven) — The admin **Users**, **Pending**, and **Bookings** surfaces *shall* render the
  org-scoped repository reads (tier badge, pending items, active-booking card + count pills + history table) and
  invoke the server actions (approve / complete) for their affordances. (OBS-251/252/253.)

### Non-functional
- **NFR-200** (ubiquitous) — All monetary fields (`priceRupiah`, `amountRupiah`, `discountRupiah`,
  `pricePerPageRupiah`, `ratePerHourRupiah`) and balances (`timeCredits`, `printBalance`) *shall* be **integers
  in Rupiah / whole units**; discount rounding *shall* use `Math.round`.
- **NFR-201** (ubiquitous) — Money is **server-authoritative**: no client-supplied price, amount, total, rate,
  or balance delta is ever trusted; amounts are always recomputed from DB rows server-side. (ADR-0011.)
- **NFR-202** (ubiquitous) — Every balance change and its ledger row *shall* commit **atomically in one
  `db.transaction`** (no partial state where a balance moved but the ledger did not, or vice-versa).
- **NFR-203** (ubiquitous) — All reads and writes *shall* be org-scoped on a server-derived `orgId`; balance
  debits *shall* be **race-safe** (conditional UPDATE / atomic SQL `+`/`−`, not read-then-write). (ADR-0004.)

---

## Acceptance criteria (Given/When/Then) — each maps to an EXISTING test

> AC ids are reused verbatim from the existing tests. **Print uses the 4-digit `AC-023x` ids** already in
> `lib/db/print.int.test.ts`; admin SoD uses `AC-ADM-0x`; admin/member UI uses the `AC-ADM-*-0x` / `AC-14x`
> component ids. Untagged-but-existing tests are listed under "Coverage gaps" rather than given a fabricated id.

### Time-credit packages + top-up (I-020)
- **AC-200** — A member buys a package and their time-credit balance increases (end-to-end).
  Given a logged-in member on /topup,
  When they buy the "5 Hours" package,
  Then their time-credit balance increases by 5. (FR-201) *(curated E2E)*
- **AC-201** — A member submits a print job and it is recorded + balance debited (end-to-end).
  Given a logged-in member on /print with balance ≥ 1,
  When they submit a 1-page B&W job,
  Then the balance decreases by 1 and the job appears in "Riwayat Print". (FR-240, FR-243) *(curated E2E)*

### Booking (I-021)
- **AC-130** — A scheduled booking is priced from the DB rate and ledgered.
  Given a bookable facility in the org,
  When a scheduled booking is created,
  Then `amount = hours × DB-rate`, the booking is `ACTIVE` / `PENDING`, and a `COMPLETED` `BOOKING` ledger row is
  written; `FULL_ROOM` is not bookable online. (FR-210, FR-213)
- **AC-131** — A walk-in booking opens unpriced and waiting-cashier.
  Given a walk-in request,
  When the booking is created,
  Then `endAt=null`, `amount=0`, `paymentStatus=WAITING_CASHIER`, and a `PENDING` `BOOKING` ledger row is
  written. (FR-211)
- **AC-132** — A walk-in's charge is capped at 4 hours.
  Given an ACTIVE walk-in that has run > 4h (and a short one < 4h),
  When it is completed,
  Then the long one charges `4 × rate` and the short one charges `ceil(elapsed) × rate`. (FR-212)
- **AC-133** — A cross-org / unmatched facility is rejected (no write).
  Given a facility that does not exist in the caller's org (by name or cross-org id),
  When a scheduled booking is attempted,
  Then it is rejected with no write. (FR-210, FR-215)
- **AC-134** — Facility + booking reads are org-scoped.
  Given facilities/bookings in two orgs,
  When `listFacilities` / `getActiveBooking` / `listBookingsByUser` run,
  Then only the caller org's rows return (cross-org → null/empty). (FR-215)
- **AC-135** — `completeBooking` / `cancelBooking` are org-scoped and transition-guarded.
  Given a booking in another org (and an ACTIVE one in the caller org),
  When complete/cancel is invoked,
  Then a cross-org id → `NOT_FOUND` (no write) and an ACTIVE caller-org booking flips correctly. (FR-212, FR-214,
  FR-215)

### Admin SoD + revenue (I-021)
- **AC-ADM-01** — A non-ADMIN cannot approve a payment (SoD, no write).
  Given a non-ADMIN actor,
  When `approvePaymentAsActor` is invoked,
  Then it throws `FORBIDDEN` and nothing is written. (FR-220)
- **AC-ADM-02** — Pending payments are org-scoped.
  Given pending bookings in two orgs,
  When `listPendingBookings(orgA)` runs,
  Then org A never sees org B's pending rows. (FR-222, FR-215)
- **AC-ADM-03** — Revenue sums only COMPLETED amounts.
  Given COMPLETED + PENDING ledger rows,
  When `sumRevenueSince` runs,
  Then PENDING amounts are excluded. (FR-223)
- **AC-ADM-04** — ADMIN approve flips payment + settles the ledger row.
  Given a WAITING_CASHIER booking,
  When an ADMIN approves it,
  Then `paymentStatus=PAID_CASHIER` and the linked `BOOKING` ledger row is settled to `COMPLETED`. (FR-221)
- **AC-ADM-05** — Cross-org approve is rejected (no write).
  Given a booking in another org,
  When approve is invoked with the caller's org,
  Then it throws `NOT_FOUND` and nothing is written. (FR-221, FR-215)

### Keycard (I-024)
- **AC-140** — The keycard token is deterministic for `(bookingId, window)`.
  Given a bookingId + window,
  When `keycardTokenForWindow` is called twice,
  Then it returns the same token. (FR-230)
- **AC-141** — The token rotates per 30s window and is booking-bound (unforgeable).
  Given a booking,
  When the window advances (or the booking changes),
  Then the token differs. (FR-230, FR-231)
- **AC-142a** — The keycard surface renders the empty state with no active booking.
  Given no active booking, When the surface renders, Then the "No Active Booking" empty state shows. (FR-232)
- **AC-142b** — The keycard surface renders the QR + details for an active booking.
  Given an active booking, When the surface renders, Then the QR + booking details show. (FR-232)

### Print (I-023)
- **AC-0234** — Submit debits balance, inserts a PENDING job, writes a PRINT_JOB ledger row (atomic).
  Given a member with sufficient balance,
  When a job is submitted,
  Then `printBalance` is debited by `pages × copies`, a `PENDING` job exists, and a `PRINT_JOB` ledger row is
  written — all atomic. (FR-240, FR-250)
- **AC-0235** — Insufficient balance is rejected (no write).
  Given `pages × copies > printBalance` (and the exact-balance boundary),
  When a job is submitted,
  Then it throws with no job / no ledger / unchanged balance (boundary: exact balance is allowed). (FR-241)
- **AC-0236** — Tier discount is computed server-side.
  Given a PREMIUM member and a COLOR job,
  When the total is computed,
  Then the `3×` rate + `20%` tier discount are applied server-side; no client price is trusted. (FR-240,
  NFR-200, NFR-201)
- **AC-0237** — Print history is org-scoped.
  Given jobs in two orgs,
  When `listPrintJobsByUser` runs,
  Then only the caller org+user's jobs return, newest first. (FR-243, FR-215)
- **AC-0238** — A cross-org userId resolves to NOT_FOUND (no write).
  Given an orgB user queried under orgA,
  When a job is submitted,
  Then it throws `NOT_FOUND` with no write. (FR-240, FR-215)

### Member surfaces (dashboard / history / topup) + admin console UI
- **AC-143** — A scheduled-coworking confirm calls the booking action and shows success. (FR-260, FR-210)
- **AC-144** — A booking server-action error surfaces inline (no false success). (FR-260)
- **AC-145** — A Full Room confirm does NOT call the booking action. (FR-213, FR-260)
- **AC-ADM-BK-01..04** — Admin Bookings: active card renders facility+member (01); count pills reflect data (04);
  "Selesaikan Sesi & Bayar" calls complete then refresh (03); history table renders COMPLETED rows (02). (FR-260,
  FR-212)
- **AC-ADM-PEND-01..03** — Admin Pending: renders each pending item (01); empty state (02); Approve calls the
  action per selected id then refresh (03). (FR-260, FR-221)
- **AC-ADM-USERS-01..04** — Admin Users: renders name+tier badge+email (01); search by name/email narrows (02);
  tier filter narrows (03); empty state (04). (FR-260, OBS-253)
- **AC-ADM-ORDERS-01..05** — Admin Orders single-panel layout (carried from spec 0003; the admin shell). (FR-260)

---

## Traceability (AC → owning layer → owning test file, per ADR-0010)

| AC | Owning layer | Owning test file |
|----|--------------|------------------|
| AC-200 | E2E (Playwright) | `e2e/AC-200-member-buys-package.spec.ts` |
| AC-201 | E2E (Playwright) | `e2e/AC-201-member-print-job.spec.ts` |
| AC-130 | Integration (Drizzle/PG) | `lib/db/bookings.int.test.ts` |
| AC-131 | Integration (Drizzle/PG) | `lib/db/bookings.int.test.ts` |
| AC-132 | Integration (Drizzle/PG) | `lib/db/bookings.int.test.ts` |
| AC-133 | Integration (Drizzle/PG) | `lib/db/bookings.int.test.ts` |
| AC-134 | Integration (Drizzle/PG) | `lib/db/bookings.int.test.ts` |
| AC-135 | Integration (Drizzle/PG) | `lib/db/bookings.int.test.ts` |
| AC-ADM-01 | Integration (Drizzle/PG) | `lib/db/admin.int.test.ts` |
| AC-ADM-02 | Integration (Drizzle/PG) | `lib/db/admin.int.test.ts` |
| AC-ADM-03 | Integration (Drizzle/PG) | `lib/db/admin.int.test.ts` |
| AC-ADM-04 | Integration (Drizzle/PG) | `lib/db/admin.int.test.ts` |
| AC-ADM-05 | Integration (Drizzle/PG) | `lib/db/admin.int.test.ts` |
| AC-140 | Unit (Vitest) | `lib/keycard/token.test.ts` |
| AC-141 | Unit (Vitest) | `lib/keycard/token.test.ts` |
| AC-142a | Unit (RTL) | `app/(member)/keycard/KeycardClient.test.tsx` |
| AC-142b | Unit (RTL) | `app/(member)/keycard/KeycardClient.test.tsx` |
| AC-0234 | Integration (Drizzle/PG) | `lib/db/print.int.test.ts` |
| AC-0235 | Integration (Drizzle/PG) | `lib/db/print.int.test.ts` |
| AC-0236 | Integration (Drizzle/PG) | `lib/db/print.int.test.ts` |
| AC-0237 | Integration (Drizzle/PG) | `lib/db/print.int.test.ts` |
| AC-0238 | Integration (Drizzle/PG) | `lib/db/print.int.test.ts` |
| AC-143 | Unit (RTL) | `app/(member)/booking/BookingClient.test.tsx` |
| AC-144 | Unit (RTL) | `app/(member)/booking/BookingClient.test.tsx` |
| AC-145 | Unit (RTL) | `app/(member)/booking/BookingClient.test.tsx` |
| AC-ADM-BK-01..04 | Unit (RTL) | `app/(admin)/admin/bookings/BookingsClient.test.tsx` |
| AC-ADM-PEND-01..03 | Unit (RTL) | `app/(admin)/admin/pending/PendingClient.test.tsx` |
| AC-ADM-USERS-01..04 | Unit (RTL) | `app/(admin)/admin/users/UsersClient.test.tsx` |
| AC-ADM-ORDERS-01..05 | Unit (RTL) | `app/(admin)/admin/orders/page.test.tsx` |
| AC-0239 | Unit (RTL) | `app/(member)/print/PrintClient.test.tsx` |
| AC-0240 | Unit (RTL) | `app/(member)/print/PrintClient.test.tsx` |
| AC-0241 | Unit | `lib/storage/uploads.test.ts` |
| AC-0242 | Unit | `lib/storage/uploads.test.ts` |
| AC-0242b | Unit | `lib/storage/uploads.test.ts` |
| AC-0243 | Unit (node) | `app/(member)/print/actions.test.ts` |
| AC-0244 | Unit (node) | `app/(member)/print/actions.test.ts` |

---

## Coverage gaps (existing tests that assert the behavior but carry **no AC id** — for the Director to tag)

These behaviors **are tested** but the owning `it(...)` titles do not name an AC, so `grep -r AC-XXX` will not
find the proof. They should be back-tagged (rename the test title to lead with a new/assigned AC id and add the
row here) — no new test needed, only an id:

1. **FR-200 `listPackages` org-scope + sort + archived-exclusion** — `lib/db/packages.int.test.ts`
   ("returns only orgA's available packages, sorted by sortOrder, excluding archived + cross-org"; "org isolation
   — orgB call does not return orgA packages"). *Untagged.* Suggest `AC-200a` / `AC-200b`.
2. **FR-201 `purchasePackage` money path + cross-org/archived guard** — `lib/db/packages.int.test.ts`
   (the three `purchasePackage` `it`s). *Untagged.* Suggest `AC-202`.
3. **FR-202 `topUpPrint` increment + invalid-pages reject** — `lib/db/packages.int.test.ts`
   (two `topUpPrint` `it`s). *Untagged.* Suggest `AC-203`.
4. **FR-251 `listTransactionsByUser` org+user scope** — `lib/db/transactions.int.test.ts`
   (two `it`s, both untagged — the header even says "AC-###" literally). Suggest `AC-250`.
5. **FR-252 member-surface render + no-mock-import gates** — `TopupClient.test.tsx`, `DashboardClient.test.tsx`,
   `HistoryClient.test.tsx` (render-from-props + no-`lib/mock` gates). *All untagged.* Suggest `AC-252a/b/c`.
6. **Member /print surface (`PrintClient.tsx`)** — now has component tests in
   `app/(member)/print/PrintClient.test.tsx` (AC-0239: summary rendering, AC-0240: submit + error surface)
   and action tests in `app/(member)/print/actions.test.ts` (AC-0243: file-required guard, AC-0244: upload-before-charge ordering).
   Storage helpers are covered by `lib/storage/uploads.test.ts` (AC-0241: path scoping, AC-0242: MIME validation,
   AC-0242b: magic-byte content validation). This gap is **closed**.

### Recon behavior with NO test (out of scope / simulated — confirm or schedule)
- **Walk-in dashboard "Walk-in Aktif" running banner + provisional charge (OBS-213/240)** — rendered by
  `DashboardClient` but its banner is only asserted at the "renders when a session is passed" level (untagged);
  the live elapsed-time / provisional-charge computation is not unit-pinned.
- **Print job status lifecycle `PENDING → READY → COMPLETED` (OBS-231 `Menunggu`/`Siap Ambil`)** — jobs are
  created `PENDING`; no test advances a job's status (the printer/admin flow is a separate, deferred issue).
- **Booking `PAID_ONLINE` settlement (OBS-214)** — scheduled bookings are created `PENDING`; the simulated
  online-payment settlement path to `PAID_ONLINE` is not exercised by any test (deferred — gateway is simulated).

---

## Out of scope / simulated (external integrations — per ADR-0013, all behind seams; separate owner-gated issues)
- **Payment gateway** (Midtrans / Xendit): online settlement is **simulated** (`PENDING` → settled in-app). No
  real charge/webhook. The `PAID_ONLINE` payment state + the gateway adapter are a deferred issue.
- **Print hardware** (PaperCut / a local mini-PC print server, OBS settings): jobs are recorded `PENDING`; no
  spool/release to a physical printer. Status advancement + the print-server adapter are deferred.
- **WiFi vouchers** (UniFi controller, dashboard SSID/voucher card): the voucher shown on the dashboard is a
  placeholder; auto-provisioning via the UniFi adapter is deferred.
- **Physical dynamic-QR door access**: the keycard token is a server-signed **simulated** credential (FR-230);
  no real door controller is integrated. The door-controller verify endpoint is a deferred issue.
- **Admin CRUD on settings** (membership tiers/discounts, facilities, printers, print pricing — OBS settings
  surface): tiers/discounts/rates are seed/code-managed for now; admin-editable configuration is deferred.
