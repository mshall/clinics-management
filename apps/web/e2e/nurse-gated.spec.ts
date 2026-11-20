import { expect, test } from "@playwright/test";
import { SOLO_EMAIL, uiLogin } from "./nurse-fixtures";

/** Q7 — shared dev stack: GKN1 / GKN2 are unrecorded (human gates), so the web must show the awaiting-gate states, never a broken screen. */
test("Nurse login: Sign in with Kiorex Passport is the primary action on the Nurse host", async ({ page }) => {
  await page.goto("http://nurse.localhost:5186/login", { waitUntil: "domcontentloaded" });
  const primary = page.getByTestId("nurse-login-primary");
  await expect(primary).toBeVisible({ timeout: 30_000 });
  await expect(primary.getByTestId("kiorex-passport-button")).toBeVisible();
  await expect(page.locator("#email")).toBeVisible(); // the password form stays below it
  const [passportBox, emailBox] = [await primary.boundingBox(), await page.locator("#email").boundingBox()];
  expect(passportBox!.y).toBeLessThan(emailBox!.y);
});

test("awaiting-gate states: care plans, structured MAR and family updates", async ({ page }) => {
  test.setTimeout(120_000);
  await uiLogin(page, SOLO_EMAIL);
  await expect(page).toHaveURL(/home-visits\/today/, { timeout: 30_000 });

  await page.goto("/nurse/care-plans");
  await expect(page.getByTestId("nurse-gate-notice").first()).toHaveAttribute("data-feature", "nurse.care_plans");
  await expect(page.getByTestId("care-plan-new")).toBeDisabled();

  await page.goto("/nurse/mar");
  await page.goto("/nurse/mar/does-not-matter");
  await expect(page.getByTestId("nurse-gate-notice")).toHaveAttribute("data-feature", "nurse.mar");
  await expect(page.getByTestId("mar-add-order")).toBeDisabled();

  await page.goto("/nurse/family");
  await expect(page.getByTestId("nurse-gate-notice")).toHaveAttribute("data-feature", "nurse.family_updates");

  await page.goto("/nurse/services");
  await expect(page.getByTestId("services-proposed-note")).toBeVisible();
  const cards = page.getByTestId("nurse-plan-card");
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toContainText("Proposed");

  await page.goto("/nurse/onboarding");
  await expect(page.getByTestId("onboarding-progress")).toBeVisible();
  await expect(page.getByTestId("onboarding-listing-paused")).toBeVisible();

  // Arabic + RTL
  await page.evaluate(() => { document.cookie = "cms_locale=ar; Path=/"; localStorage.setItem("cms_locale", "ar"); });
  await page.goto("/nurse/care-plans");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("خطط الرعاية");
  await page.evaluate(() => { document.cookie = "cms_locale=en; Path=/"; localStorage.setItem("cms_locale", "en"); });
});
