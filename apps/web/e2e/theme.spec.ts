import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { expectThemeApplied, selectTheme } from "./theme-helpers";

test.describe("Theme switcher", () => {
  test("login page applies Material Light", async ({ page }) => {
    await page.goto("/login");
    await selectTheme(page, /material — light/i);
    await expectThemeApplied(page, "material-light");
    await expect(page.locator("html")).toHaveClass(/theme-material/);
  });

  test("login page applies Material Dark", async ({ page }) => {
    await page.goto("/login");
    await selectTheme(page, /material — dark/i);
    await expectThemeApplied(page, "material-dark");
  });

  test("login page applies Default Dark (Kiorly)", async ({ page }) => {
    await page.goto("/login");
    await selectTheme(page, /default — dark/i);
    await expectThemeApplied(page, "default-dark");
    await expect(page.locator("html")).not.toHaveClass(/theme-material/);
  });

  test("authenticated shell keeps theme after navigation", async ({ page }) => {
    await page.goto("/login");
    await selectTheme(page, /material — light/i);
    await login(page, "admin@kiorly.com");
    await expectThemeApplied(page, "material-light");
    await page.goto("/patients");
    await expectThemeApplied(page, "material-light");
    await page.getByRole("button", { name: /theme/i }).click();
    await expect(page.getByRole("menuitemradio", { name: /material — light/i })).toHaveAttribute("aria-checked", "true");
  });

  test("theme persists when remember is enabled", async ({ page }) => {
    await page.goto("/login");
    await selectTheme(page, /material — dark/i);
    await page.getByRole("button", { name: /theme/i }).click();
    await page.getByRole("menuitemcheckbox", { name: /use as default when i sign in again/i }).click();
    await page.keyboard.press("Escape");
    await page.reload();
    await expectThemeApplied(page, "material-dark");
  });
});

test.describe("Theme + core flows smoke", () => {
  test("patients list loads under Material Light", async ({ page }) => {
    await page.goto("/login");
    await selectTheme(page, /material — light/i);
    await login(page, "admin@kiorly.com");
    await page.goto("/patients");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("table, [role='table']").first()).toBeVisible({ timeout: 60_000 });
  });

  test("appointments page loads under Material Dark on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await selectTheme(page, /material — dark/i);
    await login(page, "callcenter@kiorly.com");
    await page.goto("/appointments");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
    await expectThemeApplied(page, "material-dark");
  });
});
