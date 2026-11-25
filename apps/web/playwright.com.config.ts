import { defineConfig } from "@playwright/test";

/**
 * COM-1 Kiorex commissions panel on a PRIVATE stack: web on 127.0.0.1:5721, API on 127.0.0.1:3721 (private database), both started by the caller.
 *   COM_BASE_URL=http://127.0.0.1:5721 npx playwright test -c playwright.com.config.ts
 * Never 3000/5173/5175.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /kiorex-commissions\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.COM_BASE_URL ?? "http://127.0.0.1:5721", locale: "en", trace: "retain-on-failure" },
});
