# Spec 0008 — Tier model correction (four discount dimensions)

- **Status:** Draft (I-041; owner decisions locked in the issue brief).
- **MONEY PATH.** Review requires the money-path reviewer tier and integration proof that the new values flow into
  cafe, print, and booking totals. All business reads/writes are server-authoritative and `org_id`-scoped.
- **Source:** ORIG `MembershipTier`, seed, admin membership API, and discount paths in bookings, cafe orders, and
  print jobs; delta audited in `docs/gap-analysis-original.md` §2.3. Current implementation is the Drizzle
  repository, Supabase migrations, tier editor, and `lib/cafe`/`lib/print` pricing seams.
- **Depends on:** specs 0002, 0006; ADR-0010, ADR-0011, ADR-0015. Booking consumer: I-040.

## Scope

**In:** widen the existing org-scoped `membership_tier_config`; replace guessed seed values; expose all four
percentages through the repository and `/admin/settings/tiers`; preserve the server-resolved cafe eligibility and
print discount mechanics; provide the I-040 booking-pricing read seam.

**Out:** booking pricing implementation (I-040); dynamic tier CRUD or arbitrary tier names; changes to print base
pricing; changes to cafe eligibility; the ORIG POS hardcoded-rate defect; tier display metadata.

## Locked decisions and divergence

The config retains the existing enum `REGULAR | PREMIUM | GOLD`, with one row per `(org_id, tier)`, rather than
ORIG's dynamic tier table. This minimizes migration risk, preserves JWT/profile semantics, and retains the existing
org seam; dynamic tiers are deferred until multi-venue requirements justify them. This decision is a deliberate
**DIV-1** divergence and must be recorded in a small follow-up ADR. ORIG's base/mid/top map to
`REGULAR/PREMIUM/GOLD` respectively.

| Tier | Coworking | Meeting | Cafe | Print |
|---|---:|---:|---:|---:|
| REGULAR | 0% | 0% | 0% | 0% |
| PREMIUM | 10% | 10% | 5% | 5% |
| GOLD | 15% | 15% | 10% | 10% |

Percentages are integer points, not ORIG's floating-point fields. Cafe discount remains gated by an ACTIVE
booking and resolved by `lib/cafe/eligibility.ts`; print remains tier-driven. The ORIG POS hardcoded 15% rate is
ignored as a defect (**DIV-2**), and all monetary rounding follows our integer-Rupiah rules.

## Observations (mined from ORIG; EARS)

- **OBS-500** (ubiquitous) — ORIG's membership tier record shall contain a unique name, display metadata, and four
  discount fields: coworking, meeting-room, cafe, and print, each defaulting to zero.
- **OBS-501** (ubiquitous) — ORIG shall match a user's membership tier by the user's string membership value.
- **OBS-502** (ubiquitous) — ORIG shall keep tier metadata for active state, sort order, color, description, and
  display name in addition to pricing fields.
- **OBS-503** (ubiquitous) — ORIG's seed shall define three tiers with values 0/0/0/0, 10/10/5/5, and 15/15/10/10,
  ordered coworking/meeting/cafe/print.
- **OBS-504** (event-driven) — When ORIG's seed runs, it shall upsert each tier by unique name and update all four
  discounts and display metadata, so a repeat run creates no duplicate tier.
- **OBS-505** (state-driven) — While the ORIG actor is not an ADMIN, each membership-settings GET, POST, PATCH, or
  DELETE shall return unauthorized and perform no membership write.
- **OBS-506** (event-driven) — When an ORIG admin creates a tier, the request shall require both `name` and
  `displayName`, normalize the name to uppercase, and reject an existing name.
- **OBS-507** (event-driven) — When an ORIG admin creates or updates a tier, the API shall parse the four discount
  fields and apply defaults for omitted/falsy values.
- **OBS-508** (event-driven) — When an ORIG admin updates a tier, the API shall update its display metadata, four
  discounts, active flag, sort order, and color.
- **OBS-509** (event-driven) — When an ORIG admin deletes a tier referenced by users, the API shall refuse the delete
  and report the number of referencing users.
- **OBS-510** (event-driven) — When an ORIG admin lists tiers, the API shall return them in ascending sort order.
- **OBS-511** (event-driven, conditional) — When a booking is created, ORIG shall select the meeting discount for a
  meeting room and the coworking discount for a coworking seat.
- **OBS-512** (event-driven, conditional) — When a scheduled ORIG booking is priced, its final price shall be
  `hourly rate × hours × (1 − discount percent / 100)`.
- **OBS-513** (event-driven) — When ORIG prices a member cafe order, it shall resolve the cafe discount from the
  member's tier rather than from a global tier constant.
- **OBS-514** (event-driven, conditional) — When the member has no active session, ORIG shall apply zero cafe
  discount; an active session is required before the tier cafe percentage is used.
- **OBS-515** (event-driven) — When ORIG prices a print job, it shall resolve the print discount from the member's
  tier and persist the resolved percentage with the job.
- **OBS-516** (event-driven) — When ORIG prices print work, it shall multiply chargeable pages by the selected
  color-mode/paper-size rate and use a fallback rate when the matrix has no row.
- **OBS-517** (event-driven) — When ORIG prices a print job, it shall calculate the discount from base cost and
  subtract it from the cost before creating the transaction.
- **OBS-518** (known defect) — ORIG shall use floating-point percentages and unscoped/free-text tier matching, and
  one POS path shall hardcode 15%; these mechanics are not parity requirements for FlowSpace.
- **OBS-519** (ubiquitous) — ORIG's admin tier API shall operate on a global dynamic tier collection, whereas
  FlowSpace shall deliberately retain its enum and org-scoped config as recorded in DIV-1.

## Functional requirements (our delta)

- **FR-520** (ubiquitous) — `membership_tier_config` shall contain non-null integer
  `coworking_discount_pct`, `meeting_discount_pct`, `cafe_discount_pct`, and `print_discount_pct`, each defaulting
  to 0, with unique `(org_id, tier)`, an `org_id` index, and a CHECK constraining every value to 0–100.
- **FR-521** (ubiquitous) — A new ordered Supabase migration shall add the two booking columns, widen the CHECK, and
  update every existing org's rows to the locked values without changing the existing enum or RLS policy.
- **FR-522** (ubiquitous) — `getTierDiscounts(orgId, tier)` shall return all four camel-case percentages and
  `listTierConfig(orgId)` shall return all four for only that org; a missing row shall fail closed to four zeroes.
- **FR-523** (event-driven) — When `updateTierDiscounts` receives any non-integer or value outside `[0,100]`, it
  shall throw `INVALID_PCT:<dimension>` before writing; valid input shall upsert all four values atomically for the
  server-derived org and enum tier.
- **FR-524** (event-driven) — When an ADMIN saves the tier editor, the action shall validate all four values for
  every known tier and persist the complete set in one transaction; any failure shall leave every tier unchanged.
- **FR-525** (event-driven, conditional) — When cafe pricing is eligible under ADR-0011, it shall use the resolved
  tier `cafeDiscountPct` (0/5/10 for the seed); otherwise it shall use 0%, through the existing pricing path.
- **FR-526** (event-driven) — When print pricing runs, it shall use the resolved tier `printDiscountPct` (0/5/10
  for the seed) through the existing `computePrintTotal` path; its mechanic and base-rate configuration are unchanged.
- **FR-527** (cross-reference) — The repository/config seam shall expose `coworkingDiscountPct` and
  `meetingDiscountPct` to I-040. I-040 owns applying them to booking totals and shall not duplicate this model.
- **FR-528** (event-driven) — When an ADMIN opens `/admin/settings/tiers`, each known tier shall show editable
  Coworking, Meeting, Cafe, and Print percentage inputs populated from the org's current config.
- **FR-529** (ubiquitous) — The dev seed shall upsert the locked four-dimensional map idempotently; no stale guessed
  cafe/print defaults shall remain in seed or fallback constants.

## Non-functional requirements

- **NFR-500** — Server-derived session `orgId`, role, and membership tier are authoritative; clients cannot choose an
  org or persist unvalidated money configuration. RLS remains a defense-in-depth backstop.
- **NFR-501** — Configuration is read at pricing time; changing it shall not alter already-persisted order, print-job,
  booking, or transaction totals.
- **NFR-502** — Monetary values remain integer Rupiah; discount is `Math.round(subtotal × pct / 100)` and total is
  subtotal minus discount.
- **NFR-503** — The editor page and save action remain ADMIN-only, with middleware/layout and explicit action checks.
- **NFR-504** — Changed code shall meet the project quality gates, including ≥80% changed-line coverage, typecheck,
  lint, migration reset, and the integration money-path tests required below.

## Acceptance criteria (Given/When/Then; one owning layer per ADR-0010)

### Schema, migration, and seed

- **AC-500** — Given the applied migration, When the table is inspected, Then all four percentage columns exist,
  are integer NOT NULL DEFAULT 0, and the enum remains `REGULAR/PREMIUM/GOLD`. **Integration**.
- **AC-501** — Given a direct database write, When any one of the four percentages is below 0 or above 100, Then
  the CHECK rejects it and the row is unchanged. **Integration**.
- **AC-502** — Given rows containing the spec-0006 guesses, When the widening migration runs, Then every org's
  REGULAR/PREMIUM/GOLD row becomes exactly 0/0/0/0, 10/10/5/5, and 15/15/10/10. **Integration**.
- **AC-503** — Given a clean database, When the dev seed runs twice, Then each org has one row per enum tier with
  the locked values and no duplicate `(org,tier)` row. **Integration**.
- **AC-504** — Given existing RLS and indexes, When the new migration is applied, Then the config retains its
  org-isolation policy, unique `(org_id,tier)` index, and `org_id` lookup index. **Integration**.

### Repository and authorization

- **AC-505** — Given distinct config for orgs A and B, When `listTierConfig(A)` runs, Then it returns only A's rows,
  each with four dimensions. **Integration**.
- **AC-506** — Given no row for `(A, GOLD)`, When `getTierDiscounts(A, GOLD)` runs, Then it returns four zeroes and
  never reads B's row. **Integration**.
- **AC-507** — Given valid values for all four dimensions, When `updateTierDiscounts(A, PREMIUM, values)` runs,
  Then the A/PREMIUM row is upserted with every value and B is unchanged. **Integration**.
- **AC-508** — Given −1, 101, or 12.5 for any named dimension, When `updateTierDiscounts` runs, Then it throws the
  matching `INVALID_PCT:<dimension>` and performs no write. **Unit**.
- **AC-509** — Given one valid and one invalid tier in one ADMIN save, When `savePricingConfigAction` runs, Then the
  transaction rolls back all tier writes (and print-rate writes) rather than partially saving. **Integration**.
- **AC-510** — Given a MEMBER session, When it invokes `savePricingConfigAction`, Then the action throws `FORBIDDEN`
  before any write. **Unit**.
- **AC-511** — Given an ADMIN from org A and a target row in org B, When the action saves A's editor payload, Then no
  B row changes and all persisted rows remain scoped to A. **Integration**.

### Money-path proofs

- **AC-512** — Given eligible ACTIVE-booking members in REGULAR/PREMIUM/GOLD, When equal cafe subtotals are priced,
  Then the resolved discounts are 0%, 5%, and 10% respectively and PREMIUM/GOLD totals are reduced. **Integration**.
- **AC-513** — Given a member without an ACTIVE booking, When the same cafe subtotal is priced, Then its discount is
  0% regardless of its tier config. **Integration**.
- **AC-514** — Given a subtotal whose percentage produces a fraction of a Rupiah, When cafe totals are computed,
  Then the discount is rounded with `Math.round` and total equals subtotal minus that integer. **Unit**.
- **AC-515** — Given equal BW print jobs for REGULAR/PREMIUM/GOLD, When they are priced with the seed config, Then
  the resolved print discounts are 0%, 5%, and 10%. **Integration**.
- **AC-516** — Given a fixed print base cost, When its discount percentage produces a fraction, Then
  `computePrintTotal` rounds the discount and returns integer `discountRupiah` and `totalRupiah`. **Unit**.
- **AC-517** — Given a persisted order or print job, When its tier config is changed, Then its stored total remains
  unchanged while a newly priced item uses the new percentage. **Integration**.
- **AC-518** — Given I-040's booking pricing consumer and PREMIUM/GOLD config, When it reads the repository for a
  coworking seat and meeting room, Then it receives 10%/15% for each applicable dimension and its totals reflect
  those values; booking pricing implementation remains owned by I-040. **Integration (I-040 seam test)**.
- **AC-519** — Given no config row for an otherwise valid member, When cafe or print pricing runs, Then it applies 0%
  rather than an unintended discount. **Integration**.

### Admin editor and model boundary

- **AC-520** — Given seeded config, When an ADMIN renders the editor, Then each tier has four labeled inputs
  (Coworking %, Meeting %, Cafe %, Print %) populated 0/0/0/0, 10/10/5/5, and 15/15/10/10. **Unit (RTL)**.
- **AC-521** — Given an editor change to any one of the four inputs, When Save is submitted, Then the action payload
  contains that dimension for every known tier and the server revalidates it. **Unit**.
- **AC-522** — Given a mid-save validation failure, When the editor receives the action error, Then it shows an error
  state and does not report success or refresh as if the money config saved. **Unit (RTL)**.
- **AC-523** — Given a caller submits a tier outside the enum, When the repository or action validates the payload,
  Then it rejects the value and performs no write. **Unit**.
- **AC-524** — Given a non-admin opens the route, When middleware/layout and the action are evaluated, Then the route
  is denied and the action is independently forbidden. **Unit**.
- **AC-525** — Given a tier config row with a missing optional display concept, When the editor renders, Then it uses
  only the enum tier labels and remains usable without dynamic-tier metadata. **Unit (RTL)**.
- **AC-526** — Given the editor receives a fractional, negative, or over-100 value, When Save is attempted, Then the
  server rejects it rather than relying on HTML min/max or client truncation. **Unit**.
- **AC-527** — Given the seed map is imported by the seed and pricing defaults, When the map is inspected, Then both
  use the same locked four-dimensional values with no 5/5/5 or 0/20/20 guess. **Unit**.
- **AC-528** — Given two orgs with identical tier names, When either admin reads or writes tier config, Then only the
  server-derived org's rows and money paths are affected. **Integration**.
- **AC-529** — Given the implementation is complete, When the issue verification suite runs, Then every AC-500–AC-528
  has exactly one tagged canonical test, including integration proof for cafe, print, and the I-040 booking seam.
  **Unit/integration traceability check**.

## Migration and code delta

Create `supabase/migrations/0010_tier_model.sql` after `0009_money_qty_checks.sql`:

1. Add `coworking_discount_pct integer NOT NULL DEFAULT 0` and `meeting_discount_pct integer NOT NULL DEFAULT 0`.
2. Drop and recreate `membership_tier_config_pct_range` so all four columns are `BETWEEN 0 AND 100`.
3. Update existing rows by enum tier for every org to the locked values; preserve unique/index/RLS behavior.

Keep `lib/db/enums.ts` unchanged. Mirror the columns in `lib/db/schema.ts`. Update `lib/db/tier-config.ts`, the
admin page/client/action types and transaction, and `scripts/seed-supabase.ts`. Use one shared four-dimensional seed
map (and update cafe/print fallback documentation/constants) so fresh seed and fallback behavior cannot drift. The
implementation must update the existing pricing repository integration rather than adding raw client queries.

## Supersedes from spec 0006

- **AC-400:** its guessed seeded values are superseded by AC-502/AC-503; org scoping remains required.
- **AC-402:** its flat 5% seed premise is superseded by AC-512/AC-513; config-driven active-session mechanics remain.
- **AC-403:** its two-field save contract is superseded by AC-507/AC-509/AC-526; ADMIN validation remains.
- **AC-405:** its two-input editor is superseded by AC-520/AC-521.
- **AC-401, AC-404, AC-406, and AC-407:** mechanisms remain valid and are re-proven against the widened model by
  AC-515/AC-516, AC-510, and the applicable existing print-config tests; their old seeded-rate assumptions do not.

## Out of scope and follow-up

Dynamic tier CRUD, arbitrary tier names, tier metadata, booking pricing application, print matrix/printer parity,
POS checkout, and any change to ACTIVE-booking eligibility are excluded. File the small DIV-1 ADR before revisiting
dynamic tiers. No owner-level open question remains: the enum shape and locked seed are approved by this brief.
