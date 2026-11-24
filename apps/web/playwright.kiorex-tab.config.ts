import { defineConfig } from "@playwright/test";

/**
 * The state-aware Kiorex tab (ADR-040 front door) against an ALREADY RUNNING dev stack (web :5174 + API :3010); starts nothing, so it never collides with another checkout.
 *   KIOREX_TAB_BASE_URL=http://localhost:5174 KIOREX_TAB_SHOTS_DIR=/path/to/shots npx playwright test -c playwright.kiorex-tab.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /kiorex-tab\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.KIOREX_TAB_BASE_URL ?? "http://localhost:5174", channel: "chrome", locale: "en", trace: "retain-on-failure" },
});
