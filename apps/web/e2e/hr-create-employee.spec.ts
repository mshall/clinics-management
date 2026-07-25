import { expect, test } from "@playwright/test";
import { login } from "./helpers";

async function openCreateEmployeeDialog(page: import("@playwright/test").Page) {
  await page.goto("/hr?tab=employees");
  await page.getByRole("button", { name: /add employee/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

function pickListPanel(page: import("@playwright/test").Page) {
  return page.locator('[data-pick-list-panel][role="listbox"]');
}

/** Portal list items sit above the dialog visually; pointerdown matches real tap selection. */
async function pickFirstClinicFromDialog(page: import("@playwright/test").Page, dialog: import("@playwright/test").Locator) {
  const clinicField = dialog.getByRole("combobox").first();
  await clinicField.click();
  const listbox = pickListPanel(page);
  await expect(listbox).toBeVisible();
  const firstOption = listbox.getByRole("option").first();
  const clinicLabel = (await firstOption.innerText()).split("\n")[0]!.trim();
  await firstOption.dispatchEvent("pointerdown");
  await expect(clinicField).toHaveValue(clinicLabel);
  return clinicLabel;
}

test.describe("HR create employee clinic picker", () => {
  test("HR officer can select assignable clinic in provision dialog", async ({ page }) => {
    await login(page, "hr@drahmedshall.com");
    const dialog = await openCreateEmployeeDialog(page);
    await expect(dialog.getByText(/login email/i)).toBeVisible();
    await expect(dialog.getByText(/linked login account/i)).toHaveCount(0);

    const clinicLabel = await pickFirstClinicFromDialog(page, dialog);
    expect(clinicLabel.length).toBeGreaterThan(0);
  });

  test("group admin can select clinic in provision dialog", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    const dialog = await openCreateEmployeeDialog(page);
    await expect(dialog.getByText(/login email/i)).toBeVisible();
    await expect(dialog.getByText(/linked login account/i)).toHaveCount(0);

    const clinicLabel = await pickFirstClinicFromDialog(page, dialog);
    expect(clinicLabel.length).toBeGreaterThan(0);
  });
});
