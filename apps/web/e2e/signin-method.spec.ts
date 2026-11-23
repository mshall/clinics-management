import { expect, test, type Page } from "@playwright/test";

/** Founder, 24 Nov 2026: exactly two sign-in methods, Kiorex Passport first and the default, Password behind a toggle on the same screen. */
const KEY = "kiorly.signin.method";
const offerPassport = (page: Page, enabled: boolean) =>
  page.route("**/api/v1/auth/kiorex/config*", (r) => r.fulfill({ json: { enabled, edition: "CLINIC", defaultSignIn: "KIOREX_PASSPORT", passportAvailable: enabled, defaultMethod: enabled ? "PASSPORT" : "PASSWORD" } }));

test.describe("Login: Passport default, password toggle, last-method memory", () => {
  test("a fresh browser lands on Kiorex Passport; Password is one click away; nothing is remembered until a sign-in succeeds", async ({ page }) => {
    await offerPassport(page, true);
    await page.goto("/login");
    await expect(page.getByTestId("signin-method-passport")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab")).toHaveCount(2);
    await expect(page.getByTestId("kiorex-passport-button")).toBeVisible();
    await expect(page.locator("#email")).toHaveCount(0);
    await page.getByTestId("signin-method-password").click();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.getByTestId("kiorex-passport-button")).toHaveCount(0);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
    // keyboard: arrows move between the two tabs
    await page.getByTestId("signin-method-password").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("signin-method-passport")).toHaveAttribute("aria-selected", "true");
  });

  test("the last method used is preselected next time; garbage falls back to Passport", async ({ page }) => {
    await offerPassport(page, true);
    await page.goto("/login");
    await page.evaluate((k) => localStorage.setItem(k, "password"), KEY);
    await page.reload();
    await expect(page.getByTestId("signin-method-password")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#email")).toBeVisible();
    await page.evaluate((k) => localStorage.setItem(k, "carrier-pigeon"), KEY);
    await page.reload();
    await expect(page.getByTestId("signin-method-passport")).toHaveAttribute("aria-selected", "true");
  });

  test("when Passport is not offered only the password form shows (no tabs)", async ({ page }) => {
    await offerPassport(page, false);
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByTestId("kiorex-passport-button")).toHaveCount(0);
  });

  test("?sso=passport still starts Passport by itself", async ({ page }) => {
    await offerPassport(page, true);
    let started = false;
    await page.route("**/api/v1/auth/kiorex/start", (r) => { started = true; return r.fulfill({ json: { authorizationUrl: "http://localhost:1/never" } }); });
    await page.goto("/login?sso=passport").catch(() => {});
    await expect.poll(() => started).toBe(true);
  });
});
