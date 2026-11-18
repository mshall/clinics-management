import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("KX-10 Kiorex tab", () => {
  test("owner sees performance and booking settings", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    await page.goto("/kiorex");
    const perf = page.getByTestId("kiorex-performance-card");
    await expect(perf).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("kiorex-kpi-bookings")).toBeVisible();
    await expect(page.getByTestId("kiorex-kpi-commission")).toBeVisible();
    const settings = page.getByTestId("kiorex-booking-settings-card");
    await expect(settings).toBeVisible();
    await expect(page.getByTestId("kiorex-auto-confirm")).toBeVisible();
  });

});

test.describe("KX-10 Kiorex tab (Arabic UI)", () => {
  test("Arabic tab renders RTL labels", async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: "cms_locale", value: "ar", url: baseURL ?? "http://localhost:5173" }]);
    await login(page, "admin@kiorly.com");
    await page.goto("/kiorex");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 60_000 });
    await expect(page.getByTestId("kiorex-performance-card")).toContainText("الأداء", { timeout: 60_000 });
  });
});
