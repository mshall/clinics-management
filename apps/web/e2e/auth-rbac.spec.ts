import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string, password = "demo") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test.describe("Auth & RBAC smoke", () => {
  test("physician lands on patients and sees appointments and doctor revenue nav", async ({ page }) => {
    await login(page, "physician@kiorly.com");
    await expect(page).toHaveURL(/\/patients$/);
    await expect(page.getByRole("link", { name: /appointments/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /doctor revenue/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^revenue$/i })).not.toBeVisible();
  });

  test("assistant only sees patients, appointments, encounters", async ({ page }) => {
    await login(page, "assistant@kiorly.com");
    await expect(page).toHaveURL(/\/patients$/);
    await expect(page.getByRole("link", { name: /appointments/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /encounters/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^admin$/i })).not.toBeVisible();
    await expect(page.getByRole("link", { name: /revenue/i })).not.toBeVisible();
  });

  test("clinic admin opens administration with staff and governance", async ({ page }) => {
    await login(page, "clinicadmin@kiorly.com");
    await expect(page.getByRole("heading", { name: /administration/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /create employee/i })).toBeVisible();
    await expect(page.getByText(/audit/i).first()).toBeVisible();
  });

  test("group admin sees governance tab on admin page", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: /governance/i })).toBeVisible();
  });
});
