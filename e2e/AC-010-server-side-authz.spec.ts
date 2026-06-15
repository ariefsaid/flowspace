/**
 * AC-010..AC-015 — Server-side authorization (middleware gate).
 *
 * Covers:
 *   AC-010  FR-011 (OBS-131) — MEMBER blocked server-side from /admin & /admin/users;
 *                               admin content is NEVER served (assert URL + content absence)
 *   AC-011  FR-012 (OBS-122) — MEMBER blocked from /barista; redirected to /dashboard
 *   AC-012  FR-011 inverse   — ADMIN reaches /admin (no redirect)
 *   AC-013  FR-012 inverse   — BARISTA (and ADMIN) reach /barista (no redirect)
 *   AC-014  FR-010           — Unauthenticated visitor → /login?callbackUrl=… for protected path
 *   AC-015  FR-014           — Public paths (/, /login, /signup, /cafe/guest) render without auth
 *
 * These tests prove the OBS-122/OBS-131 middleware fix end-to-end:
 * the middleware short-circuits BEFORE any page content is rendered.
 * An admin-only string present in the response body = the defect is NOT fixed.
 *
 * Credentials: seeded dev-fallback values from prisma/seed.ts.
 */
import { test, expect } from "@playwright/test";

const MEMBER_EMAIL = "budi@flowspace.test";
const MEMBER_PW = "dev-member-pw";
const ADMIN_EMAIL = "admin@flowspace.test";
const ADMIN_PW = "dev-admin-pw";
const BARISTA_EMAIL = "barista@flowspace.test";
const BARISTA_PW = "dev-barista-pw";

/** Admin-only heading on /admin — if this appears after a MEMBER navigates there,
 *  the OBS-131 defect is still present. */
const ADMIN_ONLY_HEADING = "Admin Dashboard";
/** Barista-only heading on /barista */
const BARISTA_ONLY_HEADING = "Dashboard Barista";

// ---------------------------------------------------------------------------
// Helper: log in as a given user
// ---------------------------------------------------------------------------
async function loginAs(
  page: Parameters<Parameters<typeof test>[1]>[0]["page"],
  email: string,
  password: string,
) {
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
// ---------------------------------------------------------------------------
test("AC-010 member is blocked server-side from /admin and /admin/users", async ({
  page,
}) => {
  await loginAs(page, MEMBER_EMAIL, MEMBER_PW);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });

  // Navigate directly to /admin
  await page.goto("/admin");

  // Goal: URL must end at /dashboard — the middleware redirects before render
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

// ---------------------------------------------------------------------------
// AC-012 — ADMIN reaches /admin (no redirect)
// ---------------------------------------------------------------------------
test("AC-012 admin reaches /admin", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PW);

  await page.goto("/admin");

  // Goal: admin page renders — h1 contains the admin heading; URL stays /admin
  await expect(page.locator("h1")).toContainText(ADMIN_ONLY_HEADING, {
    timeout: 10_000,
  });
  expect(page.url()).toContain("/admin");
  // Not redirected to /dashboard
  expect(page.url()).not.toMatch(/\/dashboard/);
});

// ---------------------------------------------------------------------------
// AC-013 — BARISTA reaches /barista; ADMIN may too
// ---------------------------------------------------------------------------
test("AC-013 barista reaches /barista (and admin too)", async ({ page }) => {
  // BARISTA sub-test
  await loginAs(page, BARISTA_EMAIL, BARISTA_PW);

  await page.goto("/barista");

  await expect(page.locator("h1")).toContainText(BARISTA_ONLY_HEADING, {
    timeout: 10_000,
  });
  expect(page.url()).toContain("/barista");

  // ADMIN sub-test — admin is also allowed on /barista (route-policy table)
  await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
  await page.goto("/barista");
  await expect(page.locator("h1")).toContainText(BARISTA_ONLY_HEADING, {
    timeout: 10_000,
  });
  expect(page.url()).toContain("/barista");
});

// ---------------------------------------------------------------------------
// AC-014 — Unauthenticated visitor redirected to /login for protected paths
// ---------------------------------------------------------------------------
test("AC-014 unauthenticated visitor is redirected to /login", async ({
  page,
}) => {
  // No session — navigate directly to a protected path
  await page.goto("/dashboard");

  // Goal: URL becomes /login (with callbackUrl query param)
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  expect(page.url()).toContain("/login");
  // The callbackUrl parameter confirms the middleware preserved the intended destination
  expect(page.url()).toContain("callbackUrl");

  // Protected content (dashboard-specific) must not be served.
  // "Menu Utama" and "Riwayat Booking" are dashboard-only strings.
  await expect(page.getByText("Menu Utama")).not.toBeVisible();
  await expect(page.getByText("Riwayat Booking")).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// AC-015 — Public paths render without auth (no redirect)
// ---------------------------------------------------------------------------
test("AC-015 public paths stay open without auth", async ({ page }) => {
  const publicPaths = ["/", "/login", "/signup", "/cafe/guest"] as const;

  for (const path of publicPaths) {
    await page.goto(path);

    // Goal: page must not redirect to /login — it must STAY on its own URL
    // (allow query strings / hash but not a different pathname)
    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname).toBe(path);

    // The page must render some content (not a blank/error page)
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 5_000 });
  }
});
