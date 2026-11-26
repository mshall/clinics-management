import { defineConfig } from "@playwright/test";

/**
 * The self-fixturing Clinic specs (credits wallet, promotions wizard, Kiorex commissions) against a PRIVATE stack the caller started: web + API on private ports, API on a private database.
 * The specs create and remove their own organisation in that database (e2e/support/db-fixtures.ts), so DATABASE_URL must be that database (name gap_*, e2e_* or test_*).
 *   DATABASE_URL=postgresql://…/gap_clinic_cap PRIVATE_BASE_URL=http://127.0.0.1:5741 npx playwright test -c playwright.private.config.ts
 * Never 3000/5173/5175, never the founder checkout (3020/5190/5191).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /(credits-wallet|promotions|kiorex-commissions|kiorex-commissions-com3)\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.PRIVATE_BASE_URL ?? "http://127.0.0.1:5741", channel: "chrome", locale: "en", trace: "retain-on-failure" },
});
