// Standalone admin recon: fresh chromium context (no sticky session), login as admin,
// capture screenshot + innerText for every admin route into review/recon/.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'https://app.example.com';
const OUT = new URL('../../review/recon/', import.meta.url).pathname;
const EMAIL = process.env.RA_EMAIL;
const PASS = process.env.RA_PASS;

const routes = [
  ['admin', '/admin'],
  ['admin-users', '/admin/users'],
  ['admin-bookings', '/admin/bookings'],
  ['admin-pending', '/admin/pending'],
  ['admin-pos', '/admin/pos'],
  ['admin-orders', '/admin/orders'],
  ['admin-print-reports', '/admin/print-reports'],
  ['admin-settings', '/admin/settings'],
];

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {}),
    page.click('button[type=submit]'),
  ]);
  await page.waitForTimeout(2500);
  console.log('after login url:', page.url());

  const results = [];
  for (const [name, path] of routes) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(2000); // let client data load
      const finalUrl = page.url();
      await page.screenshot({ path: `${OUT}a-${name}.png`, fullPage: true });
      const text = await page.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText);
      fs.writeFileSync(`${OUT}text-${name}.txt`, `URL: ${finalUrl}\n\n${text}`);
      results.push(`${name}: ${finalUrl} (text ${text.length} chars)`);
    } catch (e) {
      results.push(`${name}: ERROR ${e.message}`);
    }
  }
  console.log(results.join('\n'));
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
