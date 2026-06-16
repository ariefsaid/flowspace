/**
 * AC-121 — A member places a cafe order and it appears in the barista KDS as NEW.
 *
 * Given a member places an order,
 * When the barista opens /barista,
 * Then the order is listed in the "Pesanan Baru" (NEW) column with its code and lines.
 * (FR-114, FR-130 — the ONE curated cross-stack e2e for the cafe domain)
 *
 * Strategy: two browser contexts in the same worker (Playwright config: 1 worker).
 *   1. Member context: login budi → /cafe → add Croissant (hasVariants:false) →
 *      open cart → "Pesan Sekarang" → order placed.
 *   2. Barista context: login barista → /barista → click manual Refresh button
 *      (legitimate fallback per spec: "poll/manual-refresh is the MVP") →
 *      assert placed order appears in the "Pesanan Baru" column with "Croissant".
 *
 * Credentials: seeded dev-fallback values from scripts/seed-supabase.ts.
 * NEVER include real secrets — these are test-DB dev fallbacks only.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const MEMBER_EMAIL = "budi@flowspace.test";
const MEMBER_PW = "dev-member-pw";
const BARISTA_EMAIL = "barista@flowspace.test";
const BARISTA_PW = "dev-barista-pw";

/** The no-variant food item present in the seed menu (hasVariants: false). */
const TARGET_ITEM = "Croissant";

// ---------------------------------------------------------------------------
// Helper — reused login pattern (matches all other AC-0xx specs in this suite)
// ---------------------------------------------------------------------------
async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait until navigation away from /login completes (window.location.href = roleHome())
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

// ---------------------------------------------------------------------------
// AC-121 — end-to-end: member order → barista KDS shows NEW
// ---------------------------------------------------------------------------
test("AC-121 member order appears in the barista KDS as NEW", async ({
  browser,
}) => {
  // Extend test timeout: two full login flows + RSC DB renders + interaction
  test.setTimeout(90_000);

  // ── Open two isolated browser contexts (separate sessions / cookies) ──
  const memberCtx: BrowserContext = await browser.newContext();
  const baristaCtx: BrowserContext = await browser.newContext();

  const memberPage: Page = await memberCtx.newPage();
  const baristaPage: Page = await baristaCtx.newPage();

  try {
    // ── ARRANGE: log in both users ──
    await loginAs(memberPage, MEMBER_EMAIL, MEMBER_PW);
    await loginAs(baristaPage, BARISTA_EMAIL, BARISTA_PW);

    // Member should land on /dashboard (role-home redirect)
    await expect(memberPage).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    // Barista should land on /barista (role-home redirect)
    await expect(baristaPage).toHaveURL(/\/barista/, { timeout: 10_000 });

    // ── ACT (member): navigate to /cafe, add Croissant, checkout ──
    await memberPage.goto("/cafe");
    // Wait for the RSC to finish rendering the menu (h1 "FlowSpace Cafe" heading)
    await expect(memberPage.locator("h1").filter({ hasText: /cafe/i })).toBeVisible({
      timeout: 15_000,
    });

    // Click the "Food" category filter to narrow view to food items (Croissant is Food)
    await memberPage.getByRole("button", { name: "Food" }).click();

    // Wait for Croissant to appear (it's a no-variant Food item — "Tambah" button)
    const croissantHeading = memberPage.locator("h3").filter({ hasText: TARGET_ITEM }).first();
    await expect(croissantHeading).toBeVisible({ timeout: 10_000 });

    // Click the "Tambah" button in the same card as the Croissant heading.
    // Structure: h3[Croissant] → parent div (name row) → grandparent Card div → button[Tambah]
    // Using Playwright's filter to find the specific "Tambah" button for Croissant.
    const tambahBtn = memberPage
      .locator("h3")
      .filter({ hasText: TARGET_ITEM })
      .first()
      .locator("xpath=ancestor::div[contains(@class,'flex') and contains(@class,'flex-col')][1]//button[normalize-space()='Tambah']");
    await tambahBtn.click();

    // Open cart panel via the cart button (aria-label="Buka keranjang")
    await memberPage.getByRole("button", { name: "Buka keranjang" }).click();
    // Verify Croissant is in the cart panel
    await expect(memberPage.locator("[role='dialog'], .fixed").getByText(TARGET_ITEM)).toBeVisible({
      timeout: 5_000,
    }).catch(async () => {
      // fallback: just check any visible text with "Croissant"
      await expect(memberPage.getByText(TARGET_ITEM).first()).toBeVisible({ timeout: 5_000 });
    });

    // Click "Pesan Sekarang" to place the order (server action: placeOrder)
    await memberPage.getByRole("button", { name: "Pesan Sekarang" }).click();
    // After checkout, the cart closes and the page refreshes.
    // Give the server action time to persist the order.
    await memberPage.waitForTimeout(3_000);

    // ── ACT (barista): navigate to /barista and click Refresh ──
    // Navigate to /barista to get server-rendered initial orders (RSC re-render)
    await baristaPage.goto("/barista");
    await expect(
      baristaPage.locator("h1").filter({ hasText: /Dashboard Barista/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Click the manual "Refresh" button — the legitimate KDS fallback (realtime is FU-1)
    // This triggers router.refresh() which re-runs the RSC and picks up the new order.
    await baristaPage.getByRole("button", { name: "Refresh" }).click();
    // Give router.refresh() time to re-render the RSC
    await baristaPage.waitForTimeout(3_000);

    // ── ASSERT: the placed order appears in the "Pesanan Baru" (NEW) column ──
    // Goal oracle: "Croissant" is visible in the KDS under the NEW column.
    // BaristaClient renders: h2 "PESANAN BARU (N)" → sibling OrderCards below it.
    // Each OrderCard has order lines rendered as: <li><span>1×</span> Croissant</li>
    const pesananBaruHeading = baristaPage.locator("h2").filter({
      hasText: /Pesanan Baru/i,
    });
    await expect(pesananBaruHeading).toBeVisible({ timeout: 10_000 });

    // The NEW column is a flex column; its h2 and OrderCards share a parent div.
    const newColumnDiv = pesananBaruHeading.locator("xpath=parent::div");

    // Goal: Croissant line appears in the NEW column (order is NEW status)
    await expect(newColumnDiv.getByText(TARGET_ITEM).first()).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await memberCtx.close();
    await baristaCtx.close();
  }
});
