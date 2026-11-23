import { defineConfig } from "@playwright/test";

/**
 * Sign-in screens against an ALREADY RUNNING dev stack (web :5174, its API behind the Vite proxy); starts nothing, so it never collides with another checkout's ports.
 *   SIGNIN_BASE_URL=http://localhost:5174 SIGNIN_SHOTS_DIR=/path/to/shots npx playwright test -c playwright.signin.config.ts
 * Covers e2e/signin-*.spec.ts (preselected-method rules, layout 360 to 2560, Arabic, dark, axe).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /signin-.*\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.SIGNIN_BASE_URL ?? "http://localhost:5174", channel: "chrome", locale: "en", trace: "retain-on-failure" },
});
