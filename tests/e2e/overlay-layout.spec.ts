import { test, expect } from "@playwright/test";

import { bootstrapAuthenticatedWorkspace } from "./helpers/auth";
import {
  assertActionOutsideScrollRegion,
  assertBodyScrollLocked,
  assertDialogWithinViewport,
  assertLocatorsDoNotOverlap,
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

      test("new lead focused form keeps primary actions reachable", async ({ page }) => {
        await page.goto(`/w/${workspaceSlug!}/leads`);
        await page.getByRole("button", { name: "New lead" }).click();

        await expect(page).toHaveURL(new RegExp(`/w/${workspaceSlug!}/leads/new$`));
        await expect(page.getByRole("heading", { name: "New lead" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Create lead" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Cancel" })).toBeVisible();
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

      test("feedback dock does not cover projects table, pagination, or actions", async ({
        page,
      }) => {
        await page.goto(`/w/${workspaceSlug!}/projects`);

        const dock = page.getByTestId("feedback-dock");
        const trigger = page.getByTestId("feedback-trigger");
        const main = page.getByTestId("workspace-main");
        await expect(dock).toBeVisible();
        await expect(trigger).toBeVisible();
        await expect(main).toBeVisible();

        await assertLocatorsDoNotOverlap(dock, main);
        await assertLocatorsDoNotOverlap(trigger, page.getByRole("heading", { name: "Projects" }));

        const newProject = page.getByRole("link", { name: /new project/i });
        if (await newProject.count()) {
          await assertLocatorsDoNotOverlap(trigger, newProject.first());
        }

        const nextPage = page.getByRole("button", { name: "Next page" });
        if (await nextPage.count()) {
          await nextPage.scrollIntoViewIfNeeded();
          await assertLocatorsDoNotOverlap(dock, nextPage);
        }

        await main.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
          element.scrollLeft = element.scrollWidth;
        });
        await assertLocatorsDoNotOverlap(dock, main);
        await assertNoDocumentHorizontalOverflow(page);
      });
    });
  }
});
