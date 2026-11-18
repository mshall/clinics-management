import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("KX-06 Kiorex cancellation policy", () => {
  test("owner sets a clinic policy override and resets it to the market default", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    await page.goto("/kiorex");
    const card = page.getByTestId("kiorex-policy-card");
    await expect(card).toBeVisible({ timeout: 60_000 });

    const cancelHours = card.locator("#kiorex-policy-patientCancelMinHours");
    await cancelHours.fill("6");
    await card.getByRole("button", { name: /^save$|^حفظ$/i }).click();
    await expect(page.getByText(/cancellation policy saved|تم حفظ سياسة الإلغاء/i)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("kiorex-policy-card").locator("#kiorex-policy-patientCancelMinHours")).toHaveValue("6");

    await page.getByTestId("kiorex-policy-card").getByRole("button", { name: /use market default/i }).click();
    await expect(page.getByTestId("kiorex-policy-card").getByRole("button", { name: /use market default/i })).toBeHidden();
  });
});
