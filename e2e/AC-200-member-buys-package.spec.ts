/**
 * AC-200 — A member buys a time-credit package and their balance increases.
 *
 * Given a member is on the top-up page,
 * When the member clicks the "5 Hours" package card,
 * Then the member's time-credit balance increases by 5 hours.
 * (FR for the time-credit vertical — one curated cross-stack money-journey e2e.)
 *
 * Strategy: log in the seeded member → /topup → capture the rendered Time Credits
 * balance → click the "5 Hours" package card (the card click IS the purchase per
 * TopupClient.tsx — no confirm button) → router.refresh() re-renders the RSC →
 * assert the balance increased by exactly 5.
 *
 * The oracle is the GOAL (balance +5 on the rendered balance tile), not
 * incidental DOM. We read the balance before AND after so the test proves a
 * delta regardless of the seed's absolute starting value.
 *
 * Credentials: seeded dev-fallback values from scripts/seed-supabase.ts.
 * NEVER include real secrets — these are test-DB dev fallbacks only.
 */
import { test, expect, type Page } from "@playwright/test";

const MEMBER_EMAIL = "budi@flowspace.test";
const MEMBER_PW = "dev-member-pw";

/** Hours granted by the package under test. Must match the seed package name. */
const PACKAGE_HOURS = 5;

// ---------------------------------------------------------------------------
// Helper — reused login pattern (matches AC-121 / AC-010 specs in this suite)
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

/**
 * Reads the member's current time-credit balance from the rendered Time Credits
 * tile on /topup. The tile renders: "Time Credits {N}.0 hours available".
 */
async function readTimeCredits(page: Page): Promise<number> {
  const tile = page.getByRole("button", { name: /Time Credits/ });
  const txt = (await tile.textContent()) ?? "";
  const match = txt.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : NaN;
}

// ---------------------------------------------------------------------------
// AC-200 — end-to-end: member buys "5 Hours" → balance +5
// ---------------------------------------------------------------------------
test("AC-200 member buys the 5 Hours package and time-credit balance increases by 5", async ({
  page,
}) => {
  // Extend timeout: full login flow + RSC DB renders + server action + refresh
  test.setTimeout(90_000);

  // ── ARRANGE: log in the member ──
  await loginAs(page, MEMBER_EMAIL, MEMBER_PW);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

  // ── ARRANGE: open /topup and capture the starting balance ──
  await page.goto("/topup");
  // Wait for the RSC to finish rendering the top-up page (h1 "Top Up")
  await expect(
    page.getByRole("heading", { name: "Top Up" }),
  ).toBeVisible({ timeout: 15_000 });

  const before = await readTimeCredits(page);
  expect(Number.isFinite(before)).toBe(true);

  // ── ACT: click the "5 Hours" package card (card click = purchase) ──
  // TopupClient renders each package card with a <p>{hours} Hours</p> heading.
  // "{exact}" avoids matching "50 Hours" / "10 Hours".
  await page.getByText("5 Hours", { exact: true }).click();

  // ── ASSERT: time-credit balance increased by exactly PACKAGE_HOURS ──
  // router.refresh() re-runs the RSC; poll the rendered tile until it reflects
  // the ledger update (purchasePackage writes COMPLETED → +5 hours).
  await expect
    .poll(async () => readTimeCredits(page), {
      timeout: 20_000,
      intervals: [500],
    })
    .toBe(before + PACKAGE_HOURS);
});
