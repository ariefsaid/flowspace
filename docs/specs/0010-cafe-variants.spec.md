# Spec 0010 — Cafe nuances parity

- Status: Draft (for I-044)
- Source: `docs/gap-analysis-original.md` §2.5 and the ORIG cafe, guest, POS, KDS, API, Prisma schema, and seed
  implementation; current FlowSpace cafe repository, actions, surfaces, migration, and Supabase seed.
- Scope: priced per-item variants, order notes, server-authoritative POS member lookup/discount, and variant-enabled
  database menu seed. Existing FlowSpace menu content, order codes, lifecycle, Realtime KDS, quantity cap, and guest
  flow remain.
- Depends on: spec 0003 (cafe domain), ADR-0010, ADR-0011, ADR-0012, ADR-0015, and the shipped booking/tier
  eligibility path.

## Observations (ORIG)

- **OBS-700** — When a menu item is read, ORIG exposes `hasVariants` and an optional `variantConfig` JSON value.
- **OBS-701** — When ORIG displays a configured item, `variantConfig.variants` contains named groups with a
  `required` flag and named options with a numeric `priceAdjustment`.
- **OBS-702** — When ORIG seeds beverages, Temperature is required with Hot `+0` / Cold `+Rp3.000`, and Sugar is
  required with No Sugar, Less Sugar, and Normal Sugar, each `+0`.
- **OBS-703** — When a member selects a variant item, ORIG opens a modal, defaults each group to its first option,
  displays option adjustments, and keeps different combinations as separate cart lines.
- **OBS-704** — When a guest selects a variant item, ORIG provides the same Temperature/Sugar selection and cart
  combination behavior.
- **OBS-705** — When ORIG's member order endpoint receives a line, it uses the client `itemPrice` when present,
  including a client-calculated variant adjustment.
- **OBS-706** — When ORIG's guest order endpoint receives a line, it likewise uses client `itemPrice` for the line
  subtotal.
- **OBS-707** — When ORIG persists an order, each JSON line carries the menu id/name, quantity, price/subtotal,
  a display variant string, and selected-variant details; `CafeOrder` itself has no normalized order-item table.
- **OBS-708** — When a member checks out, ORIG accepts an optional order `notes` value.
- **OBS-709** — When a guest checks out, ORIG accepts notes and prefixes the stored value with the guest name.
- **OBS-710** — When the KDS renders an order with notes, ORIG shows them in a prominent yellow highlighted note block.
- **OBS-711** — When a member order is created, ORIG gates the configured tier cafe discount on an ACTIVE booking.
- **OBS-712** — When a cashier searches POS, ORIG looks up a member by email and reports the active booking/facility.
- **OBS-713** — When ORIG's POS finds an active booking, its response hardcodes a 15% discount rather than reading the
  member tier configuration.
- **OBS-714** — When ORIG POS renders its menu, it imports a hardcoded `CAFE_MENU` rather than the menu table.
- **OBS-715** — When ORIG POS submits an order, it sends subtotal and discount values from the client and the route
  calculates from those values.
- **OBS-716** — When ORIG creates a guest order, it displays a `G{YYYYMMDD}-{rand3}` order number while the persisted
  order has no equivalent normalized code field.
- **OBS-717** — When ORIG advances KDS work, the visible lifecycle is PENDING → PREPARING → READY → COMPLETED and
  the page refreshes orders on a ten-second interval.
- **OBS-718** — When an ORIG admin opens cafe orders, a delete action is available.
- **OBS-719** — When ORIG's seed runs, it upserts 15 cafe items and enables the shared beverage variants on most
  made-to-order drinks; its seed menu is not the current FlowSpace 31-item menu.

## Divergences from ORIG

- FlowSpace shall recompute base price plus validated option adjustments on the server, rather than trusting ORIG's
  client `itemPrice` (OBS-705/706); this is an intentional money-integrity fix.
- FlowSpace POS shall use the same-org member's configured tier discount and the DB menu, rather than ORIG's hardcoded
  15% response and hardcoded POS menu (OBS-713/714).
- FlowSpace retains its normalized six-character code, `NEW` lifecycle, status-based non-delete model, and separate
  `guestName` field instead of ORIG's guest display code, admin hard-delete, and guest-name note prefix (OBS-716/718).

## Functional requirements (EARS)

- **FR-720** (ubiquitous) — The system shall model `variant_config` as nullable JSONB on `cafe_menu_items` using
  `{variants:[{name:string,required:boolean,options:[{name:string,priceAdjustment:integer}]}]}`; group and option
  names shall be unique within an item and adjustments shall be integer Rupiah values.
- **FR-721** (event-driven) — When a member, guest, or POS line selects variants, the server shall validate every
  selected group/option against that menu item's live config, require every `required` group, reject unknown groups,
  unknown options, malformed configs, and variants on `has_variants=false` items, and never use client prices.
- **FR-722** (event-driven) — When an order is priced, the server shall calculate each unit as the live base price
  plus the validated option adjustments, then calculate quantity subtotals and the order subtotal from those units;
  discount rounding shall remain `Math.round(subtotalRupiah * discountPct / 100)`.
- **FR-723** (event-driven) — When a validated line is persisted, the system shall snapshot its menu name, computed
  unit price, quantity, and chosen options (group name, option name, and adjustment) so later menu edits cannot alter
  the order or its audit display.
- **FR-724** (event-driven) — When an order is entered from member, guest, or POS, the system shall trim optional
  notes, persist non-blank notes, and expose them to the KDS; member and guest actions shall accept notes and POS
  checkout shall provide a notes control.
- **FR-725** (event-driven) — When an ADMIN cashier submits POS checkout with a member email, the server shall resolve
  that email within the cashier's org, require the resolved user to be a MEMBER, check the member's ACTIVE booking,
  and apply that member tier's configured `cafe_discount_pct` only when the booking exists; otherwise discount is 0%.
- **FR-726** (ubiquitous) — POS checkout shall receive live DB menu ids/variant configs, resolve the member by email
  server-side rather than trusting a client user id or discount, and persist order, lines, totals, and its existing
  transaction atomically through the cafe repository.
- **FR-727** (event-driven) — When an order is successfully created, FlowSpace shall retain its 6-character lowercase
  base36 code, `NEW` initial status, org uniqueness, server-side `org_id` scope, and existing member/guest semantics.
- **FR-728** (state-driven) — While an order is visible in the KDS, the barista view shall show its snapshotted options
  and notes, with notes visually highlighted, while retaining Realtime refresh and only NEW → PREPARING → READY →
  COMPLETED forward transitions.
- **FR-729** (event-driven) — When the FlowSpace seed runs, it shall preserve all 31 current menu items and prices.
  Because the FlowSpace menu encodes temperature (and sweetness for teas) as separate same-price items
  (`es-*`/`*-panas` pairs; `*-manis`/`*-tawar`), the seed shall NOT add a Temperature group; it shall idempotently
  add only the Sugar group (Normal/Less/No Sugar, each `+0`) to made-to-order COFFEE and NON_COFFEE items,
  excluding the three bottled coffee slugs (`kopi-hitam-botol`, `cappuccino-botol`, `kopi-susu-aren-botol`),
  `soda-gembira`, `aqua-330ml`, and the unsweetened teas (`es-teh-tawar`, `teh-tawar-hangat`); all other categories
  remain non-variant. Priced adjustments (OBS-702's Cold `+Rp3.000` pattern) are exercised by test fixtures, not
  the seed.

## Non-functional requirements

- **NFR-044-01** (ubiquitous) — All monetary values and option adjustments shall be non-negative integers in Rupiah;
  the server shall ignore client subtotal, total, unit-price, discount-rate, and option-adjustment fields.
- **NFR-044-02** (ubiquitous) — Every menu/order/item read and write shall use the server-derived `orgId`; the POS
  email lookup shall return only minimal same-org member data and shall not disclose cross-org users.
- **NFR-044-03** (ubiquitous) — The existing quantity limit of 99 per line shall apply to variant and non-variant lines;
  malformed or excessive notes shall be rejected before a write, with a maximum of 500 Unicode characters after trim.
- **NFR-044-04** (ubiquitous) — New writes shall use the generic option snapshot as the canonical variant representation;
  existing nullable `temperature`/`sugar` columns remain only as compatibility projections for old rows and shall not
  be the source of pricing truth. No UI change may introduce raw design tokens outside `DESIGN.md`.

## Acceptance criteria (owning layer per ADR-0010)

- **AC-700** — Given a valid config, when it is parsed, then required groups, option names, and integer adjustments are available to the menu clients. *(unit)*
- **AC-701** — Given a variant item, when the member opens its picker, then every configured group is shown, required groups are marked, and each group defaults to its first option. *(unit)*
- **AC-702** — Given a variant item, when the guest opens its picker, then it has the same configured groups/options and defaults. *(unit)*
- **AC-703** — Given Cold with `priceAdjustment=3000`, when the picker calculates a unit price, then base price plus Rp3.000 is displayed and submitted only as a selection, not as an authoritative price. *(unit)*
- **AC-704** — Given the same item with Hot and Cold selections, when both are added, then they remain separate cart lines and quantities merge only for identical selections. *(unit)*
- **AC-705** — Given a required group omitted or an unknown option supplied, when the server validates a line, then it rejects the line with no order write. *(unit)*
- **AC-706** — Given a fixture item at Rp22.000 with a Cold `+Rp3.000` option selected and 2× a Rp25.000 no-variant item, when server pricing runs, then subtotal is Rp75.000 (22.000+3.000+50.000), and no client price can change it. *(unit)*
- **AC-707** — Given a valid variant order, when it is persisted, then each line has a generic option snapshot containing group, option, and adjustment values. *(integration)*
- **AC-708** — Given a menu item later renamed or repriced, when its prior order is read, then line name and computed unit price remain the original snapshots. *(integration)*
- **AC-709** — Given a `hasVariants=false` item, when an order line is submitted without options, then it prices at its live base price; supplied options are rejected. *(unit)*
- **AC-710** — Given a guest with a non-empty name and notes, when checkout succeeds, then a no-discount `NEW` order stores the guest name, notes, options, and server total. *(integration)*
- **AC-711** — Given an eligible member and notes, when member checkout succeeds, then the order stores notes, member ownership, validated options, and the tier-resolved discount. *(integration)*
- **AC-712** — Given blank or whitespace notes, when any public checkout runs, then notes are stored as null; a value over 500 trimmed characters is rejected. *(unit)*
- **AC-713** — Given POS checkout with notes, when the cashier submits it, then the note is persisted on the same order as the server-computed POS total. *(integration)*
- **AC-714** — Given a KDS order with notes and selected options, when the barista page renders, then both are visible and notes use the highlighted note treatment. *(unit)*
- **AC-715** — Given a member email in the cashier's org with no ACTIVE booking, when POS lookup runs, then it returns the member with 0% discount. *(integration)*
- **AC-716** — Given a member email with an ACTIVE booking, when POS lookup runs, then it returns that member's configured tier `cafe_discount_pct`, not a hardcoded rate. *(integration)*
- **AC-717** — Given a nonexistent or cross-org email, when POS lookup runs, then it returns not-found without user data or discount. *(integration)*
- **AC-718** — Given a POS client sends a forged user id, subtotal, or discount, when checkout runs, then the server resolves the email/menu and ignores the forged monetary/customer values. *(integration)*
- **AC-719** — Given POS renders, when the page loads, then every visible item comes from the org-scoped DB menu and carries its live variant config; no mock/static cafe menu is imported. *(unit)*
- **AC-720** — Given a POS member with an ACTIVE booking selects Cold, when checkout runs, then option adjustment, tier discount, final total, notes, and line snapshots are persisted atomically. *(integration)*
- **AC-721** — Given a seeded org, when the seed is rerun, then all 31 menu rows remain present with unchanged prices and idempotent variant configuration. *(integration)*
- **AC-722** — Given any successfully created order, when its code is inspected, then it is six lowercase base36 characters and unique within its org. *(unit)*
- **AC-723** — Given a member, guest, and POS order, when each is created, then each starts `NEW` and the existing customer/guest semantics remain intact. *(integration)*
- **AC-724** — Given a NEW order, when a barista advances it repeatedly, then only NEW→PREPARING→READY→COMPLETED succeeds and a further advance is rejected. *(integration)*
- **AC-725** — Given a line quantity of 99, when it is submitted, then it succeeds; given 100, then it is rejected without a write. *(unit)*
- **AC-726** — Given a KDS subscribed to the order's org channel, when an order is inserted or updated, then Realtime causes the rendered KDS data to refresh without cross-org events. *(unit)*
- **AC-727** — Given an archived/unavailable menu row, when any member, guest, or POS checkout references it, then the server rejects it even if the client still has its id. *(integration)*
- **AC-728** — Given concurrent order creation with the same generated code, when a collision occurs, then the repository retries within its existing bounded code-generation policy and never writes duplicate org codes. *(integration)*
- **AC-729** — Given the current 31-item FlowSpace seed, when variant flags are inspected, then exactly the items FR-729 includes carry the Sugar-only config, no seeded item carries a Temperature group, and the excluded bottled, soda, water, and unsweetened-tea items are non-variant. *(integration)*

## Migration / schema delta

Add the next ordered Supabase migration after `0009_money_qty_checks.sql` and update `lib/db/schema.ts` in lockstep:

- Add nullable `variant_config jsonb` to `cafe_menu_items`; valid non-null values follow FR-720. Existing rows default
  to null and `has_variants=false`.
- Add nullable `notes text` to `cafe_orders`, with a database length check of at most 500 characters. Blank input is
  normalized to null by the repository/action boundary.
- Add `variant_options jsonb NOT NULL DEFAULT '[]'` to `cafe_order_items`. Its canonical shape is an ordered array of
  `{variantName, optionName, priceAdjustmentRupiah}` snapshots. Retain the existing nullable `temperature` and `sugar`
  columns for compatibility and backfill/projection only; generic JSONB is the minimal shape that supports ORIG's
  arbitrary variant groups without adding a column for each future group.
- Keep existing org, status, code uniqueness, order/item indexes, RLS backstop, and Realtime publication. Extend the
  repository and transaction boundary rather than adding client-controlled API fields.

## Cross-reference and out of scope

No AC in `docs/specs/0003-cafe-domain.spec.md` is fully superseded. AC-110/111 are extended with validated option
adjustments; AC-112/113 carry the notes/options snapshots; AC-115 remains the member eligibility authority; AC-121
adds notes/options to the KDS journey; AC-120/122–125 and AC-100/101 remain unchanged. This issue resolves the POS
checkout/member-discount OQ-2 and keeps the original 15-item seed out of the menu decision.

Out of scope: menu CRUD UI (I-042), payment gateway changes, order deletion, replacing the 6-character code,
changing the forward-only lifecycle, replacing Realtime KDS, and changing the 31-item FlowSpace menu or tier model.

Open questions: None; the menu, variant exclusions, generic snapshot, note limit, and tier-driven POS discount are
owner-locked by the issue brief.
