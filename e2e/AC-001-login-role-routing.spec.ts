/**
 * AC-001 / AC-002 / AC-003 — Login role-routing + bad-credential rejection.
 *
 * Covers:
 *   AC-001  FR-001, FR-003 — MEMBER login lands on /dashboard
 *   AC-002  FR-001, FR-003 — ADMIN login lands on /admin
 *   AC-003  FR-002         — Bad password AND unknown email both show the same
 *                            generic error; no session is created; user stays on /login
 *
 * Credentials: seeded dev-fallback values from prisma/seed.ts.
 * NEVER include real secrets — these are test-DB dev fallbacks only.
 */
import { test, expect } from "@playwright/test";

const MEMBER_EMAIL = "budi@flowspace.test";
const MEMBER_PW = "dev-member-pw";
const ADMIN_EMAIL = "admin@flowspace.test";
const ADMIN_PW = "dev-admin-pw";
const GENERIC_ERROR = "Email atau kata sandi salah.";

test("AC-001 member login lands on /dashboard", async ({ page }) => {
  await page.goto("/login");

  await page.fill('input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[type="password"]', MEMBER_PW);
  await page.click('button[type="submit"]');

  // Goal: user lands on /dashboard — middleware routes MEMBER there
  await page.waitForURL("**/dashboard", { timeout: 10_000 });
  expect(page.url()).toContain("/dashboard");

  // Corroborate: member dashboard greeting is visible
  await expect(page.locator("h1")).toContainText("Selamat Datang");
});

test("AC-002 admin login lands on /admin", async ({ page }) => {
  await page.goto("/login");

  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PW);
  await page.click('button[type="submit"]');

  // Goal: ADMIN is routed to /admin by the middleware role-home redirect (FR-003).
  // If the app lands on /dashboard instead, this is an app bug (login page
  // hardcodes callbackUrl "/dashboard" and does not apply role-home routing).
  await page.waitForURL("**/admin", { timeout: 10_000 });
  expect(page.url()).toContain("/admin");

  // Corroborate: admin-only heading present
  await expect(page.locator("h1")).toContainText("Admin Dashboard");
});

test("AC-003 bad credentials show a generic error and stay on /login", async ({ page }) => {
  // --- wrong password for a known user ---
  await page.goto("/login");
  await page.fill('input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[type="password"]', "wrong-password-xyz");
  await page.click('button[type="submit"]');

  // Goal: same generic error, no session, still on /login.
  // Target the error banner specifically (has text-red-700 class).
  // Avoid the Next.js route-announcer which also carries role="alert".
  const errorBanner = page.locator('[role="alert"].text-red-700');
  await expect(errorBanner).toBeVisible({ timeout: 8_000 });
  await expect(errorBanner).toContainText(GENERIC_ERROR);
  expect(page.url()).toContain("/login");

  // --- unknown email — MUST produce the identical message (no enumeration) ---
  await page.fill('input[type="email"]', "nobody@unknown.test");
  await page.fill('input[type="password"]', "any-password");
  await page.click('button[type="submit"]');

  await expect(errorBanner).toBeVisible({ timeout: 8_000 });
  await expect(errorBanner).toContainText(GENERIC_ERROR);
  expect(page.url()).toContain("/login");
});
