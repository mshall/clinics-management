import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("MS-06 AI receptionist inbox page loads", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, "admin@drahmedshall.com");
  await page.goto("/messaging/ai-receptionist");
  await expect(page.getByTestId("ai-receptionist-inbox")).toBeVisible({ timeout: 20_000 });
});
