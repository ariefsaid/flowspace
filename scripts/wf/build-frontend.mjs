export const meta = {
  name: 'build-frontend-replica',
  description: 'Build the pixel-perfect FlowSpace frontend: foundation → parallel page builders → verify+fix',
  phases: [
    { title: 'Foundation', detail: 'tokens, utils, mock data, UI primitives, headers, layouts, route stubs' },
    { title: 'Pages', detail: 'one agent per surface, built to DESIGN.md + recon screenshots (parallel)' },
    { title: 'Verify', detail: 'typecheck + lint + build; fix until green' },
  ],
};

const ROOT = '/Users/ariefsaid/Coding/rumah-advokat';
const SHOT = `${ROOT}/review/recon`;

// ---- Shared contract every agent must honor (foundation API + conventions) ----
const CONTRACT = `
PROJECT: FlowSpace — a pixel-perfect replica of a coworking+cafe SaaS. Next.js 15 App Router + React 19 + TS +
Tailwind v4 + pnpm. App at repo ROOT (${ROOT}). White-labeled: render brand via brand.config.ts (\`brand.name\`),
NEVER hardcode any client brand. Locale id-ID, currency "Rp" with dot thousands.

DESIGN TOKENS: read ${ROOT}/DESIGN.md (token source of truth). It maps to standard Tailwind palette classes:
primary teal-500/600, accent gradient orange-500→600, borders slate-200, text slate-950 / gray-900 headings,
rounded-xl (12px), shadow-sm cards / shadow-md raised, sticky glass nav (backdrop-blur-md bg-white/80 border-b
border-slate-200 h-[65px]). NO raw hex/px — use the Tailwind classes named in DESIGN.md.

FOUNDATION API (Phase-1 creates these; Phase-2 ONLY imports them, never edits them):
- import { cn } from "@/lib/cn"               // clsx + tailwind-merge
- import { formatRupiah, formatDateID, formatDateRangeID } from "@/lib/format"
- import { brand } from "@/brand.config"      // brand.name -> "FlowSpace"
- Mock data + types under @/lib/mock/* (e.g. menuItems, creditPackages, bookings, transactions, members,
  adminStats, recentTransactions, baristaOrders, currentMember, printJobs, wifiInfo). Types in @/lib/mock/types.
- UI primitives under @/components/ui/*:
    Button  props: { variant?: 'primary'|'accent'|'outline'|'ghost'|'danger', size?: 'sm'|'md'|'lg', className?, ...button } (accent = orange gradient + shadow-md)
    Card    props: { variant?: 'default'|'highlight'|'info'|'muted', className?, children }   (highlight = border-2 border-teal-500 shadow-md; info = border-blue-200 bg-blue-50)
    Badge   props: { tone: 'completed'|'pending'|'active'|'cancelled'|'paid'|'info'|'neutral', className?, children }
    StatTile props: { label, value, unit?, icon: LucideIcon, accent?: 'teal'|'orange'|'blue'|'green'|'purple' }
    Input, Select  (rounded-xl border-slate-200 h-10), Tabs (client: {tabs:{key,label,count?}[], value, onChange}),
    Stepper ({steps:string[], current:number}), BrandMark (logo tile + brand.name).
- Layout headers under @/components/layout/*: PublicHeader, MemberHeader, AdminHeader, Footer.
- Route-group layouts already wrap pages with the right header; page files render ONLY page content (no header/footer).

ICONS: use lucide-react. Lists/data: use the @/lib/mock data (frontend-first; no DB calls). Interactive bits
('use client') only where needed (tabs, steppers, counters, cart, toggles).

HARD RULES: Do NOT run \`pnpm build\`, \`pnpm install\`, or \`pnpm dev\`. Do NOT edit foundation files, other agents'
route files, package.json, or config. Write clean TS that compiles (correct imports, no unused vars — eslint runs
with --max-warnings=0). Match the recon screenshot closely (layout, spacing, colors, copy in Indonesian, icons).
Keep client-brand text out — use brand.name.`;

phase('Foundation');
const foundation = await agent(`${CONTRACT}

YOU ARE THE FOUNDATION BUILDER (Phase 1). Build the entire shared foundation so page builders can run in parallel.
Read ${ROOT}/DESIGN.md and ${ROOT}/docs/specs/0001-recon-app-surface.spec.md first. Skim a couple of recon
screenshots in ${SHOT}/ (landing.png, m-dashboard.png) to calibrate the look.

Create EXACTLY this, production-quality, matching DESIGN.md tokens:

1) ${ROOT}/lib/cn.ts — cn() via clsx + tailwind-merge.
2) ${ROOT}/lib/format.ts — formatRupiah(n:number):string => "Rp 75.000" (id-ID, dot thousands, no decimals);
   formatDateID(d:Date|string):string => "22 Mei 2026, 15.01" (id-ID, 24h, dot time sep); formatDateRangeID(a,b).
3) ${ROOT}/lib/mock/types.ts + data files under ${ROOT}/lib/mock/ exporting realistic Indonesian mock data drawn
   from the recon spec (OBS-*). Provide AT LEAST:
   - currentMember (name "Budi Santoso", tier "PREMIUM", timeCredits 139, printBalance 68, activeSession {table:"Meja F", tarifPerHour:15000, maxHours:4, startedAt})
   - menuItems[] (cafe): {id,name,emoji,category:'Coffee'|'Food'|'Non-Coffee'|'Snack',price,description,hasVariants:boolean} using the items+prices in OBS-072/073.
   - creditPackages[] (5h/75000, 10h/140000, 20h/260000 popular, 50h/600000) per OBS-101.
   - bookings[] (history) + bookingStatus/paymentStatus per OBS-110/111 (Meja A–I, Meeting Room A, Coworking Seat N).
   - transactions[] (recent) per OBS-023 (print/booking/cafe/package, amount, status COMPLETED|PENDING, datetime).
   - adminStats {todayBookings,activeSessions,pendingPayments,totalUsers,todayRevenue,weeklyRevenue,monthlyRevenue} per OBS-021/022.
   - baristaOrders[] (can be empty array for empty-state) per OBS-120/121.
   - wifiInfo {ssid:"PasificOcean", voucher:"6070202085"}; printJobs[] per OBS-083.
4) ${ROOT}/components/ui/*: Button, Card, Badge, StatTile, Input, Select, Tabs (client), Stepper, BrandMark —
   EXACTLY the prop signatures in the contract. Tailwind-only styling per DESIGN.md.
5) ${ROOT}/components/layout/*: PublicHeader (brand + "Masuk"/"Daftar" buttons), MemberHeader (client component:
   nav Dashboard /dashboard, Booking /booking, Cafe /cafe, Print /print, Kartu Akses /keycard, Top Up /topup,
   Riwayat /history with lucide icons + active state via usePathname; right: member name + "Keluar"),
   AdminHeader (nav Dashboard /admin, Pengguna /admin/users, Booking /admin/bookings, Menunggu /admin/pending,
   POS /admin/pos, Pesanan /admin/orders, Print /admin/print-reports, Pengaturan /admin/settings + "Keluar"),
   Footer (dark bg-slate-900 text white, brand + © 2026 + tagline). Sticky glass nav per DESIGN.md.
6) Route-group layouts:
   - ${ROOT}/app/(public)/layout.tsx -> <PublicHeader/> + children + <Footer/>
   - ${ROOT}/app/(member)/layout.tsx -> <MemberHeader/> + children (container mx-auto px-4 py-6)
   - ${ROOT}/app/(admin)/layout.tsx  -> <AdminHeader/> + children (container)
   MOVE the existing ${ROOT}/app/page.tsx OUT (delete it) so the landing builder can create app/(public)/page.tsx
   without a duplicate "/" route. Keep app/layout.tsx (root, fonts) and app/globals.css.
7) STUB pages (simple "Halaman ... segera hadir" placeholder using Card, so nav never 404s) for routes NOT built
   this wave: ${ROOT}/app/(admin)/admin/users, /bookings, /pending, /pos, /orders, /print-reports, /settings
   (each app/(admin)/admin/<seg>/page.tsx), and ${ROOT}/app/(public)/cafe/guest/page.tsx stub.
   (The (admin)/admin/page.tsx dashboard, member pages, barista, landing, auth are built by other agents — do NOT create those.)

VERIFY YOUR OWN FILES compile in isolation by reading them back for import/type correctness (do NOT run pnpm build).
Report: the exact list of files created, and the FINAL prop signatures of each ui primitive (so page builders match).`, { label: 'foundation', phase: 'Foundation' });

log('Foundation done. Fanning out page builders…');

// ---- Phase 2: one agent per surface, parallel ----
phase('Pages');
const pageTask = (label, files, shot, obs, extra) => () => agent(`${CONTRACT}

FOUNDATION IS BUILT. Here is the foundation builder's report of the final API — match it EXACTLY:
<<FOUNDATION_REPORT>>
${foundation}
<<END_REPORT>>

YOU BUILD: ${label}. Reference screenshot (READ IT to match pixels): ${shot ? `${SHOT}/${shot}` : '(no screenshot — build from the spec OBS items below + DESIGN.md)'}
Recon spec items to honor: ${obs} (read ${ROOT}/docs/specs/0001-recon-app-surface.spec.md for the detail).
Create/own ONLY these file(s): ${files}
${extra || ''}
Build it pixel-close to the screenshot: same layout, spacing, colors (DESIGN.md tokens), Indonesian copy, lucide
icons, all visible states. Use @/lib/mock data and the foundation UI primitives. Add 'use client' only where
interactivity is required. Do NOT touch foundation/other files or run build/install. Report files written + any
assumption you made.`, { label, phase: 'Pages' });

const pages = await parallel([
  pageTask('landing /', `${ROOT}/app/(public)/page.tsx (+ optional section components under components/marketing/)`, 'landing.png', 'OBS-001..005',
    'Sections: glass nav (PublicHeader handles it), hero (teal gradient, pill badge, h1 with one word in orange, two CTAs + guest-cafe link), "Semua yang Anda Butuhkan" 6 feature cards, "Paket Membership" 3 tier cards (middle = highlight "Paling Populer"), orange full-bleed CTA band, footer (layout handles). Tier names come from mock/brand — keep generic-ish.'),
  pageTask('auth /login + /signup', `${ROOT}/app/(public)/login/page.tsx and ${ROOT}/app/(public)/signup/page.tsx`, null, 'OBS-010..011',
    'Centered card: BrandMark/icon, "Selamat Datang" heading + subtitle, Email + Kata Sandi inputs (icon-prefixed), full-width teal "Masuk" button, "Belum punya akun? Daftar" link. Signup mirrors it (Nama, Email, Kata Sandi, tier select, "Daftar" + "Sudah punya akun? Masuk"). Client form, no real auth (frontend-first) — on submit, router.push to /dashboard (login) or /login (signup).'),
  pageTask('member /dashboard', `${ROOT}/app/(member)/dashboard/page.tsx (+ components/member/* you own e.g. ActiveSessionCard, AccessQrCard, WifiCard)`, 'm-dashboard.png', 'OBS-050..057',
    'Greeting; ACTIVE walk-in card with LIVE running timer (client, ticking HH:MM:SS) + running cost; QR access card with ~30s "Refreshes in Ns" countdown (use qrcode.react QRCodeSVG); WiFi card (ssid+voucher copy buttons); quick-access + Menu Utama grid; 4 StatTiles; Riwayat Booking preview + "Lihat Semua".'),
  pageTask('member /booking', `${ROOT}/app/(member)/booking/page.tsx (+ components/member/booking/* you own)`, 'm-booking.png', 'OBS-060..061',
    'Stepper (Tipe→Waktu→Pilih Tempat→Konfirmasi). Build Step 1 fully (Walk-in group: Walk-in Coworking, Walk-in Meeting Room; Reservasi Jadwal group: Coworking Seat Rp20.000/jam, Meeting Room Rp120.000/jam, Full Room Event "Hubungi untuk harga"). Steps 2-4: build a reasonable client wizard (time pick, simple seat grid, confirm summary) with mock — clicking a type advances the stepper. Make it interactive (client).'),
  pageTask('member /cafe', `${ROOT}/app/(member)/cafe/page.tsx (+ components/member/cafe/* incl a VariantModal + Cart)`, 'm-cafe.png', 'OBS-070..073',
    'Header + cart button + active-session 5% discount banner; category filter tabs (Semua/Coffee/Food/Non-Coffee/Snack) filtering menuItems; item cards (emoji,name,category,price,desc; "Pilih Variant" opens a modal with hot/cold + sugar options for drinks, "Tambah" adds directly); a cart drawer/panel with totals (apply 5%); "Pesanan Terakhir" recent orders. Fully client/interactive.'),
  pageTask('member /print', `${ROOT}/app/(member)/print/page.tsx (+ components/member/print/* you own)`, 'm-print.png', 'OBS-080..083',
    'Saldo header; upload dropzone (drag&drop UI, accept the listed formats — no real upload needed); Opsi Print (Jumlah Halaman, Halaman Dicetak, Jumlah Copy ±, Mode Warna select, Ukuran Kertas select, Printer select, Duplex toggle); LIVE Ringkasan (Total Halaman/Mode/Kertas/Copy/Harga Dasar/Total/Saldo Setelah Print) recomputing from inputs + "Submit Print Job"; "Riwayat Print Terbaru" list. Client/interactive.'),
  pageTask('member /topup + /keycard + /history', `${ROOT}/app/(member)/topup/page.tsx, ${ROOT}/app/(member)/keycard/page.tsx, ${ROOT}/app/(member)/history/page.tsx (+ components/member/* you own)`, 'm-topup.png', 'OBS-090, OBS-100..101, OBS-110..111',
    'TOPUP (m-topup.png): two balance tiles act as tabs (Time Credits / Print Balance) switching the package list; Time Credit Packages cards (5/10/20/50h, 20h "Popular") with per-hour subprice; client tab state. KEYCARD (m-keycard.png): "Digital Key Card" — with active scheduled booking show QRCodeSVG, else empty state "No Active Booking" + "Book a Space" CTA. HISTORY (m-history.png): Tabs Booking(N)/Transaksi(N); booking rows = facility, datetime range, "Durasi: N jam", status Badge + payment Badge; transaksi rows from mock transactions. Read all three screenshots.'),
  pageTask('admin /admin dashboard', `${ROOT}/app/(admin)/admin/page.tsx (+ components/admin/* you own)`, null, 'OBS-020..023',
    'No screenshot — build from spec + DESIGN.md. "Admin Dashboard" + subtitle; row of 4 StatTiles (Today\\'s Bookings, Active Sessions, Pending Payments, Total Users); row of 3 revenue StatTiles (Today/Weekly/Monthly, formatRupiah); "Recent Transactions" card listing adminStats/recentTransactions (user, description, datetime, amount, status Badge). Use the EXACT English labels from OBS-021/022/023.'),
  pageTask('barista /barista', `${ROOT}/app/barista/page.tsx (+ ${ROOT}/app/barista/layout.tsx if needed, + components/barista/* you own)`, 'barista.png', 'OBS-120..122',
    'Kitchen display: "Dashboard Barista" + brand subtitle, "Sound On" toggle + "Refresh" buttons; three columns/counters Pesanan Baru / Sedang Disiapkan / Siap Diambil; empty state "Belum ada pesanan / Pesanan baru akan muncul di sini" when baristaOrders empty, else order cards with advance-status buttons. Its own minimal sticky header (it is NOT in a route group). Client component.'),
]);

const built = pages.filter(Boolean).length;
log(`Pages done (${built}/${pages.length} ok). Verifying build…`);

// ---- Phase 3: verify + fix ----
phase('Verify');
const verify = await agent(`${CONTRACT}

YOU ARE THE VERIFIER/FIXER (Phase 3). The foundation + all pages were just built by other agents. Make the whole
app green. Run, in ${ROOT}, with a dummy DB env so Prisma is happy:
  export DATABASE_URL="postgresql://ci:ci@localhost:5432/flowspace?schema=public"; export DIRECT_URL="$DATABASE_URL"; export NEXTAUTH_SECRET=dummy; export NEXTAUTH_URL=http://localhost:3000
Then iterate until ALL pass:
  1) pnpm db:generate
  2) pnpm typecheck        (fix all TS errors)
  3) pnpm lint:ci          (fix all eslint errors/warnings — --max-warnings=0)
  4) pnpm build            (fix all build errors, incl. duplicate-route "/" or "/cafe" route-group collisions,
                            missing 'use client', server/client boundary issues, bad imports)
Fix the SMALLEST thing that makes it correct; do not redesign. If two pages resolve to the same path (e.g. the
landing or /cafe/guest vs /cafe), resolve the route-group collision. If lucide-react icon imports fail, fix the
import names. Keep edits minimal and on-brand (DESIGN.md). You MAY edit any file to achieve green.
Report: final PASS/FAIL of each command with the tail of output, and a list of every file you changed and why.`,
  { label: 'verify+fix', phase: 'Verify' });

return { foundation: foundation.slice(0, 400), pagesBuilt: built, pagesTotal: pages.length, verify };
