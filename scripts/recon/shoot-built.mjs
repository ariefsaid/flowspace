// Screenshot every built route (full page) for pixel comparison vs review/recon/.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const OUT = new URL('../../review/built/', import.meta.url).pathname;
const BASE = 'http://localhost:3100';
const routes = [
  ['landing', '/'], ['login', '/login'], ['signup', '/signup'], ['guest-cafe', '/cafe/guest'],
  ['m-dashboard', '/dashboard'], ['m-booking', '/booking'], ['m-cafe', '/cafe'], ['m-print', '/print'],
  ['m-topup', '/topup'], ['m-keycard', '/keycard'], ['m-history', '/history'], ['barista', '/barista'],
  ['a-admin', '/admin'], ['a-admin-users', '/admin/users'], ['a-admin-bookings', '/admin/bookings'],
  ['a-admin-pending', '/admin/pending'], ['a-admin-pos', '/admin/pos'], ['a-admin-orders', '/admin/orders'],
  ['a-admin-print-reports', '/admin/print-reports'], ['a-admin-settings', '/admin/settings'],
];
const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const res = [];
  for (const [name, path] of routes) {
    try {
      await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 20000 });
      await p.waitForTimeout(800);
      await p.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
      res.push(`ok ${name}`);
    } catch (e) { res.push(`ERR ${name}: ${e.message}`); }
  }
  console.log(res.join('\n'));
  await b.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
