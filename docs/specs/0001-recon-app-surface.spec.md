# Spec 0001 — Recon: live-product surface map

- Status: Draft (admin + member + barista surfaces mapped via I-001; deeper per-surface capture pending per issue)
- Source: the live product (admin + member recon sessions, 2026-06-15). Framework confirmed: **Next.js App Router** +
  Tailwind + `next/font`; backend Postgres. Locale **Bahasa Indonesia**.
- Purpose: enumerate every surface to replicate, as the backlog's source of truth. Each surface gets its own
  detailed spec (`docs/specs/00NN-<surface>.spec.md`) with full `OBS-###`/`AC-###` before build.

> **Masking note:** observations describe *structure/behavior*, not client brand. Brand strings, tier names, and
> logos seen in recon are white-labeled (ADR-0002). Recon screenshots are stored outside the repo.

## Route map (observed)
**Public:** `/` (landing) · `/login` · `/signup` · `/cafe/guest` (guest cafe order).
**Member (auth):** `/dashboard` · `/booking` · `/cafe` · `/print` · `/keycard` (Kartu Akses) · `/topup` · `/history`
(Riwayat). *(captured I-001, member acct.)*
**Barista/cafe-ops (auth):** `/barista` — kitchen display system (live order queue). *(captured I-001.)*
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

## Member surfaces (recon I-001 — member acct, status: ACTIVE walk-in session)
Member app chrome: same top nav, links Dashboard / Booking / Cafe / Print / Kartu Akses / Top Up / Riwayat;
right side member name + "Keluar".

### Dashboard `/dashboard`
- OBS-050: Greeting ("Selamat Datang, Budi!") + active-session subtitle.
- OBS-051: **Active walk-in card** (when a session is live): facility ("Meja F"), live running duration timer
  (HH:MM:SS), "Biaya sementara (pembulatan per jam)" running cost, "Tarif: Rp 15.000/jam", "Maks: 4 jam", hint
  "Menuju kasir untuk menyelesaikan sesi & bayar".
- OBS-052: **QR Akses Pintu & Print** card — rotating QR with a live "Refreshes in Ns" countdown (~30s cycle).
- OBS-053: **Akses Cepat** — quick links (Order cafe; Print/Fotocopy w/ "Saldo: N halaman").
- OBS-054: **WiFi Access** card — SSID + voucher code with copy buttons + instructions.
- OBS-055: **Menu Utama** grid — Order Cafe / Booking / Print / Top Up.
- OBS-056: **Stat tiles** — Time Credits ("139.0 jam tersisa"), Print Balance ("68 halaman"), Membership
  (tier badge, e.g. `PREMIUM`, "Tarif standar"), Status Sesi ("AKTIF / Fasilitas ready").
- OBS-057: **Riwayat Booking** preview list (facility + datetime + status badge) + "Lihat Semua" → `/history`.

### Booking `/booking`
- OBS-060: 4-step wizard stepper: **Tipe → Waktu → Pilih Tempat → Konfirmasi**.
- OBS-061: Step 1 options in two groups: **Walk-in** (Walk-in Coworking — show booking no. to cashier, duration
  charged on finish max 4h; Walk-in Meeting Room — start now, pick duration) and **Reservasi Jadwal** (Coworking
  Seat from Rp20.000/jam via interactive seat map; Meeting Room from Rp120.000/jam w/ projector+whiteboard;
  Full Room Event — "Hubungi untuk harga").

### Cafe `/cafe`
- OBS-070: Header "FlowSpace Cafe" + cart button; active-session banner "diskon 5% untuk semua pesanan cafe".
- OBS-071: Category filter tabs: Semua / Coffee / Food / Non-Coffee / Snack.
- OBS-072: Menu item cards: emoji icon, name, category, price, description. Drinks show **"Pilih Variant"** (+pilihan:
  hot/cold, sugar level) → opens a variant modal; fixed items show **"Tambah"** (add directly).
- OBS-073: "Pesanan Terakhir" panel: status (Selesai), date, item × qty (+ variant detail e.g. "(Cold, Less
  Sugar)"), total. Sample menu+prices captured (Americano 25k, Latte 32k, Cappuccino 30k, Espresso 20k, Matcha
  35k, Chocolate 28k, OJ 22k, Lemon Tea 20k; Tempe Orek 4.5k, Croissant 25k, Sandwich 35k, Salad 45k, Nasi Rames
  40k, Mie Goreng 38k; Tahu Goreng 25k, Chicken Wings 35k).

### Print `/print`
- OBS-080: "Saldo Print Anda: N lembar" header. Upload (drag&drop; PDF/Word/Excel/PowerPoint/JPG/PNG/TIFF).
- OBS-081: **Opsi Print**: Jumlah Halaman Dokumen, Halaman yang Dicetak ("all"/range), Jumlah Copy (±), Mode Warna
  (Hitam Putih B&W / color), Ukuran Kertas (A4…), Printer (select), Print Dua Sisi (duplex toggle).
- OBS-082: **Ringkasan** (live): Total Halaman, Mode, Kertas, Copy, Harga Dasar, **Total**, "Saldo Setelah Print",
  "Submit Print Job". Base shown Rp500/page B&W A4 (NB: historical txns show Rp1.200/page at "diskon 20%" — pricing
  source of truth is admin Settings; reconcile when specing print).
- OBS-083: "Riwayat Print Terbaru": jobs w/ status (Menunggu / Siap Ambil), filename, pages • price.

### Kartu Akses (keycard) `/keycard`
- OBS-090: "Digital Key Card — Scan to access your booked facility". With an active **scheduled** booking it shows
  the access QR; otherwise empty state "No Active Booking" + "Book a Space" CTA (note: the dashboard QR card and
  the keycard QR appear to be distinct surfaces — reconcile which bookings activate the keycard).

### Top Up `/topup`
- OBS-100: Two balance tiles (Time Credits / Print Balance) act as tabs to switch the purchase list.
- OBS-101: **Time Credit Packages**: 5h Rp75.000 (15k/h), 10h Rp140.000 (14k/h), 20h Rp260.000 (13k/h, "Popular"),
  50h Rp600.000 (12k/h) — volume discount per hour. (Print-balance top-up packages under the Print tab — capture when specing.)

### Riwayat (history) `/history`
- OBS-110: Two tabs with counts: **Booking (N)** and **Transaksi (N)**.
- OBS-111: Booking rows: facility, datetime range, "Durasi: N jam", a **status** badge (ACTIVE / COMPLETED /
  CANCELLED) and a **payment** badge (WAITING CASHIER / PAID CASHIER / PAID ONLINE). Facilities observed: Meja A–I,
  Meeting Room A, Coworking Seat N, Full room.

## Barista / cafe-ops `/barista` (KDS)
- OBS-120: "Dashboard Barista — FlowSpace Cafe" header with **Sound On** toggle + **Refresh**.
- OBS-121: Three live counters/columns: **Pesanan Baru** (new) · **Sedang Disiapkan** (preparing) · **Siap Diambil**
  (ready). Empty state "Belum ada pesanan / Pesanan baru akan muncul di sini". Real-time order queue (orders flow
  here from member/guest cafe + admin POS; barista advances status; "Sound On" implies new-order audio alert).
- OBS-122: **Authz finding** — the member account (Budi) could open `/barista` and the member nav rendered; route
  may be **un-gated** by role. Flag for the auth/RBAC spec (I-004): `/barista` and `/admin/*` must be role-gated server-side.

## Open recon items (before specing each surface)
1. Guest cafe flow `/cafe/guest` — full ordering/payment journey (no-account path).
2. Variant modal contents (drink hot/cold + sugar options + price deltas) and cart/checkout flow on `/cafe`.
3. Booking wizard steps 2–4 (time picker, interactive seat map, confirmation/payment) — capture each step.
4. Exact design tokens (colors, type scale, spacing, radius, shadows) → `DESIGN.md` (design-architect Foundation, I-002).
5. Each admin sub-page's table columns, filters, actions, modals, and empty/error states.
6. Pricing source of truth & discount matrix (print base vs 20%; cafe 5%; coworking/meeting tier discounts) from admin Settings.
7. Data model → `prisma/schema.prisma` (I-003): users, memberships+tiers, time-credit ledger, print-balance ledger,
   bookings (walk-in vs scheduled, payment state machine), rooms/seats, cafe menu+variants+orders+order-status,
   print jobs, transactions, wifi vouchers, QR/keycard tokens, settings.
