import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@kiorly.com");
  await page.getByLabel(/password/i).fill("demo");
  await page.getByRole("button", { name: /^(sign in|log in)$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

test.describe("ON-08 first-run tour, sample patient & help", () => {
  test("tour runs 5 steps once on the setup checklist", async ({ page }) => {
    await login(page);
    await page.goto("/onboarding");
    const tour = page.getByTestId("first-run-tour");
    await expect(tour).toBeVisible();
    await expect(tour).toContainText("1 of 5");
    for (let i = 0; i < 4; i += 1) await tour.getByTestId("tour-next").click();
    await expect(tour).toContainText("5 of 5");
    await tour.getByTestId("tour-next").click();
    await expect(tour).toBeHidden();
    await page.reload();
    await expect(page.getByTestId("first-run-tour")).toBeHidden();
  });

  test("help drawer creates a marked sample patient and removes it", async ({ page }) => {
    await login(page);
    await page.goto("/patients");
    await page.getByTestId("help-open").click();
    const drawer = page.getByTestId("help-drawer");
    await expect(drawer.getByTestId("help-videos")).toBeVisible();
    const remove = drawer.getByTestId("help-sample-remove");
    if (await remove.isVisible()) {
      await remove.click();
      await expect(drawer.getByTestId("help-sample-try")).toBeVisible();
    }
    await drawer.getByTestId("help-sample-try").click();
    await page.waitForURL(/\/patients\/[^/]+$/);
    await expect(page.getByTestId("sample-patient-badge")).toBeVisible();

    await page.getByTestId("help-open").click();
    await page.getByTestId("help-drawer").getByTestId("help-sample-remove").click();
    await expect(page.getByTestId("help-drawer").getByTestId("help-sample-try")).toBeVisible();
  });
});
