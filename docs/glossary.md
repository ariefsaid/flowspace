# Glossary (domain language)

The `grill-with-docs` skill writes confirmed domain terms here. Keep entries short and authoritative.

- **org_id** — the tenancy seam. Single venue today; every business row carries an `org_id` so the app can scale
  to multi-venue/franchise without a rewrite.
- **Time credit** — prepaid hours a member buys in packages and spends across facilities (coworking seat, meeting
  room). The member's balance is a ledger; bookings debit it.
- **Membership tier** — Regular (standard, no discount), and discounted tiers (the original has named tiers with
  discounts on coworking / meeting / cafe / print). Tier names are **brand-supplied** (white-label), not hardcoded.
- **Booking** — a reservation of a seat or meeting room for a time window; may be walk-in (priced at checkout).
- **Cafe order** — food/drink purchase by a member (with tier discount) or a guest (no account). Flows to the
  kitchen/POS as an order with a status.
- **POS** — the operator's point-of-sale screen for counter orders.
- **Pending (payment)** — a transaction awaiting settlement/approval in the admin queue.
- **Print billing** — per-job print charges (pages × B/W|color × paper size), PaperCut-style, with member discount.
- **Dynamic QR access** — a rotating QR code that acts as the member's secure facility access credential.
- **Transaction** — any money event (package purchase, cafe order, print job, booking) with status
  (PENDING / COMPLETED) and amount in IDR (Rp).
