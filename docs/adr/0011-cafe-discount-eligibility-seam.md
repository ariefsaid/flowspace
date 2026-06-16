# ADR-0011 — Cafe member discount: server-resolved eligibility seam (dormant until booking exists)

- Status: Accepted
- Date: 2026-06-16
- Issue: I-022 (cafe domain)

## Context
`OBS-070` shows a member-cafe banner: *"Anda sedang dalam sesi aktif! Nikmati diskon 5% untuk semua pesanan cafe."*
The 5% discount is conditional on the member having an **active coworking session** (a walk-in / scheduled booking in
progress). I-022 is the **first** domain vertical; the booking/session domain does **not** exist in the schema yet
(it is a later issue). The charter forbids trusting client-supplied state for money: the FE `currentMember.activeSession`
flag is mock UX state and must never decide a server-side total.

We must (a) compute the discount **server-side**, (b) not invent a booking model now, and (c) not paint ourselves into
a corner when booking arrives.

## Decision
1. **The discount rate and math live in pure server logic.** `lib/cafe/pricing.ts#computeOrderTotals(lines,
   { discountEligible })` is the single source of truth: `subtotal = Σ qty·unitPrice`; `discount = discountEligible
   ? Math.round(subtotal * 0.05) : 0`; `total = subtotal − discount`. The 5% constant lives here, unit-tested.
2. **Eligibility is a server-resolved boolean input, not client state.** `placeOrder` resolves `discountEligible`
   server-side via `lib/cafe/eligibility.ts#resolveDiscountEligibility(session)`. **In I-022 this function returns
   `false`** (no booking domain → no way to prove an active session → no discount). The member-cafe banner remains a
   UX hint only; it does not flip the server flag.
3. **Guests are never eligible.** A request with no session → `discountEligible = false`, unconditionally.
4. **The seam is wired but dormant.** When the booking vertical lands, `resolveDiscountEligibility` starts consulting
   the bookings repository (e.g. "is there an ACTIVE session for `session.user.id` right now?") and the 5% turns on
   with **zero change** to `computeOrderTotals`, `createOrder`, or any surface — only the eligibility resolver changes.

## Consequences
- Member orders ship at **full price** in I-022, with the discount math written, unit-tested (AC-111), and wired —
  but returning `false` until booking exists. This is honest (we never fake a discount the system can't justify) and
  reversible (one function flips).
- No throwaway booking model is invented under deadline pressure; the money path is correct from day one.
- Trade-off: the green discount banner is shown by the existing FE based on mock `activeSession`, so the FE may *show*
  a 5% promise the server does not yet apply. This is a known, documented UX/seam gap (spec OQ-1, FU-2), not a security
  hole — the server is authoritative and applies 0%. The banner's truthfulness is restored when booking lands. The
  design re-review (round 2) is informed of this so it is not flagged as drift.
- `computeOrderTotals` is pure and DB-free, so the discount/rounding ACs (AC-110/AC-111) are owned at the **unit**
  layer, not pushed to integration or e2e.
