# Spec 0003 — Cafe domain (DB-backed menu + order lifecycle)

- Status: Draft (for I-022)
- Depends on: spec 0002 (auth/session/middleware/repository seam, merged in I-004); ADR-0004, ADR-0010, ADR-0011,
  ADR-0012, ADR-0013, ADR-0014, ADR-0015 (ADR-0001/0003 superseded — the original Prisma/NextAuth stack is no longer
  live; see `docs/adr/README.md`).
- Source of behavior: the live product's cafe surfaces (recon) for `OBS-*`; net-new **server-side write behavior**
  (order creation, server-computed totals, status lifecycle, server-side authz on the mutation) as `FR-*`.
- Purpose: replace the hardcoded cafe MOCK (`lib/mock/cafe.ts`, `lib/mock/barista.ts`, inline `adminOrders`) with a
  real Prisma-backed menu and a working order lifecycle across the member, guest, POS, barista, and admin surfaces —
  **preserving the existing pixel-perfect UI** (wire behavior; do not restyle). This is the first domain vertical on
  top of the I-004 foundation.

> **Masking note (ADR-0002).** The seed menu carries only generic, non-client-identifying item names/prices already
> committed in `lib/mock/cafe.ts`. No client brand, tier code, or source URL enters the schema, seed, or copy.

## Scope
**In:**
- Prisma models `CafeMenuItem`, `CafeOrder`, `CafeOrderItem` + enums `CafeCategory`, `CafeOrderStatus`,
  `DrinkTemperature`, `SugarLevel`; one reversible migration; seed the menu from `lib/mock/cafe.ts`.
- Repository seam `lib/db/cafe.ts` — typed, `org_id`-scoped: `listMenu`, `getOrder`, `listOrders`, `createOrder`,
  `advanceOrderStatus` (+ `setOrderStatus` for the admin free-set select).
- Pure domain logic `lib/cafe/pricing.ts` (server-side totals + 5% discount) and `lib/cafe/status.ts` (the lifecycle
  state machine + order-code generation).
- Server actions `app/cafe/actions.ts` (placeOrder for member + guest) and `app/barista/actions.ts`
  (advanceOrderStatus) / `app/(admin)/admin/orders/actions.ts` (setOrderStatus) — all with a **server-side role +
  ownership check**, never trusting client-supplied `orgId`, totals, or role.
- Wiring the five surfaces to read live data and submit real orders (RSC reads from `lib/db/cafe`; existing client
  components keep their interactivity and call the server actions).

**Out (follow-up issues; tracked as OQ/FU below):** payment/checkout settlement; real-time push to the KDS
(poll/manual-refresh is the MVP — FU-1); ~~booking/“active session” domain (the 5% discount eligibility seam is
stubbed server-side — FU-2 / OQ-1)~~ **[RESOLVED 2026-06-21: the booking domain shipped and `resolveDiscountEligibility`
now consults `getActiveBooking` — see AC-115]**; print & transactions domains; admin menu CRUD (menu is seed-managed for now —
FU-3); POS member-discount rate reconciliation (POS mock shows 10%, member cafe shows 5% — OQ-2).

## Roles (server-trusted, from spec 0002)
`Role = { MEMBER, ADMIN, BARISTA }`, carried in the session (`session.user.{id,role,orgId}`). The barista status
mutation requires `role ∈ {BARISTA, ADMIN}`; the admin orders mutation requires `role = ADMIN`; a member may place
an order for themselves but may **not** mutate order status.

---

## Functional requirements (EARS)

### Menu (DB-backed reads)
- **FR-100** (ubiquitous) — The schema *shall* define `CafeMenuItem(id, orgId→Organization, name, emoji,
  category: CafeCategory, priceRupiah: Int, description, hasVariants: Boolean, available: Boolean default true,
  archivedAt: DateTime?, createdAt, updatedAt)` with camelCase fields `@map`'d to snake_case and `@@index([orgId])`,
  `@@index([orgId, category])`. The migration *shall* be reversible. (Realizes the data side of `OBS-072`/`OBS-073`/
  `OBS-130`/`OBS-140`.)
- **FR-101** (ubiquitous) — `lib/db/cafe.ts#listMenu(orgId)` *shall* return only the caller-org's non-archived,
  `available` menu items, ordered by `category` then `name`; the client *shall never* supply `orgId`.
- **FR-102** (event-driven) — *When* the member `/cafe`, guest `/cafe/guest`, and admin `/admin/pos` surfaces render,
  the system *shall* source their menu from `listMenu` (DB), not from `lib/mock/cafe.ts`. (Realizes `OBS-072`,
  `OBS-130`, `OBS-140`.)
- **FR-103** (ubiquitous) — The dev seed *shall* upsert the captured menu (the 16 items + prices in `lib/mock/cafe.ts`,
  drinks `hasVariants=true`) into the seeded org, idempotently, so all three surfaces render against real rows. POS
  display-name overrides and the `tempe-orek` hide stay in the FE (`OBS-130` note); the seed is the canonical menu.

### Order placement (server-computed totals)
- **FR-110** (ubiquitous) — The schema *shall* define `CafeOrder(id, orgId→Organization, code: String, customerUserId:
  String? →AppUser, guestName: String?, status: CafeOrderStatus default NEW, subtotalRupiah: Int, discountRupiah: Int
  default 0, totalRupiah: Int, createdAt, updatedAt)` and `CafeOrderItem(id, orderId→CafeOrder onDelete Cascade,
  menuItemId: String? →CafeMenuItem, nameSnapshot: String, qty: Int, unitPriceRupiah: Int, temperature:
  DrinkTemperature?, sugar: SugarLevel?)`, with `@@index([orgId])`, `@@index([orgId, status])`,
  `@@index([orgId, createdAt])` on `CafeOrder` and `@@index([orderId])` on `CafeOrderItem`, `@@unique([orgId, code])`.
  Reversible migration.
- **FR-111** (event-driven) — *When* a request to place an order is received, the system *shall* compute the
  `subtotalRupiah`, `discountRupiah`, and `totalRupiah` **server-side** from the org's live menu prices and the
  submitted line quantities/variants — it *shall never* trust client-supplied prices or totals; each line snapshots
  `nameSnapshot` and `unitPriceRupiah` from the looked-up `CafeMenuItem` at creation time.
- **FR-112** (event-driven, conditional) — *When* a **member** (authenticated `role=MEMBER/ADMIN/BARISTA` placing
  their own order) places an order **and** the server-resolved discount eligibility is true, the system *shall* apply
  a **5%** discount: `discountRupiah = round(subtotalRupiah * 0.05)`, `totalRupiah = subtotalRupiah − discountRupiah`,
  and set `customerUserId = session.user.id`, `guestName = null`. (Realizes the `OBS-070` "diskon 5%" banner as real
  server logic.) Discount eligibility is resolved **server-side**; the client `hasActiveSession` flag is UX only and
  *shall not* be trusted (ADR-0011, FU-2/OQ-1 — until the booking domain exists, eligibility is a server-controlled
  input defaulting to ineligible).
- **FR-113** (event-driven, conditional) — *When* a **guest** (no session) places an order via `/cafe/guest`, the
  system *shall* require a non-empty `guestName`, set `customerUserId = null`, apply **no** discount
  (`discountRupiah = 0`, `totalRupiah = subtotalRupiah`), and persist the order. (Realizes `OBS-140`.)
- **FR-114** (ubiquitous) — Every placed order *shall* be created with `status = NEW`, a unique-per-org `code`
  (a short lowercase token, e.g. `#vohwrk`, matching the original `OBS-034` format), and at least one line; an order
  with zero valid lines *shall* be rejected without a write.
- **FR-115** (ubiquitous) — `lib/db/cafe.ts#createOrder` *shall* persist the order and its items in a single
  transaction scoped to `orgId`; the client *shall never* supply `orgId`, `code`, or any monetary total.

### Order lifecycle (status machine + server-side authz)
- **FR-120** (ubiquitous) — `CafeOrderStatus = { NEW, PREPARING, READY, COMPLETED, CANCELLED }`. The forward
  lifecycle *shall* be `NEW → PREPARING → READY → COMPLETED`; `advanceOrderStatus` *shall* move an order to exactly
  the next forward state and *shall* reject (no write) any non-adjacent transition (e.g. `NEW → READY`,
  `COMPLETED → …`).
- **FR-121** (state-driven, conditional) — *While* the actor's `role ∈ {BARISTA, ADMIN}`, an `advanceOrderStatus`
  request for an order in the actor's org *shall* advance it one forward step and persist the new status. (Realizes
  the `OBS-120/121` KDS "Mulai Siapkan" / "Tandai Siap" / "Pesanan Diambil" actions.)
- **FR-122** (state-driven, conditional) — *While* the actor's `role` is `MEMBER`, any order-status mutation
  (`advanceOrderStatus` / `setOrderStatus`) *shall* be denied server-side (throw/forbid, no write) — even for the
  member's own order, and even if the FE affordance is reachable. (Closes the data side of `OBS-122`: gating is
  server-side, not UI-only.)
- **FR-123** (ubiquitous) — `advanceOrderStatus`/`setOrderStatus` *shall* be `orgId`-scoped: an actor *shall not* be
  able to read or mutate an order belonging to another org (cross-org lookup returns null → forbid, no write).
- **FR-124** (event-driven) — *When* an `ADMIN` sets an order status via the `/admin/orders` select, the system
  *shall* permit any status in `CafeOrderStatus` (the admin override is not constrained to forward-only), scoped to
  the admin's org, server-side. (Realizes the `OBS-034` free-set status select.)

### Reads for the ops surfaces
- **FR-130** (ubiquitous) — `lib/db/cafe.ts#listOrders(orgId, opts?: { statuses?, limit? })` *shall* return only the
  caller-org's orders (with their items), newest first, optionally filtered to a status set; the barista KDS reads the
  `{NEW, PREPARING, READY}` set, the admin orders page reads all. (Realizes `OBS-121`, `OBS-034`.)
- **FR-131** (ubiquitous) — `lib/db/cafe.ts#getOrder(orgId, id)` *shall* return the org-scoped order + items or null
  for a cross-org / missing id.

### Observed UI carried forward (no behavior change — wiring only)
- **OBS-070..073 / OBS-130 / OBS-140 / OBS-120..122 / OBS-034 (carried forward):** the existing pixel-perfect cafe,
  guest, POS, barista, and admin-orders UIs render unchanged; only their data source (mock → DB) and submit/advance
  affordances (no-op → server action) change.

### Non-functional
- **NFR-100** (ubiquitous) — Server-computed monetary fields (`subtotalRupiah`, `discountRupiah`, `totalRupiah`,
  `unitPriceRupiah`) *shall* be integers in Rupiah (no floats); discount rounding *shall* use `Math.round`.
- **NFR-101** (ubiquitous) — All five surfaces *shall* keep their current `DESIGN.md`-token styling; no raw hex/px and
  no visual diff is introduced by this issue (verified by the round-2 design re-review).

---

## Acceptance criteria (Given/When/Then)

### Menu reads from DB
- **AC-100** — Menu reads come from the repository (org-scoped, available-only).
  Given a seeded org with the captured menu and one `archivedAt`/`available=false` item,
  When `listMenu(orgId)` is called,
  Then it returns only that org's non-archived, available items ordered by category then name, and never another org's
  items. (FR-101, FR-103)
- **AC-101** — All three menu surfaces render DB menu (no mock import).
  Given the seeded menu,
  When the member `/cafe`, guest `/cafe/guest`, and admin `/admin/pos` pages render,
  Then the rendered menu reflects the repository result and none of the three modules import `lib/mock/cafe`.
  (FR-102) *(component render owns the "renders the passed menu" assertion; the no-mock-import is a static check.)*

### Member order — server-side 5% discount
- **AC-110** — Subtotal/discount/total are computed server-side from menu prices.
  Given an order of known lines (e.g. 1×Latte 32000 + 2×Croissant 25000),
  When `computeOrderTotals(lines, { discountEligible: false })` runs,
  Then `subtotalRupiah = 82000`, `discountRupiah = 0`, `totalRupiah = 82000`, ignoring any client-sent total. (FR-111)
- **AC-111** — Eligible member order applies exactly 5%.
  Given the same lines and `discountEligible: true`,
  When `computeOrderTotals` runs,
  Then `discountRupiah = round(82000 * 0.05) = 4100` and `totalRupiah = 77900`. (FR-112, NFR-100)
- **AC-115** — Discount eligibility is resolved server-side from an active coworking session (OBS-070).
  Given the session user, When `resolveDiscountEligibility(user)` runs,
  Then it returns `true` only for a `MEMBER` who has an `ACTIVE` booking (consulted org-scoped via
  `getActiveBooking`), and `false` for guests, non-members, and members with no active session — never trusting the
  client. (Activates the ADR-0011 seam; supersedes the FU-3 "dormant until booking" deferral.)
- **AC-112** — A member order persists with the member as customer and server totals.
  Given an authenticated member and a valid line list,
  When `createOrder` persists the order (eligible=false in the no-booking MVP),
  Then a `CafeOrder` exists with `customerUserId = member.id`, `guestName = null`, `status = NEW`, a unique per-org
  `code`, and `subtotal/discount/total` equal to the server computation (never a client value), with line snapshots
  of `nameSnapshot`/`unitPriceRupiah`. (FR-111, FR-112, FR-114, FR-115)

### Guest order — name captured, no discount
- **AC-113** — Guest order captures name and applies no discount.
  Given a guest checkout with `guestName = "Sari"` and valid lines,
  When the order is placed,
  Then a `CafeOrder` exists with `guestName = "Sari"`, `customerUserId = null`, `discountRupiah = 0`,
  `totalRupiah = subtotalRupiah`, `status = NEW`. (FR-113, FR-114)
- **AC-114** — A guest order with an empty name is rejected.
  Given a guest checkout with a blank `guestName`,
  When the order is placed,
  Then no `CafeOrder` is written and the action returns a validation error. (FR-113)

### Lifecycle + KDS
- **AC-120** — Forward transitions are the only legal `advance` moves.
  Given the status machine,
  When `nextStatus` is evaluated for each status,
  Then `NEW→PREPARING`, `PREPARING→READY`, `READY→COMPLETED`, and `COMPLETED→null` (no further advance); a
  non-adjacent jump is not produced. (FR-120)
- **AC-121** — A new order appears in the barista KDS as NEW.
  Given a member places an order,
  When the barista opens `/barista`,
  Then the order is listed in the "Pesanan Baru" (NEW) column with its code and lines. (FR-114, FR-130) *(curated E2E)*
- **AC-122** — Barista advances NEW→PREPARING→READY→COMPLETED and the change persists.
  Given a NEW order and an actor with `role=BARISTA`,
  When `advanceOrderStatus` is called three times,
  Then the order's status becomes PREPARING, then READY, then COMPLETED, each persisted org-scoped; a fourth call is
  rejected. (FR-120, FR-121, FR-123)

### Server-side authz + tenancy (the security ACs)
- **AC-123** — A MEMBER cannot advance order status (server-side deny).
  Given an actor with `role=MEMBER` (even the order's own customer),
  When `advanceOrderStatus`/`setOrderStatus` is invoked for that order,
  Then the call is denied server-side (throws/forbids), no write occurs, and the status is unchanged. (FR-122)
- **AC-124** — Order status mutation is org-scoped (no cross-org mutation).
  Given an order in org B and an actor (BARISTA) whose session org is A,
  When `advanceOrderStatus(orgA, orderB.id)` is invoked,
  Then the lookup returns null, the call forbids, and org B's order is unchanged. (FR-123)
- **AC-125** — `listOrders`/`createOrder` are org-scoped.
  Given two orgs each with orders,
  When `listOrders(orgA)` runs and a `createOrder` is made in org A's context,
  Then only org A's orders are returned and the new order's `orgId = A`; org B's orders never appear. (FR-115, FR-130)

---

## Traceability (owning layer per ADR-0010 — full task-level table in the plan)
| AC | Owning layer | Why |
|----|--------------|-----|
| AC-100 | Integration (Prisma) | org-scoped, available-only filter against a real test DB |
| AC-101 | Unit (RTL) | component renders the passed menu prop; no-mock-import is a static grep gate in the plan |
| AC-110, AC-111 | Unit (Vitest) | pure pricing/discount math, no DB |
| AC-112, AC-113, AC-114 | Integration (Prisma) | order-creation + customer/guest persistence contract at the data layer |
| AC-120 | Unit (Vitest) | pure status-machine function |
| AC-121 | E2E (Playwright) | the one curated cross-stack journey: member places order → appears in barista KDS as NEW |
| AC-122 | Integration (Prisma) | status-transition persistence contract against a real test DB |
| AC-123 | Integration (Prisma) | server-side authz deny + no-write proof (member cannot mutate) |
| AC-124, AC-125 | Integration (Prisma) | cross-org isolation on mutate + reads |

## Open questions (need Director/owner sign-off)
- **OQ-1 (discount eligibility seam):** the 5% member discount is gated on an "active coworking session" that has **no
  DB domain yet** (booking is a later vertical). MVP: `createOrder` takes a server-resolved `discountEligible` boolean
  that **defaults to `false`** (no member discount applied in this issue), with the seam wired so the booking vertical
  flips it on. Confirm: ship member orders at full price now (discount math unit-tested, wired but dormant), vs. block
  this vertical on booking? **Recommended: ship dormant** (ADR-0011). (FU-2)
- **OQ-2 (POS discount rate):** member `/cafe` banner says **5%**; the POS mock hardcodes **10%**. The canonical
  member cafe discount is 5% (OBS-070). Confirm POS should also use 5% server-side (treat the 10% mock as a recon
  artifact to reconcile), or keep POS out of scope this issue (wire POS read-only menu + leave its checkout dormant).
  **Recommended: POS reads live menu; POS checkout deferred to a POS-specific issue** to avoid guessing its discount
  rule. (FU-3)
  - **Resolution (2026-06-21):** POS now reads the **live** menu from `listMenu` (resolved); POS **checkout remains
    deferred** to a POS-specific issue — `createOrder` from `/admin/pos` is not yet wired.
- **OQ-3 (order-code format):** generate a 6-char lowercase base36 token rendered as `#xxxxxx` (matches `OBS-034`
  `#vohwrk`), uniqueness enforced by `@@unique([orgId, code])` with a bounded retry on collision. Confirm acceptable
  vs. a monotonic per-day counter (ADR-0012).
- **OQ-4 (KDS refresh):** MVP refreshes the barista KDS via the existing manual "Refresh" button + `router.refresh()`
  (poll/refresh, no websockets). Confirm websocket/SSE is a follow-up (FU-1), not this issue.
- **OQ-5 (admin-orders delete):** the admin orders UI has a "Hapus" button. Per the charter (soft-archive over
  hard-delete, Admin-only, SoD), wiring delete is **out of scope** this issue (leave as a no-op/dormant) and tracked
  as a follow-up that adds `archivedAt` semantics + an integration proof. Confirm.
