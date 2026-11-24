import { defineConfig } from "@playwright/test";

/**
 * Sponsored patient discounts (GRW-P2-S) against an ALREADY RUNNING dev stack (web + API); starts nothing, so it never collides with another checkout.
 *   PROMOTIONS_BASE_URL=http://localhost:5191 npx playwright test -c playwright.promotions.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /promotions\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.PROMOTIONS_BASE_URL ?? "http://localhost:5174", channel: "chrome", locale: "en", trace: "retain-on-failure" },
});
