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
  retries: process.env.CI ? 1 : 0,
  /** Default CPU-parallel logins overwhelm a cold API + bcrypt; keep modest parallelism. */
  workers: process.env.CI ? 1 : 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /responsive\.spec\.ts|ux02-mobile-doctor\.spec\.ts|nurse-.*\.spec\.ts/,
    },
    // Kiorly Nurse edition (Q7). System Chrome. `nurse-open` runs against the throw-away stack with every gate satisfied
    // (scripts/nurse-e2e-stack.sh: API 3011 / web 5175); `nurse-gated` runs against the shared dev stack (API 3010 / web 5174)
    // where GKN1 is unrecorded, so the awaiting-gate states are real. Run with PLAYWRIGHT_NO_SERVER=1.
    {
      name: "nurse-open",
      testMatch: /nurse-(solo|agency|safety|mar)\.spec\.ts/,
      use: { ...devices["Pixel 5"], channel: "chrome", baseURL: process.env.NURSE_OPEN_URL ?? "http://localhost:5175", permissions: ["geolocation"], geolocation: { latitude: 30.0626, longitude: 31.3219 } },
    },
    {
      name: "nurse-gated",
      testMatch: /nurse-gated\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: process.env.NURSE_GATED_URL ?? "http://localhost:5174", permissions: ["geolocation"], geolocation: { latitude: 30.0626, longitude: 31.3219 } },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
      testMatch: /responsive\.spec\.ts|ux02-mobile-doctor\.spec\.ts/,
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
        command: process.env.CI
          ? "bash scripts/playwright-ci-webserver.sh"
          : "npm run dev",
        cwd: "../..",
        url: devReadyURL,
        reuseExistingServer: !process.env.CI,
        timeout: process.env.CI ? 480_000 : 180_000,
      },
});
