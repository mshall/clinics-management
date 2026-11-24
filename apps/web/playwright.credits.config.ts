import { defineConfig } from "@playwright/test";

/**
 * Provider credit screens (GRW-P2-W) against an ALREADY RUNNING dev stack (web + API); starts nothing, so it never collides with another checkout.
 *   CREDITS_BASE_URL=http://localhost:5174 npx playwright test -c playwright.credits.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /credits-wallet\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.CREDITS_BASE_URL ?? "http://localhost:5174", channel: "chrome", locale: "en", trace: "retain-on-failure" },
});
