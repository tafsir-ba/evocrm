import { test, expect } from "@playwright/test";

/**
 * Phase 0 smoke test — verifies the placeholder app renders.
 * Full E2E flows are added in later phases.
 */
test("home page shows foundation placeholder", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Real Estate CRM foundation ready."),
  ).toBeVisible();
});
