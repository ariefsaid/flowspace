export const meta = {
  name: 'build-admin-wave2',
  description: 'Build admin sub-pages + real guest cafe from recon, then verify+fix the whole app green',
  phases: [
    { title: 'AdminPages', detail: 'one agent per admin sub-page + guest cafe (parallel), from recon text+screenshots' },
    { title: 'Verify', detail: 'typecheck + lint + build; fix until green' },
  ],
};

const ROOT = '/Users/ariefsaid/Coding/rumah-advokat';
const SHOT = `${ROOT}/review/recon`;

const CONTRACT = `
PROJECT: FlowSpace — pixel-perfect replica of a coworking+cafe SaaS. Next.js 15 App Router + React 19 + TS +
Tailwind v4 + pnpm, app at ROOT (${ROOT}). White-labeled: render brand via @/brand.config (brand.name); NEVER
hardcode a client brand. Locale id-ID, currency "Rp" dot thousands.
DESIGN TOKENS: read ${ROOT}/DESIGN.md (token source of truth; standard Tailwind palette: teal-500/600 primary,
orange-500/600 accent gradient, slate-200 borders, rounded-xl, shadow-sm/md, glass sticky nav). NO raw hex/px.
FOUNDATION (already built — ONLY import, never edit): @/lib/cn (cn), @/lib/format (formatRupiah, formatDateID),
@/brand.config (brand), mock data @/lib/mock/*, UI primitives @/components/ui/* (Button{variant:'primary'|'accent'|
'outline'|'ghost'|'danger',size}, Card{variant:'default'|'highlight'|'info'|'muted'}, Badge{tone}, StatTile{label,
value,unit,icon,accent}, Input, Select, Tabs, Stepper, BrandMark), headers @/components/layout/* (AdminHeader is
provided by the (admin) route-group layout — your page renders ONLY content, no header). Read an existing built page
(e.g. ${ROOT}/app/(admin)/admin/page.tsx or a member page) to mirror the exact import style + primitive props.
HARD RULES: Do NOT run pnpm build/install/dev. Do NOT edit foundation/other agents' files/package.json/config.
Write clean TS that compiles (eslint --max-warnings=0). Use @/lib/mock data (frontend-first; no DB). 'use client'
only where needed. Match the recon screenshot + text. Keep client-brand text out (use brand.name).`;

phase('AdminPages');

const admin = [
  ['admin-users', `${ROOT}/app/(admin)/admin/users/page.tsx`, 'User management table'],
  ['admin-bookings', `${ROOT}/app/(admin)/admin/bookings/page.tsx`, 'All bookings management'],
  ['admin-pending', `${ROOT}/app/(admin)/admin/pending/page.tsx`, 'Pending-payment approval queue'],
  ['admin-pos', `${ROOT}/app/(admin)/admin/pos/page.tsx`, 'Cafe POS: menu grid + customer lookup + cart (two-column)'],
  ['admin-orders', `${ROOT}/app/(admin)/admin/orders/page.tsx`, 'Cafe order list + status'],
  ['admin-print-reports', `${ROOT}/app/(admin)/admin/print-reports/page.tsx`, 'Per-user print jobs + charges report'],
  ['admin-settings', `${ROOT}/app/(admin)/admin/settings/page.tsx`, 'Pricing/packages/discounts/tiers config'],
];

const adminTasks = admin.map(([name, file, desc]) => () => agent(`${CONTRACT}

YOU BUILD the admin page: ${desc}. It REPLACES the current "coming soon" stub at ${file} (own ONLY this file +
small components under @/components/admin/ you create for it).
RECON SOURCES (read BOTH):
- Screenshot: ${SHOT}/${name}.png   (match layout/spacing/colors pixel-close)
- Text dump:  ${SHOT}/text-${name}.txt  (exact labels, columns, copy — verbatim incl. punctuation)
Also read ${ROOT}/docs/specs/0001-recon-app-surface.spec.md for context. Build it with the foundation UI
primitives + @/lib/mock data, all visible states (incl empty state). Indonesian/English copy EXACTLY as in the
text dump. Report files written + assumptions.`, { label: name, phase: 'AdminPages' });

// real guest cafe (replaces wave-1 stub)
const guestTask = () => agent(`${CONTRACT}

YOU BUILD the real Guest Cafe page, REPLACING the stub at ${ROOT}/app/(public)/cafe/guest/page.tsx (own ONLY this
file + components under @/components/marketing or @/components/cafe you need).
RECON: read ${SHOT}/snap-guest-cafe.md (DOM) and ${SHOT}/m-cafe.png (member cafe for the card visuals). Build:
back-arrow to "/", header "{brand.name} Cafe / Order sebagai Guest", a "Mode Guest" info banner (order without
login; enter name at checkout; for booking & print -> link "daftar member" to /signup), category tabs
(Semua/Coffee/Food/Non-Coffee/Snack) filtering @/lib/mock cafe menuItems, item cards (emoji,name,category,price,
desc; "Pilih Variant" opens variant modal for drinks, "Tambah" adds directly), cart titled "Keranjang" (empty
state "Keranjang masih kosong") with a checkout that asks for guest name. NO member discount. Fully client.
Report files written.`, { label: 'guest-cafe', phase: 'AdminPages' });

const built = (await parallel([...adminTasks, guestTask])).filter(Boolean).length;
log(`Admin+guest pages built (${built}/${admin.length + 1} ok). Verifying…`);

phase('Verify');
const verify = await agent(`${CONTRACT}

YOU ARE THE VERIFIER/FIXER. Make the WHOLE app green. In ${ROOT} with dummy DB env:
  export DATABASE_URL="postgresql://ci:ci@localhost:5432/flowspace?schema=public"; export DIRECT_URL="$DATABASE_URL"; export NEXTAUTH_SECRET=dummy; export NEXTAUTH_URL=http://localhost:3000
Iterate until ALL pass: 1) pnpm db:generate  2) pnpm typecheck  3) pnpm lint:ci  4) pnpm build.
Fix the smallest thing per error (route-group collisions, missing 'use client', server/client boundary, bad imports,
unused vars, lucide icon names). You MAY edit any file. Keep edits minimal + on-brand (DESIGN.md).
Report final PASS/FAIL of each command (with output tail) and every file changed + why.`, { label: 'verify+fix', phase: 'Verify' });

return { adminPagesBuilt: built, verify };
