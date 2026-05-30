import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Physician appointments & encounters", () => {
  test("appointments page GET succeeds and table is shown", async ({ page }) => {
    await login(page, "physician@kiorly.com");
    const listRes = page.waitForResponse(
      (r) => /\/api\/v1\/appointments(\?|$)/.test(r.url()) && r.request().method() === "GET"
    );
    await page.goto("/appointments");
    const response = await listRes;
    expect(response.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /appointments/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /MRN-\d+ —/ }).first()).toBeVisible();
  });

  test("encounters ledger GET succeeds and table is shown", async ({ page }) => {
    await login(page, "physician@kiorly.com");
    const listRes = page.waitForResponse(
      (r) =>
        /\/api\/v1\/encounters(\?|$)/.test(r.url()) &&
        r.url().includes("from=") &&
        r.url().includes("to=") &&
        r.request().method() === "GET"
    );
    await page.goto("/encounters");
    const response = await listRes;
    expect(response.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /^encounters$/i })).toBeVisible();
    await expect(page.locator("table").first().getByRole("button", { name: /status/i })).toBeVisible();
  });
});
