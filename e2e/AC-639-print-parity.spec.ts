import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

const MEMBER_EMAIL = "budi@flowspace.test";
const MEMBER_PASSWORD = "dev-member-pw";

test("AC-639: member submits a server-priced print job and sees its pending history", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[type="password"]', MEMBER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  await page.goto("/print");
  await expect(page.getByRole("heading", { name: "Print Dokumen" })).toBeVisible();

  const before = await page.getByText(/Saldo Print Anda:/).textContent();
  const beforeBalance = Number(before?.match(/(\d+)\s+lembar/)?.[1]);
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  await page.locator('input[type="file"]').setInputFiles({ name: "journey.pdf", mimeType: "application/pdf", buffer: bytes });
  await page.getByRole("button", { name: "Submit Print Job" }).click();
  await expect(page.getByRole("listitem").getByText("journey.pdf")).toBeVisible({ timeout: 10_000 });
  await page.goto("/print");
  await expect(page.getByRole("listitem").getByText("journey.pdf")).toBeVisible();
  await expect(page.getByText("Menunggu").last()).toBeVisible();
  await expect(page.getByText(/Saldo Print Anda:/)).toContainText(`${beforeBalance - 1} lembar`);
  await expect(page.getByText(/1 lembar/).last()).toBeVisible();
});
