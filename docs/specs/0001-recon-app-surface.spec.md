# Spec 0001 — Recon: live-product surface map

- Status: Draft (initial recon; deeper per-surface capture pending per issue)
- Source: the live product (admin recon session, 2026-06-15). Framework confirmed: **Next.js App Router** +
  Tailwind + `next/font`; backend Postgres. Locale **Bahasa Indonesia**.
- Purpose: enumerate every surface to replicate, as the backlog's source of truth. Each surface gets its own
  detailed spec (`docs/specs/00NN-<surface>.spec.md`) with full `OBS-###`/`AC-###` before build.

> **Masking note:** observations describe *structure/behavior*, not client brand. Brand strings, tier names, and
> logos seen in recon are white-labeled (ADR-0002). Recon screenshots are stored outside the repo.

## Route map (observed)
**Public:** `/` (landing) · `/login` · `/signup` · `/cafe/guest` (guest cafe order).
**Member (auth):** dashboard + booking + time-credit packages + cafe order + print + QR access *(member-side
routes need a member-account recon pass — admin session lands on `/admin`)*.
**Admin (auth, role=admin):** `/admin` (dashboard) · `/admin/users` · `/admin/bookings` · `/admin/pending` ·
`/admin/pos` · `/admin/orders` · `/admin/print-reports` · `/admin/settings`.

## Observations

### Landing `/`
- OBS-001: Sticky top nav: brand (logo + name) left; "Masuk" (login) + "Daftar" (signup) buttons right.
- OBS-002: Hero on a teal→emerald gradient: pill badge, large heading with one word accent-colored (orange),
  subheading, two CTAs ("Mulai Sekarang"→/signup, "Masuk Member"→/login), and a secondary "Order Cafe sebagai
  Guest"→/cafe/guest.
- OBS-003: "Features" section (white): 6 cards — Time Credit, Meeting Room, Coworking, Print (PaperCut),
  Digital/QR Access, Cafe Discount — each an icon + title + description.
- OBS-004: "Membership" section: 3 tier cards (one badged "Paling Populer"/most-popular) each listing
  included benefits + discount percentages.
- OBS-005: Orange full-bleed CTA band ("Buat Akun Gratis"→/signup), then dark footer with brand + copyright.

### Auth `/login`, `/signup`
- OBS-010: Login card centered: heading + subheading, Email field (icon), Password field (icon), "Masuk" submit,
  "Belum punya akun? Daftar" link. Same chrome (nav/footer) as landing.
- OBS-011: On successful admin login, redirect to `/admin`.

### Admin dashboard `/admin`
- OBS-020: Admin top nav replaces public nav with links: Dashboard, Pengguna, Booking, Menunggu, POS, Pesanan,
  Print, Pengaturan; right side shows the admin's name + "Keluar" (logout).
- OBS-021: 4 KPI tiles row 1: Today's Bookings, Active Sessions, Pending Payments, Total Users (each value + icon).
- OBS-022: 3 KPI tiles row 2: Today's / Weekly / Monthly Revenue (formatted `Rp` IDR).
- OBS-023: "Recent Transactions" list: per row — user name, description (e.g. `Print: <file> (<pages> hal, BW,
  A4) - diskon 20%`, `Booking: <table> - walk-in`, `Pesanan Cafe - N item(s)`, `Purchased N Hours package`),
  localized date/time (Indonesian, `22 Mei 2026, 15.01`), amount (`Rp`), and a status badge (COMPLETED / PENDING).

### Admin sub-pages (inventory — need per-surface recon before build)
- OBS-030: `/admin/users` — user management (list/find/edit; tier & credits). *Detail pending.*
- OBS-031: `/admin/bookings` — all bookings management. *Detail pending.*
- OBS-032: `/admin/pending` — pending-payment approval queue. *Detail pending.*
- OBS-033: `/admin/pos` — point-of-sale for counter cafe orders (with member discount). *Detail pending.*
- OBS-034: `/admin/orders` — cafe order list + fulfillment status. *Detail pending.*
- OBS-035: `/admin/print-reports` — per-user print jobs + charges (pages × B/W|color × size, discount). *Detail pending.*
- OBS-036: `/admin/settings` — pricing/packages/discount/tier configuration. *Detail pending.*

### Cross-cutting (observed)
- OBS-040: Currency is **IDR** rendered `Rp 1.200` (dot thousands separator). Dates/times localized `id-ID`.
- OBS-041: Discounts apply by membership tier across cafe (5%), print (5–20%), coworking/meeting (10–50%).
- OBS-042: Print charging model is PaperCut-style: pages × color-mode × paper size, then tier discount.
- OBS-043: Time-credit packages (e.g. "5 Hours") are purchasable; bookings/usage debit the credit balance.

## Open recon items (before specing each surface)
1. Member-side experience (dashboard, booking flow, package purchase, cafe order, QR access) — needs a **member**
   account recon pass (admin session does not show it).
2. Guest cafe flow `/cafe/guest` — full ordering/payment journey.
3. Exact design tokens (colors, type scale, spacing, radius, shadows) → `DESIGN.md` (design-architect Foundation).
4. Each admin sub-page's table columns, filters, actions, modals, and empty/error states.
5. Data model: entities + relations inferred from the above (users, memberships, credit ledger, bookings,
   rooms/seats, cafe menu/orders, print jobs, transactions, settings) → `prisma/schema.prisma`.
