import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("UX-04 print settings card is on admin billing", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "admin@drahmedshall.com");
  await page.goto("/admin");
  await page.getByRole("button", { name: /^organization & settings$/i }).click();
  await expect(page.getByTestId("print-settings-card")).toBeVisible({ timeout: 30_000 });
});
