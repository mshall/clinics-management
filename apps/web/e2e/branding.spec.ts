import { expect, test } from "@playwright/test";

test.describe("Branding", () => {
  test("login shows Kiorly and Clinic Management tagline", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Kiorly", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Clinic Management", { exact: false }).first()).toBeVisible();
  });
});
