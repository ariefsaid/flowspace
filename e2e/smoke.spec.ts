import { test, expect } from "@playwright/test";
import { brand } from "../brand.config";

// Pure assertion smoke test — does not require a running server or a browser
// download. Replace with a real navigation test once the webServer config in
// playwright.config.ts is enabled.
test("brand config exposes a default name", async () => {
  expect(brand.name).toBe("FlowSpace");
});
