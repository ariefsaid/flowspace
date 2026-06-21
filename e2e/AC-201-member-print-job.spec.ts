/**
 * AC-201 — A member submits a print job and it is recorded + balance debited.
 *
 * Given a member is on the print page,
 * When the member submits a 1-page B&W print job,
 * Then the print balance decreases by 1 sheet AND the job appears in the
 * "Riwayat Print" history.
 * (FR-230/231/232 for the print vertical — one curated cross-stack money-journey e2e.)
 *
 * Strategy: log in the seeded member → /print → capture the rendered print
 * balance from the "Saldo Print Anda" banner → submit a 1-page B&W job (the
 * PrintClient defaults are exactly 1 page / BW / 1 copy, matching the journey) →
 * router.refresh() re-renders the RSC → assert (a) the banner balance decreased
 * by exactly 1 and (b) the job's filename appears under "Riwayat Print Terbaru".
 *
 * The oracle is the GOAL (balance −1, job listed), not incidental DOM. The
 * balance is read before AND after so the test proves a delta regardless of the
 * seed's absolute starting value.
 *
 * Credentials: seeded dev-fallback values from scripts/seed-supabase.ts.
 * NEVER include real secrets — these are test-DB dev fallbacks only.
 */
import { test, expect, type Page } from "@playwright/test";

const MEMBER_EMAIL = "budi@flowspace.test";
const MEMBER_PW = "dev-member-pw";

/** Sheets consumed by a 1-page × 1-copy job (the journey under test). */
const SHEETS_DEBITED = 1;
/** Default filename the client sends when no file is selected. */
const JOB_FILENAME = "dokumen.pdf";

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
 * Reads the member's current print balance from the rendered "Saldo Print Anda"
 * banner on /print. The banner renders: "Saldo Print Anda: {N} lembar".
 */
async function readPrintBalance(page: Page): Promise<number> {
  const banner = page.getByText(/Saldo Print Anda/);
  const txt = (await banner.textContent()) ?? "";
  const match = txt.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : NaN;
}

// ---------------------------------------------------------------------------
// AC-201 — end-to-end: member submits 1-page B&W job → balance −1 + job listed
// ---------------------------------------------------------------------------
test("AC-201 member submits a 1-page B&W print job: balance decreases by 1 and job appears in Riwayat Print", async ({
  page,
}) => {
  // Extend timeout: full login flow + RSC DB renders + server action + refresh
  test.setTimeout(90_000);

  // ── ARRANGE: log in the member ──
  await loginAs(page, MEMBER_EMAIL, MEMBER_PW);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

  // ── ARRANGE: open /print and capture the starting balance ──
  await page.goto("/print");
  // Wait for the RSC to finish rendering the print page (h1 "Print Dokumen")
  await expect(
    page.getByRole("heading", { name: "Print Dokumen" }),
  ).toBeVisible({ timeout: 15_000 });

  const before = await readPrintBalance(page);
  expect(Number.isFinite(before)).toBe(true);

  // Sanity: the default 1-page BW job is affordable so the submit button is
  // enabled (PrintSummary disables submit when saldoSetelahPrint < 0).
  const submitBtn = page.getByRole("button", { name: /Submit Print Job/ });
  await expect(submitBtn).toBeEnabled({ timeout: 10_000 });

  // ── ACT: submit a 1-page B&W job (client defaults = 1 page / BW / 1 copy) ──
  await submitBtn.click();

  // ── ASSERT (1): print balance decreased by exactly SHEETS_DEBITED ──
  // router.refresh() re-runs the RSC; poll the rendered banner until it reflects
  // the atomic ledger debit (submitPrintJob: printBalance -= pages×copies).
  await expect
    .poll(async () => readPrintBalance(page), {
      timeout: 20_000,
      intervals: [500],
    })
    .toBe(before - SHEETS_DEBITED);

  // ── ASSERT (2): the submitted job appears in the print history ──
  // PrintHistory renders under an h2 "Riwayat Print Terbaru"; each job line shows
  // its filename. Scope the filename assertion to that card (goal: job listed).
  const historyHeading = page.getByText("Riwayat Print Terbaru");
  const historyCard = historyHeading.locator(
    "xpath=ancestor::div[contains(@class,'p-6')][1]",
  );
  await expect(historyCard.getByText(JOB_FILENAME).first()).toBeVisible({
    timeout: 10_000,
  });
});
