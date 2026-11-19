import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@kiorly.com");
  await page.getByLabel(/password/i).fill("demo");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

test.describe("GT-03 help centre", () => {
  test("drawer opens help centre with 20 articles and search", async ({ page }) => {
    await login(page);
    await page.goto("/patients");
    await page.getByTestId("help-open").click();
    await page.getByTestId("help-open-centre").click();
    await page.waitForURL(/\/help/);
    const centre = page.getByTestId("help-centre");
    await expect(centre).toBeVisible();
    await expect(page.getByTestId("help-centre-articles").locator("[data-question-id]")).toHaveCount(20);
    await page.getByTestId("help-centre-search").fill("deposit");
    await expect(page.getByTestId("help-article-no-show-deposit")).toBeVisible();
    await expect(page.getByTestId("help-centre-videos")).toBeVisible();
  });
});
