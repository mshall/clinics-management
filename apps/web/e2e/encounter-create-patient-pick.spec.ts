import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Encounter create patient picker", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "assistant@kiorly.com");
  });

  test("selecting a patient keeps the label in the create dialog", async ({ page }) => {
    await page.goto("/encounters");
    await page.getByRole("button", { name: /new encounter/i }).click();
    const dialog = page.getByRole("dialog", { name: /create encounter/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /pick patient/i }).click();
    await dialog.locator('input[role="combobox"]').fill("a");

    // The (non-inline) pick-list panel is portalled to <body>, outside the dialog subtree.
    const firstOption = page.locator("[data-pick-list-panel]").getByRole("option").first();
    await expect(firstOption).toBeVisible({ timeout: 15_000 });
    const optionLabel = (await firstOption.locator(".font-medium").first().textContent())?.trim() ?? "";
    expect(optionLabel.length).toBeGreaterThan(0);

    await firstOption.click();
    await expect(dialog.locator('input[role="combobox"]')).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: optionLabel })).toBeVisible();
  });
});
