import { test, expect } from "@playwright/test";

import { bootstrapAuthenticatedWorkspace } from "./helpers/auth";
import {
  assertActionOutsideScrollRegion,
  assertBodyScrollLocked,
  assertDialogWithinViewport,
  assertNoDocumentHorizontalOverflow,
} from "./helpers/overlay-assertions";

const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "mobile", width: 390, height: 844 },
] as const;

test.describe("Phase 15 overlay layout", () => {
  test.describe.configure({ mode: "serial" });

  let workspaceSlug: string | null = null;

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const bootstrapped = await bootstrapAuthenticatedWorkspace(page, request);
      workspaceSlug = bootstrapped.workspaceSlug;
    } catch {
      workspaceSlug = null;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(() => {
    test.skip(
      !workspaceSlug,
      "Authenticated E2E bootstrap unavailable — start MongoDB (mongodb://localhost:27017/evocrm_e2e) and re-run.",
    );
  });

  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.label} ${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test("component showcase modal stays within viewport", async ({ page }) => {
        await page.goto(`/w/${workspaceSlug!}/states`);
        await page.getByRole("button", { name: "Open modal" }).click();

        await assertDialogWithinViewport(page, "Example modal");
        await assertBodyScrollLocked(page);
        await assertNoDocumentHorizontalOverflow(page);

        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "Example modal" })).toBeHidden();
      });

      test("component showcase drawer stays within viewport", async ({ page }) => {
        await page.goto(`/w/${workspaceSlug!}/states`);
        await page.getByRole("button", { name: "Open drawer" }).click();

        await assertDialogWithinViewport(page, "Example drawer");
        await assertBodyScrollLocked(page);
        await assertNoDocumentHorizontalOverflow(page);

        await page.getByRole("button", { name: "Close drawer" }).click();
        await expect(page.getByRole("dialog", { name: "Example drawer" })).toBeHidden();
      });

      test("new lead drawer keeps primary actions reachable", async ({ page }) => {
        await page.goto(`/w/${workspaceSlug!}/leads`);
        await page.getByRole("button", { name: "New lead" }).click();

        await assertDialogWithinViewport(page, "New lead");
        await assertActionOutsideScrollRegion(page, "Create lead");
        await assertActionOutsideScrollRegion(page, "Cancel");
        await assertBodyScrollLocked(page);
        await assertNoDocumentHorizontalOverflow(page);
      });

      test("feedback widget modal keeps send action reachable", async ({ page }) => {
        await page.goto(`/w/${workspaceSlug!}/dashboard`);
        await page.getByTestId("feedback-trigger").click();

        await assertDialogWithinViewport(page, "Send feedback");
        await assertActionOutsideScrollRegion(page, "Send feedback");
        await assertActionOutsideScrollRegion(page, "Cancel");
        await assertBodyScrollLocked(page);
        await assertNoDocumentHorizontalOverflow(page);
      });
    });
  }
});
