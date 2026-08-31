import { test, expect } from "@playwright/test";

/**
 * Phase 13 E2E smoke tests.
 * Real Google OAuth and MongoDB-backed flows are not run in CI by default.
 */

test.describe("Public routes", () => {
  test("home redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page).not.toHaveURL(/\/api\/auth\/signout/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(
      page.getByText(/do you want to sign out|are you sure you want to sign out/i),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /continue with google/i }),
    ).toBeVisible();
  });

  test("login page renders credentials form fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("signup page is reachable", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();
  });

  test("unsubscribe page requires token query param", async ({ page }) => {
    await page.goto("/unsubscribe");
    await expect(page.getByRole("heading", { name: /invalid link/i })).toBeVisible();
  });
});

test.describe("Protected routes", () => {
  test("workspace list redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/workspaces");
    await expect(page).toHaveURL(/\/login/);
  });

  test("workspace dashboard redirects to login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/w/demo-agency/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Website lead webhook", () => {
  test("rejects unauthenticated requests without API key", async ({ request }) => {
    const response = await request.post("/api/integrations/website/leads", {
      data: {
        firstName: "Test",
        lastName: "Lead",
        email: "test@example.com",
      },
    });

    expect(response.status()).toBeGreaterThanOrEqual(401);
    expect(response.status()).toBeLessThanOrEqual(403);
  });
});

test.describe("Cron protection", () => {
  test("campaign cron rejects missing secret", async ({ request }) => {
    const response = await request.post("/api/cron/campaigns/send-due");
    expect(response.status()).toBe(401);
  });

  test("hubspot reconcile cron rejects missing secret", async ({ request }) => {
    const response = await request.post("/api/cron/hubspot/reconcile");
    expect(response.status()).toBe(401);
  });
});
