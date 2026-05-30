import { defineConfig, devices } from "@playwright/test";

/** Prefer localhost so IPv6-only Vite binds still resolve on macOS. */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
/**
 * Wait on a path proxied to Nest so webServer is ready only when Vite + API both answer.
 * (A bare Vite origin can return 200 while Nest is still compiling, which breaks parallel logins.)
 */
const devReadyURL = new URL("/api/v1/health/live", baseURL).href;

export default defineConfig({
  testDir: "./e2e",
  /** Heavy demo seed + cold Nest start can exceed 30s on first navigation after login. */
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /** Default CPU-parallel logins overwhelm a cold API + bcrypt; keep modest parallelism. */
  workers: process.env.CI ? 2 : 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /responsive\.spec\.ts/,
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
      testMatch: /responsive\.spec\.ts/,
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 767, height: 1024 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: "npm run dev",
        cwd: "../..",
        url: devReadyURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
