# Jobs-To-Be-Done — the role × job-story map (Lens D oracle)

The `design-reviewer`'s **Lens D (Product/Intent)** grades each screen against the job story for that screen's
primary role. Lens D has no opinion of its own — it grades the screen against the row below.

Job-story form: *"When [situation], a [role] wants to [motivation], so they can [outcome]."*

## §1 Roles
- **Member** — a registered user who books facilities, holds a time-credit balance, orders cafe, prints.
- **Guest** — an unregistered visitor who can only place a cafe order.
- **Admin/Operator** — runs the venue: monitors operations, manages users/bookings, approves pending payments,
  runs the cafe POS, fulfills orders, reviews print billing, configures settings.

## §2 Screen-by-screen job rows (the oracle)
> Captured from recon of the live product (`docs/specs/0001-recon-app-surface.spec.md`). Expand per surface as
> issues are specced — each new screen MUST add its row here before design round-2.

| Screen / route | Primary role | Job story |
|---|---|---|
| Landing `/` | Visitor | When evaluating the space, a visitor wants to see facilities, membership tiers, and a way in (sign up / log in / guest order), so they can decide and act in one step. |
| Login `/login`, Signup `/signup` | Visitor | When returning or joining, a user wants to authenticate quickly, so they can reach their workspace. |
| Guest cafe `/cafe/guest` | Guest | When they only want food/drink, a guest wants to order without an account, so they can pay and be served. |
| Member dashboard | Member | When starting a session, a member wants to see their time-credit balance and next booking, so they can decide what to do now. |
| Booking flow | Member | When they need a room/seat, a member wants to pick a time and confirm against their credits, so they can secure the space. |
| Admin dashboard `/admin` | Admin | When opening the day, an admin wants today's bookings, active sessions, pending payments, users, and revenue at a glance, so they can act on what's off. |
| Users `/admin/users` | Admin | When managing membership, an admin wants to find a user and adjust their account/tier/credits, so they can resolve a request. |
| Bookings `/admin/bookings` | Admin | When running the floor, an admin wants to see and manage all bookings, so they can avoid conflicts. |
| Pending `/admin/pending` | Admin | When money is owed, an admin wants the queue of pending payments to approve/settle, so the ledger stays correct. |
| POS `/admin/pos` | Admin | When a customer orders at the counter, an admin wants to ring up items fast (with member discounts), so they can take payment. |
| Orders `/admin/orders` | Admin | When fulfilling, an admin wants the order list with status, so they can prepare and complete each one. |
| Print reports `/admin/print-reports` | Admin | When reconciling print, an admin wants per-user print jobs and charges, so they can verify billing. |
| Settings `/admin/settings` | Admin | When configuring the venue, an admin wants to set prices/packages/discounts, so policy is enforced everywhere. |

## §3 Calibration (the class of defect Lens D must catch)
A screen can pass code review + security + Lenses A/B/C and still fail intent: the right data in the wrong place
for the job, an analytic with no adjacent lever, or analogous objects with inconsistent interaction paradigms.
Grade against the job row, not against "does it look fine."
