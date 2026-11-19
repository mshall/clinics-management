import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("RP-04 finance reports page loads", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, "admin@drahmedshall.com");
  await page.goto("/reports/ar-aging");
  await expect(page.getByTestId("rp04-finance-reports")).toBeVisible({ timeout: 20_000 });
});
