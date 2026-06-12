import { test, expect } from "@playwright/test";

/**
 * Phase 1 smoke test — verifies root redirect and dashboard shell render.
 */
test("home redirects to workspace dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/w\/demo-workspace\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
