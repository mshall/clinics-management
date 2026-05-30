import { test, expect } from "@playwright/test";
import { login } from "./helpers";

const ROUTES = [
  { path: "/", name: "dashboard" },
  { path: "/patients", name: "patients" },
  { path: "/encounters", name: "encounters" },
  { path: "/appointments", name: "appointments" },
  { path: "/operations", name: "operations" },
  { path: "/clinics", name: "clinics" },
  { path: "/expenses", name: "expenses" },
  { path: "/revenue", name: "revenue" },
  { path: "/reports", name: "reports" },
  { path: "/profile", name: "profile" },
  { path: "/admin", name: "admin" },
];

test.describe("responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "admin@kiorly.com");
  });

  test("shows mobile nav menu trigger", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /menu/i })).toBeVisible();
  });

  test("mobile nav sheet opens and navigates", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /menu/i }).click();
    await expect(page.getByRole("link", { name: /patients/i }).first()).toBeVisible();
    await page.getByRole("link", { name: /patients/i }).first().click();
    await expect(page).toHaveURL(/\/patients/);
  });

  for (const route of ROUTES) {
    test(`${route.name} page renders without horizontal overflow`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("domcontentloaded");

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(2);

      await expect(page.locator("main")).toBeVisible();
    });
  }
});

test.describe("login page mobile", () => {
  test("login form fits viewport", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
