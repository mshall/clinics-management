import { expect, test } from "@playwright/test";
import { login } from "./helpers";

async function expectPatientManageActions(page: import("@playwright/test").Page) {
  await expect(page.getByRole("button", { name: /delete patient/i }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /edit patient/i }).first()).toBeVisible();
}

test.describe("Patient manage actions by role", () => {
  test("call center sees edit and delete on patients list", async ({ page }) => {
    await login(page, "callcenter@kiorly.com");
    await expectPatientManageActions(page);
  });

  test("supervisor sees edit and delete on patients list", async ({ page }) => {
    await login(page, "supervisor@drahmedshall.com");
    await page.goto("/patients");
    await expectPatientManageActions(page);
  });

  test("branch manager sees edit and delete on patients list", async ({ page }) => {
    await login(page, "branchmgr@kiorly.com");
    await page.goto("/patients");
    await expectPatientManageActions(page);
  });

  test("call center can open edit patient on profile", async ({ page }) => {
    await login(page, "callcenter@kiorly.com");
    await page.getByRole("link", { name: /MRN-/i }).first().click();
    await expect(page.getByRole("button", { name: /edit patient/i })).toBeVisible({ timeout: 15_000 });
  });
});
