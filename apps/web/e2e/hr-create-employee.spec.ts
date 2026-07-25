import { expect, test } from "@playwright/test";
import { login } from "./helpers";

async function openCreateEmployeeDialog(page: import("@playwright/test").Page) {
  await page.goto("/hr?tab=employees");
  await page.getByRole("button", { name: /add employee/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function pickClinicByTypingAndClick(
  page: import("@playwright/test").Page,
  dialog: import("@playwright/test").Locator,
  query: string,
) {
  const clinicField = dialog.getByRole("combobox").first();
  await clinicField.click();
  await clinicField.fill(query);
  const listbox = dialog.locator('[data-pick-list-panel][role="listbox"]');
  await expect(listbox).toBeVisible();
  const matchingOption = listbox.getByRole("option").first();
  await expect(matchingOption).toBeVisible();
  const clinicLabel = (await matchingOption.innerText()).split("\n")[0]!.trim();
  await matchingOption.click();
  await expect(clinicField).toHaveValue(clinicLabel);
  return clinicLabel;
}

test.describe("HR create employee clinic picker", () => {
  test("HR officer can type and click to select clinic", async ({ page }) => {
    await login(page, "hr@drahmedshall.com");
    const dialog = await openCreateEmployeeDialog(page);
    await expect(dialog.getByText(/login email/i)).toBeVisible();

    const label = await pickClinicByTypingAndClick(page, dialog, "Capital");
    expect(label.toLowerCase()).toContain("capital");
  });

  test("group admin can type and click to select clinic", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    const dialog = await openCreateEmployeeDialog(page);
    await expect(dialog.getByText(/login email/i)).toBeVisible();

    const label = await pickClinicByTypingAndClick(page, dialog, "Dubai");
    expect(label.length).toBeGreaterThan(0);
  });
});
