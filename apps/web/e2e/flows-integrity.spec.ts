import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string, password = "demo") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test.describe("UX flows & data wiring smoke", () => {
  test("patients list has quick search without advanced search toggle", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    await page.goto("/patients");
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /advanced search/i })).toHaveCount(0);
  });

  test("group admin admin page shows create employee in organization tab", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    await page.goto("/admin");
    await page.getByRole("button", { name: /organization/i }).click();
    await expect(page.getByRole("heading", { name: /create employee/i })).toBeVisible();
  });

  test("HR employees tab points to administration for new hires", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    await page.goto("/hr");
    await page.getByRole("button", { name: /employees/i }).click();
    await expect(page.getByRole("link", { name: /administration/i })).toBeVisible();
  });

  test("reports page loads monthly series from API (chart canvas present)", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();
    const [seriesRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/v1/reports/monthly-series") && r.ok()),
      page.goto("/reports"),
    ]);
    expect(seriesRes.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: /reports/i })).toBeVisible();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
  });

  test("clinic admin sees HR in navigation", async ({ page }) => {
    await login(page, "clinicadmin@kiorly.com");
    await expect(page.getByRole("link", { name: /^hr$/i })).toBeVisible();
  });
});
