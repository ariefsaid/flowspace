/**
 * AC-849 — A member books a scheduled coworking seat end-to-end.
 *
 * Given a seeded member,
 * When they choose scheduled coworking, a date/time, an AVAILABLE seat from
 *   the server-driven floor plan, the "online" payment method, and accept
 *   the policy,
 * Then a server-priced booking is created and the resulting status/payment
 *   are visible on the wizard's success state AND on /history.
 *
 * The oracle is the GOAL (a real CONFIRMED/PAID_ONLINE booking exists and is
 * visible), not incidental DOM. This is the single curated cross-stack
 * journey for the booking-parity flagship (ADR-0010) — every other AC-8xx is
 * proven at unit/integration layer.
 *
 * Credentials: seeded dev-fallback values from scripts/seed-supabase.ts.
 * NEVER include real secrets — these are test-DB dev fallbacks only.
 */
import { test, expect, type Page } from "@playwright/test";

const MEMBER_EMAIL = "budi@flowspace.test";
const MEMBER_PW = "dev-member-pw";

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

test("AC-849 member books scheduled coworking via the server-driven floor plan and sees CONFIRMED/PAID_ONLINE", async ({
  page,
}) => {
  test.setTimeout(90_000);

  // ── ARRANGE: log in the member, open /booking ──
  await loginAs(page, MEMBER_EMAIL, MEMBER_PW);
  await page.goto("/booking");
  await expect(page.getByRole("heading", { name: "Booking" })).toBeVisible({
    timeout: 15_000,
  });

  // ── ACT: Step 1 (Tipe) — choose scheduled coworking ──
  await page.getByRole("button", { name: /Coworking Seat/ }).click();

  // ── ACT: Step 2 (Waktu) — accept the default valid date/time/duration ──
  await expect(page.getByText("Tanggal Reservasi")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Lanjut" }).click();

  // ── ACT: Step 3 (Pilih Tempat) — the server-driven floor plan loads, then
  //         pick the first AVAILABLE (non-disabled) seat button. ──
  const availableSeat = page
    .locator("button:not([disabled])")
    .filter({ hasText: /^Meja |^Counter / });
  await expect(availableSeat.first()).toBeVisible({ timeout: 15_000 });
  const seatLabel = (await availableSeat.first().textContent())?.trim();
  await availableSeat.first().click();
  await page.getByRole("button", { name: "Lanjut" }).click();

  // ── ACT: Step 4 (Konfirmasi) — online payment + policy acceptance ──
  // The radio input is visually hidden (sr-only) behind its clickable
  // <label> pill (standard accessible custom-radio pattern) — `.check()`
  // with `force` bypasses Playwright's strict visibility actionability
  // check on the input itself while still exercising the real change event.
  await expect(page.getByText("Konfirmasi Booking")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("radio", { name: /Online/ }).check({ force: true });
  await page.getByRole("checkbox", { name: /menyetujui kebijakan/i }).click();

  const confirmBtn = page.getByRole("button", { name: /Konfirmasi Booking/ });
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();

  // ── ASSERT: honest success state shows the REAL server response ──
  await expect(page.getByText("Booking Dikonfirmasi!")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/CONFIRMED/)).toBeVisible();
  await expect(page.getByText(/PAID_ONLINE/)).toBeVisible();

  // ── ASSERT: the same booking is visible on /history with its real status ──
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "Riwayat" })).toBeVisible({ timeout: 15_000 });
  if (seatLabel) {
    await expect(page.getByText(seatLabel, { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
  }
  await expect(page.getByText("CONFIRMED").first()).toBeVisible();
});
