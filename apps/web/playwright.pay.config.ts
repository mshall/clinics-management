import { defineConfig } from "@playwright/test";

/**
 * Kiorly Pay screens against an ALREADY RUNNING PRIVATE stack (scripts/pay-e2e-stack.sh: flags 4412, API 3412, web 5412); starts nothing, so it never collides with another checkout.
 * The spec creates and removes its own organisation, so DATABASE_URL must be the private database the stack runs on.
 *   PAY_BASE_URL=http://localhost:5412 DATABASE_URL=... npx playwright test -c playwright.pay.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /pay-collections\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.PAY_BASE_URL ?? "http://localhost:5412", channel: "chrome", locale: "en", trace: "retain-on-failure" },
});
