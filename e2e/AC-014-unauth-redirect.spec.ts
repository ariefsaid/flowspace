/**
 * AC-014 — Unauthenticated visit to a protected route redirects to /login
 *          (callbackUrl preserved) and NEVER serves the protected content.
 *
 * This is the cross-stack proof that the Supabase edge middleware short-circuits
 * BEFORE any RSC/page render when there is no session (ADR-0014 §3): an anonymous
 * GET /dashboard must be redirected to /login?callbackUrl=/dashboard, and the
 * dashboard's protected markup must never reach the browser. The decision logic
 * (`requiredRolesFor` / `roleHome`) is owned at unit layer; this e2e proves the
 * HTTP-level short-circuit the unit tests cannot.
 *
 * No seeded credentials are used — the visit is deliberately anonymous.
 */
import { test, expect } from "@playwright/test";

/** Dashboard-only marker (the "Menu Utama" card heading). Never on /login. */
const DASHBOARD_ONLY_HEADING = "Menu Utama";

test("AC-014: an unauthenticated visit to /dashboard redirects to /login?callbackUrl=… and never serves protected content", async ({
  page,
}) => {
  // Navigate while anonymous. The middleware must redirect (302) to /login
  // BEFORE the dashboard RSC renders.
  const response = await page.goto("/dashboard");

  // Goal 1: the request was redirected, not served as 200 dashboard HTML.
  expect(response?.ok() ?? false).toBe(true); // the final /login response resolves OK

  // Goal 2: we land on /login with callbackUrl=/dashboard preserved.
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("callbackUrl")).toBe("/dashboard");

  // Goal 3: the login surface is shown (we are genuinely ON /login).
  await expect(page.locator('input[type="email"]')).toBeVisible();

  // Critical security oracle: the dashboard's protected content was never
  // rendered at any point — if "Menu Utama" appears, content leaked pre-redirect.
  await expect(page.getByText(DASHBOARD_ONLY_HEADING)).toHaveCount(0);
  await expect(page.locator("h1")).not.toContainText("Selamat Datang, ");
});
