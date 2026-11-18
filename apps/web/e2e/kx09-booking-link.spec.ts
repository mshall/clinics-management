import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("KX-09 clinic booking link", () => {
  test("owner sees a commission-free booking link that opens the public page", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    await page.goto("/kiorex");
    const card = page.getByTestId("kiorex-booking-link-card");
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("kiorex-booking-link-free")).toBeVisible();
    const url = await page.getByTestId("kiorex-booking-link-url").inputValue();
    expect(url).toMatch(/\/b\/[a-z0-9-]+$/);

    const slug = url.split("/b/")[1]!;
    await page.goto(`/b/${slug}`);
    await expect(page.getByTestId("public-booking-page")).toBeVisible({ timeout: 30_000 });
  });

  test("unknown booking page shows not found", async ({ page }) => {
    await page.goto("/b/no-such-clinic-page");
    await expect(page.getByTestId("public-booking-not-found")).toBeVisible({ timeout: 30_000 });
  });
});
