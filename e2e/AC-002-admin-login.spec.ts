/**
 * AC-002 — Admin happy-path login → lands on /admin.
 *
 * This is the ONLY login-routing e2e (cross-stack proof): the full chain of
 * credentials provider → jwt callback → middleware authorized() → roleHome()
 * redirect runs together. Decision logic (roleHome, requiredRolesFor, authorized
 * null-on-no-token) is owned at unit layer (lib/auth/route-policy.test.ts,
 * lib/auth/authorize.test.ts).
 *
 * Credentials: seeded dev-fallback values from prisma/seed.ts.
 * NEVER include real secrets — these are test-DB dev fallbacks only.
 */
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@flowspace.test";
const ADMIN_PW = "dev-admin-pw";

test("AC-002 admin login lands on /admin", async ({ page }) => {
  await page.goto("/login");

  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PW);
  await page.click('button[type="submit"]');

  // Goal: ADMIN is routed to /admin by the middleware role-home redirect (FR-003).
  // If the app lands on /dashboard instead, the role-home routing is broken.
  await page.waitForURL("**/admin", { timeout: 10_000 });
  expect(page.url()).toContain("/admin");

  // Corroborate: admin-only heading present
  await expect(page.locator("h1")).toContainText("Admin Dashboard");
});
