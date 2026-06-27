// ============================================================
// Night Vibe Checker — Playwright configuration
// ============================================================

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  grep: process.env.E2E_SMOKE === "true" ? /@smoke/ : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // All API calls are mocked — no real network needed
    // Keep this OFF so page.route() intercepts work correctly
  },

  // Run against desktop Chrome and mobile Safari in CI
  projects: [
    {
      name: "chromium",
      // Override viewport to mobile width so DesktopWarningBanner never blocks tests.
      // The app is mobile-first; tests that need desktop width set it explicitly.
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
      grepInvert: /@device/,
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
      grepInvert: /@device/,
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 7"] },
      grepInvert: /@device/,
    },
    {
      name: "device-iphone-13-safari",
      testMatch: ["**/cross-device.spec.ts", "**/photo-fallback.spec.ts"],
      grep: /@device/,
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "device-pixel-7-chrome",
      testMatch: ["**/cross-device.spec.ts", "**/photo-fallback.spec.ts"],
      grep: /@device/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "device-ipad-pro-tablet",
      testMatch: ["**/cross-device.spec.ts", "**/photo-fallback.spec.ts"],
      grep: /@device/,
      use: { ...devices["iPad Pro 11"] },
    },
    {
      name: "device-desktop-chrome",
      testMatch: ["**/cross-device.spec.ts", "**/photo-fallback.spec.ts"],
      grep: /@device/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "device-desktop-firefox",
      testMatch: ["**/cross-device.spec.ts", "**/photo-fallback.spec.ts"],
      grep: /@device/,
      use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 800 } },
    },
  ],

  // Start the dev server automatically for local runs
  // In CI the server is started separately before the test job
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
