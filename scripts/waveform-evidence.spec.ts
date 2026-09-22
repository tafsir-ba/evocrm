/**
 * Capture animated waveform evidence (fake mic → idle animation must move).
 * Run: npx playwright test scripts/waveform-evidence.spec.ts --config=playwright.notes-evidence.config.ts
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ARTIFACTS = "/opt/cursor/artifacts";
const EMAIL = "demo@evocrm.local";
const PASSWORD = "DemoPass123!";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test("recording waveform animates with silent/fake mic", async ({ page, context }) => {
  fs.mkdirSync(ARTIFACTS, { recursive: true });

  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent =
      "nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-toast] { display: none !important; pointer-events: none !important; }";
    document.documentElement.appendChild(style);

    class FakeAudioContext {
      state = "running";
      createMediaStreamSource() {
        return { connect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 2048,
          frequencyBinCount: 1024,
          smoothingTimeConstant: 0.5,
          getByteTimeDomainData(target) {
            target.fill(128);
          },
          getByteFrequencyData(target) {
            target.fill(0);
          },
        };
      }
      resume() {
        this.state = "running";
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    }
    window.AudioContext = FakeAudioContext;
    window.webkitAudioContext = FakeAudioContext;

    const silentTrack = {
      kind: "audio",
      stop() {},
      clone() {
        return this;
      },
    };
    const silentStream = {
      getTracks() {
        return [silentTrack];
      },
      getAudioTracks() {
        return [silentTrack];
      },
      clone() {
        return this;
      },
    };
    navigator.mediaDevices.getUserMedia = async () => silentStream;

    class FakeMediaRecorder {
      constructor() {
        this.state = "inactive";
        this.ondataavailable = null;
        this.onstop = null;
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        if (this.onstop) this.onstop();
      }
      static isTypeSupported() {
        return true;
      }
    }
    window.MediaRecorder = FakeMediaRecorder;
  });

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
  await page.getByPlaceholder(/who is this note about/i).fill("Ana");
  await page.getByText("Ana Silva").first().click();
  await expect(page.getByLabel(/note message/i)).toBeVisible({ timeout: 20_000 });

  await context.grantPermissions(["microphone"]);
  await page.getByLabel(/note message/i).fill("");
  await page.getByRole("button", { name: /record audio/i }).evaluate((el) =>
    (el as HTMLButtonElement).click(),
  );
  const waveform = page.getByTestId("live-mic-waveform");
  await expect(page.getByTestId("notes-recording-bar")).toBeVisible({
    timeout: 10_000,
  });
  await expect(waveform).toBeVisible({ timeout: 10_000 });

  const readHeights = async () =>
    waveform.locator("span").evaluateAll((els) =>
      els.map((el) => Number.parseInt((el as HTMLElement).style.height || "0", 10)),
    );

  await page.waitForTimeout(200);
  const first = await readHeights();
  await page.screenshot({
    path: path.join(ARTIFACTS, "notes_waveform_idle_frame_a.png"),
  });
  await page.waitForTimeout(250);
  const second = await readHeights();
  await page.screenshot({
    path: path.join(ARTIFACTS, "notes_waveform_idle_frame_b.png"),
  });

  expect(first.length).toBeGreaterThanOrEqual(12);
  expect(Math.max(...first)).toBeGreaterThan(12);
  expect(second.some((h, i) => h !== first[i])).toBeTruthy();
  expect(await waveform.getAttribute("data-mode")).toMatch(/idle|live/);
});
