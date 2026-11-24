import { defineConfig } from "@playwright/test";

/**
 * The Growth & Marketing workspace (GRW-P1-D1) against an ALREADY RUNNING dev stack (web :5174 + API :3010); starts nothing, so it never collides with another checkout.
 *   GROWTH_BASE_URL=http://localhost:5174 npx playwright test -c playwright.growth.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /growth-workspace\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.GROWTH_BASE_URL ?? "http://localhost:5174", channel: "chrome", locale: "en", trace: "retain-on-failure" },
});
