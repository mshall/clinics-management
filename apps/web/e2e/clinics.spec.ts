import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@demo.clinic");
  await page.getByLabel(/^password$/i).fill("demo");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\//);
}

test.describe("Clinics directory", () => {
  test("row navigates to clinic detail", async ({ page }) => {
    await login(page);
    await page.goto("/clinics");
    await expect(page.getByRole("heading", { name: /clinics/i })).toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: /Dubai|Ahmed|HQ/i }).first();
    await row.click();
    await expect(page).toHaveURL(/\/clinics\/[^/]+$/);
    await expect(page.getByText(/registration|license/i).first()).toBeVisible();
  });
});
