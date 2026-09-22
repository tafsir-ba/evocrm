import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./scripts",
  testMatch: /(?:notes-mobile-evidence|waveform-evidence|waveform-debug)\.spec\.ts/,
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    ...devices["Pixel 5"],
    browserName: "chromium",
  },
  webServer: undefined,
});
