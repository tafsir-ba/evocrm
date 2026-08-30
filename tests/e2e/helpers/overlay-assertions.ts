import { expect, type Locator, type Page } from "@playwright/test";

export async function assertDialogWithinViewport(
  page: Page,
  name: string | RegExp,
): Promise<void> {
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();

  const metrics = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    };
  });

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) {
    return;
  }

  expect(metrics.top).toBeGreaterThanOrEqual(-1);
  expect(metrics.bottom).toBeLessThanOrEqual(viewport.height + 1);
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(viewport.width + 1);
}

export async function assertActionOutsideScrollRegion(
  page: Page,
  actionName: string | RegExp,
): Promise<void> {
  const button = page.getByRole("button", { name: actionName });
  await expect(button).toBeVisible();

  const insideScrollRegion = await button.evaluate(
    (element) => element.closest(".overflow-y-auto") !== null,
  );
  expect(insideScrollRegion).toBe(false);
}

export async function assertBodyScrollLocked(page: Page): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");
}

export async function assertNoDocumentHorizontalOverflow(page: Page): Promise<void> {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
}

export async function assertLocatorsDoNotOverlap(
  first: Locator,
  second: Locator,
): Promise<void> {
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();

  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  if (!firstBox || !secondBox) {
    return;
  }

  const overlaps =
    firstBox.x < secondBox.x + secondBox.width - 0.5 &&
    firstBox.x + firstBox.width > secondBox.x + 0.5 &&
    firstBox.y < secondBox.y + secondBox.height - 0.5 &&
    firstBox.y + firstBox.height > secondBox.y + 0.5;
  expect(overlaps).toBe(false);
}
