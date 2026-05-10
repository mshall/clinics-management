import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Clinics directory", () => {
  test("row navigates to clinic detail", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    await page.goto("/clinics");
    await expect(page.getByRole("heading", { name: /clinics.*branches/i })).toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: /Dubai|Kiorly|HQ/i }).first();
    await row.click();
    await expect(page).toHaveURL(/\/clinics\/[^/]+$/);
    await expect(page.getByText(/registration|license/i).first()).toBeVisible();
  });
});
