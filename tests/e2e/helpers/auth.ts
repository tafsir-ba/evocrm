import { expect, type APIRequestContext, type Page } from "@playwright/test";

const E2E_PASSWORD = "TestPassword12345";

type BootstrapResult = {
  email: string;
  workspaceSlug: string;
};

export async function bootstrapAuthenticatedWorkspace(
  page: Page,
  request: APIRequestContext,
): Promise<BootstrapResult> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-overlay-${suffix}@example.com`;
  const workspaceName = `E2E Overlay ${suffix}`;

  const signupResponse = await request.post("/api/auth/signup", {
    data: {
      name: "E2E Overlay User",
      email,
      password: E2E_PASSWORD,
      confirmPassword: E2E_PASSWORD,
    },
    timeout: 15_000,
  });

  expect(signupResponse.ok()).toBeTruthy();

  await page.goto("/login");
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/workspaces/, { timeout: 30_000 });

  const workspaceResponse = await page.request.post("/api/workspaces", {
    data: {
      name: workspaceName,
      type: "agency",
      timezone: "UTC",
      defaultCurrency: "USD",
    },
  });

  expect(workspaceResponse.ok()).toBeTruthy();

  const workspacePayload = (await workspaceResponse.json()) as {
    data?: { workspace?: { slug?: string } };
  };
  const workspaceSlug = workspacePayload.data?.workspace?.slug;
  expect(workspaceSlug).toBeTruthy();

  return { email, workspaceSlug: workspaceSlug! };
}
