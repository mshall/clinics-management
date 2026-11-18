import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("ON-05 import wizard", () => {
  test("validates a price list CSV, shows row errors, imports and offers undo", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    await page.goto("/onboarding/import");
    await page.getByRole("radio", { name: /Price list/ }).click();
    const code = `E2E${Date.now().toString().slice(-6)}`;
    const csv = `code,nameEn,nameAr,price\n${code},E2E consult,كشف,350\n,Missing code,,abc\n`;
    await page.getByTestId("import-file").setInputFiles({ name: "prices.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("button", { name: /Check file/ }).click();

    await expect(page.getByTestId("import-status")).toHaveText("Ready to import");
    await expect(page.getByTestId("import-errors")).toContainText("Service code is required");
    await expect(page.getByRole("button", { name: /Download error report/ })).toBeVisible();

    await page.getByRole("button", { name: /Import 1 rows/ }).click();
    await expect(page.getByTestId("import-status")).toHaveText("Imported", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Undo import/ })).toBeVisible();
    await page.getByRole("button", { name: /Undo import/ }).click();
    await expect(page.getByTestId("import-status")).toHaveText("Undone");
  });
});
