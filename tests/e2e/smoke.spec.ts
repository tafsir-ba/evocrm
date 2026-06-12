import { test, expect } from "@playwright/test";

/**
 * Phase 2 smoke test — unauthenticated users are redirected to login.
 * Full Google OAuth cannot run in CI without credentials.
 */
test("home redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("button", { name: /continue with google/i }),
  ).toBeVisible();
});
