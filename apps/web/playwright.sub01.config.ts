import { defineConfig } from "@playwright/test";

/** SUB-01 plan & renewal screens against an ALREADY RUNNING private stack (starts nothing, never touches another checkout's ports). */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /sub01-plan-billing\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.SUB_BASE_URL ?? "http://localhost:5191", channel: "chrome", locale: "en", trace: "retain-on-failure" },
});
