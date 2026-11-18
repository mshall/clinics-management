import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("KX-08 Kiorex ratings card", () => {
  test("owner sees the ratings card in the Kiorex tab", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    await page.goto("/kiorex");
    const card = page.getByTestId("kiorex-ratings-card");
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText(/ratings & reviews/i);
    await expect(card).toContainText(/completed a visit/i);
  });
});
