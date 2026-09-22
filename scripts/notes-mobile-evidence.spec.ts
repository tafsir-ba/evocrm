/**
 * One-off mobile evidence capture for Notes UX (not part of CI suite).
 * Run: npx playwright test --config=playwright.notes-evidence.config.ts
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const ARTIFACTS = "/opt/cursor/artifacts";
const EMAIL = "demo@evocrm.local";
const PASSWORD = "DemoPass123!";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test("notes mobile UX evidence", async ({ page, context }) => {
  fs.mkdirSync(ARTIFACTS, { recursive: true });

  // Hide Next.js dev overlay which intercepts pointer events in this environment.
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent =
      "nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-toast] { display: none !important; pointer-events: none !important; }";
    document.documentElement.appendChild(style);
  });

  // Auth via NextAuth credentials callback (more reliable than UI form in headless).
  await page.goto("http://localhost:3000/login");
  const csrf = await page.request.get("http://localhost:3000/api/auth/csrf").then((r) => r.json());
  const login = await page.request.post(
    "http://localhost:3000/api/auth/callback/credentials",
    {
      form: {
        csrfToken: csrf.csrfToken,
        email: EMAIL,
        password: PASSWORD,
        redirect: "false",
        json: "true",
      },
      maxRedirects: 0,
    },
  );
  expect([200, 302]).toContain(login.status());

  await page.goto("http://localhost:3000/notes");
  await expect(page.getByPlaceholder(/who is this note about/i)).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({
    path: path.join(ARTIFACTS, "notes_empty_neutral_copy.png"),
    fullPage: true,
  });

  await page.getByPlaceholder(/who is this note about/i).fill("Ana");
  await page.getByText("Ana Silva").first().click();
  await expect(page.getByLabel(/note message/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("notes-sticky-header")).toBeVisible();
  await page.screenshot({
    path: path.join(ARTIFACTS, "notes_sticky_header_composer.png"),
    fullPage: true,
  });

  // Rename title
  await page.getByRole("button", { name: /rename conversation|note ·|parking/i }).first().click();
  const titleInput = page.getByLabel(/conversation title/i);
  await titleInput.fill("Parking follow-up");
  await titleInput.press("Enter");
  await expect(page.getByRole("button", { name: /parking follow-up/i })).toBeVisible();
  await page.screenshot({
    path: path.join(ARTIFACTS, "notes_title_renamed.png"),
  });

  // History drawer
  await page.getByRole("button", { name: /conversation history/i }).click({ force: true });
  await expect(page.getByTestId("visit-history-list")).toBeVisible();
  await page.screenshot({
    path: path.join(ARTIFACTS, "notes_history_drawer.png"),
  });
  await page.keyboard.press("Escape");

  // Send a text note so after-capture actions appear
  await page.getByLabel(/note message/i).fill("Discussed parking and balcony orientation.");
  await page.getByRole("button", { name: /send note/i }).click({ force: true });
  await expect(page.getByTestId("after-capture-actions")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: /summarize conversation/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^share$/i })).toBeVisible();
  await expect(page.getByText(/summarize this visit/i)).toHaveCount(0);
  await page.screenshot({
    path: path.join(ARTIFACTS, "notes_summarize_share_neutral.png"),
    fullPage: true,
  });

  // Attachment sheet includes Share / Download export
  await page.getByRole("button", { name: /add attachment/i }).click({ force: true });
  await expect(page.getByRole("menu")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/download export|share summary/i)).toBeVisible();
  await page.screenshot({
    path: path.join(ARTIFACTS, "notes_attach_share_sheet.png"),
  });
  // Close menu by toggling the + button again
  await page.getByRole("button", { name: /add attachment/i }).click({ force: true });
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Recording UI + waveform (grant mic permission)
  await context.grantPermissions(["microphone"]);
  // Ensure composer is empty so mic is visible
  await page.getByLabel(/note message/i).fill("");
  await page.getByRole("button", { name: /record audio/i }).click({ force: true });
  await expect(page.getByTestId("live-mic-waveform")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(900);
  const waveform = page.getByTestId("live-mic-waveform");
  const mode = await waveform.getAttribute("data-mode");
  expect(mode === "live" || mode === "idle").toBeTruthy();
  const heights = await waveform.locator("span").evaluateAll((els) =>
    els.map((el) => Number.parseInt((el as HTMLElement).style.height || "0", 10)),
  );
  expect(heights.length).toBeGreaterThanOrEqual(12);
  expect(Math.max(...heights)).toBeGreaterThan(12);
  expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(4);
  await page.screenshot({
    path: path.join(ARTIFACTS, "notes_recording_waveform.png"),
  });
  await page.getByRole("button", { name: /^cancel$/i }).click({ force: true });

  // Link unit
  await page.getByRole("button", { name: /conversation actions/i }).click({ force: true });
  await page.getByRole("menuitem", { name: /link unit|change unit/i }).click({ force: true });
  const unitSearch = page.getByPlaceholder(/search units/i);
  await expect(unitSearch).toBeVisible();
  await unitSearch.fill("River");
  await page.waitForTimeout(900);
  const hit = page.locator("button").filter({ hasText: /riverside|prop-/i }).first();
  await expect(hit).toBeVisible({ timeout: 10_000 });
  await hit.click({ force: true });
  await expect(page.locator("header").getByText(/riverside|prop-/i)).toBeVisible({
    timeout: 10_000,
  });
  await page.screenshot({
    path: path.join(ARTIFACTS, "notes_unit_chip.png"),
  });
});
