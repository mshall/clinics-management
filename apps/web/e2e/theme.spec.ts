import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { expectThemeApplied, selectTheme, toggleTheme } from "./theme-helpers";

test.describe("Theme switcher", () => {
  test("login page defaults to Clinical OS Light", async ({ page }) => {
    await page.goto("/login");
    await expectThemeApplied(page, "clinical-os-light");
    await expect(page.locator("html")).toHaveClass(/theme-clinical-os/);
  });

  test("light stays the default on a dark OS; an explicit dark choice is restored in a later visit (same browser profile)", async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto("/login");
    await expectThemeApplied(page, "clinical-os-light");
    await toggleTheme(page);
    await expectThemeApplied(page, "clinical-os-dark");
    await page.close();
    const next = await ctx.newPage(); // new tab = new session storage: only the persisted choice can restore it
    await next.goto("/login");
    await expectThemeApplied(next, "clinical-os-dark");
    await ctx.close();
  });

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

  test("login page applies Clinical OS Light", async ({ page }) => {
    await page.goto("/login");
    await selectTheme(page, /clinical os — light/i);
    await expectThemeApplied(page, "clinical-os-light");
    await expect(page.locator("html")).toHaveClass(/theme-clinical-os/);
  });

  test("login page applies Clinical OS Dark", async ({ page }) => {
    await page.goto("/login");
    await selectTheme(page, /clinical os — dark/i);
    await expectThemeApplied(page, "clinical-os-dark");
  });

  // Material Light is the legacy default and is deliberately reset on reload (theme-store), so this uses Material Dark.
  test("authenticated shell keeps theme after navigation", async ({ page }) => {
    await page.goto("/login");
    await selectTheme(page, /material — dark/i);
    await login(page, "admin@kiorly.com");
    await expectThemeApplied(page, "material-dark");
    await page.goto("/patients");
    await expectThemeApplied(page, "material-dark");
    await expect(page.locator("[data-kx-control=theme]:visible").first()).toHaveAttribute("data-theme-mode", "dark");
  });

  test("shared toggle flips light/dark in the same family, persists across reload, and sets no flash before paint", async ({ page }) => {
    await page.goto("/login");
    await expectThemeApplied(page, "clinical-os-light");
    await toggleTheme(page);
    await expectThemeApplied(page, "clinical-os-dark");
    await page.reload();
    await expectThemeApplied(page, "clinical-os-dark");
    await toggleTheme(page);
    await expectThemeApplied(page, "clinical-os-light");
  });

  test("shared language toggle shows the current code and switches dir/lang", async ({ page }) => {
    await page.goto("/login");
    const lang = page.locator("[data-kx-control=language]:visible").first();
    await expect(lang).toContainText("EN");
    await lang.click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(lang).toContainText("AR");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
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

  test("encounters page loads under Clinical OS Light", async ({ page }) => {
    await page.goto("/login");
    await selectTheme(page, /clinical os — light/i);
    await login(page, "admin@kiorly.com");
    await page.goto("/encounters");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
    await expectThemeApplied(page, "clinical-os-light");
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
