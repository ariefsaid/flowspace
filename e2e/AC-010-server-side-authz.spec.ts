/**
 * AC-010 / AC-011 — Server-side authorization (middleware gate).
 *
 * These are the ONLY authz e2e cases: they prove the middleware physically
 * short-circuits BEFORE rendering content — something unit tests on the policy
 * functions cannot prove (they only verify the function's return values, not
 * that the middleware actually runs and the HTTP response never carries the
 * admin/barista HTML).
 *
 * Decision logic (requiredRolesFor, authorized, roleHome) is owned at unit
 * layer (lib/auth/route-policy.test.ts, lib/auth/authorize.test.ts).
 *
 * Covers:
 *   AC-010  FR-011 (OBS-131) — MEMBER blocked server-side from /admin &
 *                               /admin/users; admin content NEVER served
 *                               (content-absence assertion).
 *   AC-011  FR-012 (OBS-122) — MEMBER blocked from /barista; redirected.
 *
 * Credentials: seeded dev-fallback values from scripts/seed-supabase.ts.
 */
import { test, expect, type Page } from "@playwright/test";

const MEMBER_EMAIL = "budi@flowspace.test";
const MEMBER_PW = "dev-member-pw";

/** Admin-only heading on /admin — if this appears after a MEMBER navigates there,
 *  the OBS-131 defect is still present. */
const ADMIN_ONLY_HEADING = "Admin Dashboard";
/** Barista-only heading on /barista */
const BARISTA_ONLY_HEADING = "Dashboard Barista";

// ---------------------------------------------------------------------------
// Helper: log in as a given user
// ---------------------------------------------------------------------------
async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait until navigation away from /login completes
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 10_000,
  });
}

// ---------------------------------------------------------------------------
// AC-010 — MEMBER blocked from /admin (and /admin/users)
// Content-absence is the critical oracle: if "Admin Dashboard" text appears,
// the middleware failed to short-circuit and the defect (OBS-131) is live.
// ---------------------------------------------------------------------------
test("AC-010 member is blocked server-side from /admin and /admin/users", async ({
  page,
}) => {
  await loginAs(page, MEMBER_EMAIL, MEMBER_PW);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });

  // Navigate directly to /admin
  await page.goto("/admin");

  // Goal: URL must end at /dashboard — middleware redirects before render
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  expect(page.url()).toMatch(/\/dashboard/);

  // Critical security oracle: the admin heading must NOT appear in the page at any point
  // (if it does, content was served before redirect — the defect is live)
  await expect(page.locator("h1")).not.toContainText(ADMIN_ONLY_HEADING);
  await expect(page.getByText(ADMIN_ONLY_HEADING)).not.toBeVisible();

  // Repeat for /admin/users
  await page.goto("/admin/users");
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  expect(page.url()).toMatch(/\/dashboard/);
  await expect(page.getByText(ADMIN_ONLY_HEADING)).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// AC-011 — MEMBER blocked from /barista
// ---------------------------------------------------------------------------
test("AC-011 member is blocked server-side from /barista", async ({ page }) => {
  await loginAs(page, MEMBER_EMAIL, MEMBER_PW);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });

  await page.goto("/barista");

  // Goal: redirected to /dashboard; barista content never served
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  expect(page.url()).toMatch(/\/dashboard/);
  await expect(page.getByText(BARISTA_ONLY_HEADING)).not.toBeVisible();
});
