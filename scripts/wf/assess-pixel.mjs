export const meta = {
  name: 'assess-pixel-fidelity',
  description: 'Render built app, compare each route to the original recon screenshot, fix drift, re-verify',
  phases: [
    { title: 'Render', detail: 'start prod server + screenshot every route to review/built/' },
    { title: 'Assess', detail: 'one agent per route: score fidelity vs original + fix drift (parallel)' },
    { title: 'Verify', detail: 'typecheck + build green after fixes' },
  ],
};

const ROOT = '/Users/ariefsaid/Coding/rumah-advokat';
const ENV = `export DATABASE_URL="postgresql://ci:ci@localhost:5432/flowspace?schema=public"; export DIRECT_URL="$DATABASE_URL"; export NEXTAUTH_SECRET=dummy; export NEXTAUTH_URL=http://localhost:3100`;

const CONTRACT = `
PROJECT: FlowSpace — pixel-perfect replica of a coworking+cafe SaaS (Next.js 15 App Router + React 19 + TS +
Tailwind v4, app at ROOT ${ROOT}). DESIGN tokens: ${ROOT}/DESIGN.md (teal-500/600 primary, orange-500/600 accent
gradient, slate-200 borders, rounded-xl, shadow-sm/md, Inter, glass nav). Foundation (import only, never edit):
@/lib/cn, @/lib/format, @/brand.config, @/lib/mock/*, @/components/ui/*, @/components/layout/*. White-labeled:
brand via brand.name, never a client brand string.`;

// ---- Phase 1: render the built app ----
phase('Render');
await agent(`${CONTRACT}

YOU RENDER THE BUILT APP for pixel comparison. In ${ROOT}:
1. Kill anything on :3100:  pkill -f 'next start' 2>/dev/null; true
2. Ensure a build exists (run \`${ENV}; pnpm build\` only if .next is missing).
3. Start the prod server detached so it survives between bash calls:
     ${ENV}; nohup env PORT=3100 pnpm start >/tmp/fs-server.log 2>&1 & disown
4. Poll until it answers (up to ~40s): repeat \`curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/\` until it prints 200.
5. Run the screenshot script:  node scripts/recon/shoot-built.mjs   (writes review/built/<name>.png, full-page, 1440px).
6. Confirm: \`ls review/built/*.png | wc -l\` (expect ~20). Then stop the server: pkill -f 'next start'.
Report: how many built screenshots were produced and any route that errored.`, { label: 'render', phase: 'Render' });

log('Built screenshots captured. Assessing fidelity per route…');

// ---- Phase 2: assess + fix each route (parallel) ----
phase('Assess');
// [route label, built png, original recon png, page file to fix]
const routes = [
  ['landing',        'landing.png',                'landing.png',                'app/(public)/page.tsx'],
  ['dashboard',      'm-dashboard.png',            'm-dashboard.png',            'app/(member)/dashboard/page.tsx'],
  ['cafe',           'm-cafe.png',                 'm-cafe.png',                 'app/(member)/cafe/page.tsx'],
  ['booking',        'm-booking.png',              'm-booking.png',              'app/(member)/booking/page.tsx'],
  ['print',          'm-print.png',                'm-print.png',                'app/(member)/print/page.tsx'],
  ['keycard',        'm-keycard.png',              'm-keycard.png',              'app/(member)/keycard/page.tsx'],
  ['topup',          'm-topup.png',                'm-topup.png',                'app/(member)/topup/page.tsx'],
  ['history',        'm-history.png',              'm-history.png',              'app/(member)/history/page.tsx'],
  ['barista',        'barista.png',                'barista.png',                'app/barista/page.tsx'],
  ['admin',          'a-admin.png',                'a-admin.png',                'app/(admin)/admin/page.tsx'],
  ['admin-users',    'a-admin-users.png',          'a-admin-users.png',          'app/(admin)/admin/users/page.tsx'],
  ['admin-bookings', 'a-admin-bookings.png',       'a-admin-bookings.png',       'app/(admin)/admin/bookings/page.tsx'],
  ['admin-pending',  'a-admin-pending.png',        'a-admin-pending.png',        'app/(admin)/admin/pending/page.tsx'],
  ['admin-pos',      'a-admin-pos.png',            'a-admin-pos.png',            'app/(admin)/admin/pos/page.tsx'],
  ['admin-orders',   'a-admin-orders.png',         'a-admin-orders.png',         'app/(admin)/admin/orders/page.tsx'],
  ['admin-print',    'a-admin-print-reports.png',  'a-admin-print-reports.png',  'app/(admin)/admin/print-reports/page.tsx'],
  ['admin-settings', 'a-admin-settings.png',       'a-admin-settings.png',       'app/(admin)/admin/settings/page.tsx'],
];

const SCHEMA = {
  type: 'object',
  required: ['route', 'scoreBefore', 'verdict', 'drift', 'fixesApplied'],
  additionalProperties: false,
  properties: {
    route: { type: 'string' },
    scoreBefore: { type: 'number', description: '0-100 pixel-fidelity of built vs original BEFORE your fix' },
    verdict: { type: 'string', enum: ['pixel-perfect', 'close', 'noticeable-drift', 'major-drift'] },
    drift: { type: 'array', items: { type: 'string' }, description: 'specific differences (layout/color/spacing/missing/extra/copy)' },
    fixesApplied: { type: 'array', items: { type: 'string' }, description: 'edits you made to close drift' },
    scoreAfter: { type: 'number' },
  },
};

const assess = await parallel(routes.map(([label, built, orig, file]) => () => agent(`${CONTRACT}

YOU ASSESS + FIX ONE ROUTE for PIXEL FIDELITY. Route: ${label}.
1. READ the ORIGINAL (ground truth): ${ROOT}/review/recon/${orig}
2. READ the BUILT version: ${ROOT}/review/built/${built}
3. Compare them closely: layout/structure, colors (must be DESIGN.md teal/orange/slate tokens), spacing/rhythm,
   typography scale/weight, component shapes (rounded-xl, shadows), every section present, copy (Indonesian,
   verbatim), icons, states. Give a fidelity score 0-100 and a verdict.
4. FIX the drift you can in the page file: ${ROOT}/${file} (and ONLY its own private components under
   components/{member,admin,cafe,marketing,barista}/ that belong to this route). Use DESIGN.md tokens + the
   foundation primitives — do NOT edit foundation/shared files or other routes. Close the highest-impact gaps:
   wrong colors, missing sections, wrong layout columns, spacing, wrong copy. Keep it compiling.
5. Do NOT run pnpm build/dev/install (Phase 3 verifies). After editing, re-read your file to confirm it compiles.
Return the structured assessment (scoreBefore, verdict, drift[], fixesApplied[], scoreAfter).`,
  { label: `assess:${label}`, phase: 'Assess', schema: SCHEMA })));

const ok = assess.filter(Boolean);
const avg = ok.length ? Math.round(ok.reduce((s, r) => s + (r.scoreAfter ?? r.scoreBefore ?? 0), 0) / ok.length) : 0;
log(`Assessed ${ok.length}/${routes.length}. Avg fidelity (after fixes): ${avg}/100. Verifying build…`);

// ---- Phase 3: verify ----
phase('Verify');
const verify = await agent(`${CONTRACT}

YOU VERIFY the app is still green after pixel fixes. In ${ROOT}: ${ENV}
Run and fix until green: 1) pnpm typecheck  2) pnpm build. Fix the smallest thing per error (imports, 'use client',
unused vars, server/client boundary). Report final PASS/FAIL of each + files changed.`, { label: 'verify', phase: 'Verify' });

return {
  averageFidelity: avg,
  perRoute: ok.map((r) => ({ route: r.route, before: r.scoreBefore, after: r.scoreAfter, verdict: r.verdict, drift: r.drift?.slice(0, 4) })),
  verify: verify.slice(0, 600),
};
