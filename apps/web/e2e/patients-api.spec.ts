import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Regression: patients list must not 500 for roles that use the registry daily.
 * (Previously only UI chrome was asserted without checking the list API.)
 */
test.describe("Patients list API", () => {
  test("group admin GET /patients returns 200 and table shows rows", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    const listRes = page.waitForResponse(
      (r) => /\/api\/v1\/patients\?/.test(r.url()) && r.request().method() === "GET",
    );
    await page.goto("/patients");
    const response = await listRes;
    expect(response.status()).toBe(200);
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
  });

  test("physician GET /patients returns 200 and table shows rows", async ({ page }) => {
    await login(page, "physician@kiorly.com");
    const listRes = page.waitForResponse(
      (r) => /\/api\/v1\/patients\?/.test(r.url()) && r.request().method() === "GET",
    );
    await page.goto("/patients");
    const response = await listRes;
    expect(response.status()).toBe(200);
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
  });
});
