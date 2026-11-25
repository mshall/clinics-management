import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { pinLocaleAndTheme } from "./crash-sweep-helpers";
import { login } from "./helpers";

/**
 * SUB-01 Upgrade plan screen against an ALREADY RUNNING stack (web + API on a private database). The fixture script puts the demo
 * organisation in a known state (PRO with auto-renew on, or LITE after an auto-renew-off downgrade).
 *   SUB_BASE_URL=http://localhost:5191 DATABASE_URL=... npx playwright test -c playwright.sub01.config.ts
 */
const seed = (mode: "pro" | "lite") => execFileSync("node", ["--import", "tsx", "e2e/sub01-seed.ts", mode], { stdio: "pipe", env: process.env });
const axe = async (page: Page) => {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
};
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
const token = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem("cms-auth") ?? "{}") as { state?: { accessToken?: string } }).state?.accessToken ?? "");

test.describe.configure({ mode: "serial" });

for (const lang of ["en", "ar"] as const) {
  for (const width of [320, 1440]) {
    test(`paid plan (${lang}, ${width}px): current plan, usage, auto-renew ON, comparison, payment method; no overflow; axe clean`, async ({ page }) => {
      seed("pro");
      await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
      await pinLocaleAndTheme(page, lang, "light");
      await login(page, "admin@drahmedshall.com");
      await page.goto("/plan");
      await expect(page.getByTestId("upgrade-plan")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      await expect(page.getByTestId("current-plan-name")).toContainText(/Pro|برو/i);
      await expect(page.getByTestId("auto-renew-switch")).toHaveAttribute("aria-checked", "true");
      await expect(page.getByTestId("usage-max_clinicians")).toBeVisible();
      await expect(page.getByTestId("plan-table")).toBeVisible();
      for (const k of ["LITE", "PRO", "CLINIC"]) await expect(page.getByTestId(`plan-col-${k}`)).toBeVisible();
      // clinical records: Lite does not include them, Pro does (values come from the catalog)
      await expect(page.getByTestId("cell-mod_clinical-LITE")).toHaveAttribute("data-on", "0");
      await expect(page.getByTestId("cell-mod_clinical-PRO")).toHaveAttribute("data-on", "1");
      await expect(page.getByTestId("payment-method-default")).toContainText("4242");
      await expect(page.getByTestId("proration-note")).toBeVisible();
      const text = await page.getByTestId("upgrade-plan").innerText();
      expect(text).not.toMatch(/planBilling\.[a-zA-Z]+/); // no raw i18n key
      if (lang === "ar") expect(text).toMatch(/[؀-ۿ]/);
      await noOverflow(page);
      await axe(page);
      if (width === 1440) await page.screenshot({ path: `e2e/screenshots/sub01-plan-${lang}.png`, fullPage: true });
    });
  }
}

test("dark mode: no contrast or structure violations", async ({ page }) => {
  seed("pro");
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinLocaleAndTheme(page, "en", "dark");
  await login(page, "admin@drahmedshall.com");
  await page.goto("/plan");
  await expect(page.getByTestId("plan-table")).toBeVisible({ timeout: 30_000 });
  await axe(page);
  await page.screenshot({ path: "e2e/screenshots/sub01-plan-dark.png", fullPage: true });
});

test("turn auto-renew off: the dialog shows what Lite loses BEFORE confirming, needs the checkbox, then the plan ends on the period end; turn back on", async ({ page }) => {
  seed("pro");
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, "admin@drahmedshall.com");
  await page.goto("/plan");
  const sw = page.getByTestId("auto-renew-switch");
  await expect(sw).toBeVisible({ timeout: 30_000 });
  await sw.click();
  const dlg = page.getByTestId("auto-renew-dialog");
  await expect(dlg).toBeVisible();
  await expect(page.getByTestId("auto-renew-impact-lost")).toContainText("Clinical records");
  const confirm = page.getByTestId("auto-renew-confirm");
  await expect(confirm).toBeDisabled();
  await axe(page);
  await page.getByTestId("auto-renew-understood").check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByTestId("auto-renew-state")).toContainText("moves to the free plan", { timeout: 15_000 });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("current-plan-name")).toContainText(/Pro/i); // still the paid plan until the period end
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
});

test("the API refuses switching off without the confirmation, and a reception user cannot change renewal", async ({ page }) => {
  seed("pro");
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, "admin@drahmedshall.com");
  const bad = await page.request.post("/api/v1/billing/subscription/auto-renew", { data: { enabled: false }, headers: { authorization: `Bearer ${await token(page)}` } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).code).toBe("AUTO_RENEW_CONFIRMATION_REQUIRED");
  await login(page, "receptionist.hel@drahmedshall.com");
  const res = await page.request.post("/api/v1/billing/subscription/auto-renew", { data: { enabled: false, confirmDowngrade: true }, headers: { authorization: `Bearer ${await token(page)}` } });
  expect([401, 403]).toContain(res.status());
});

test("Lite after a downgrade: free plan card, read-only grace notice, upgrade and reactivate buttons, data kept message", async ({ page }) => {
  seed("lite");
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, "admin@drahmedshall.com");
  await page.goto("/plan");
  await expect(page.getByTestId("current-plan-name")).toContainText(/Lite/i, { timeout: 30_000 });
  await expect(page.getByTestId("lite-grace")).toBeVisible();
  await expect(page.getByTestId("auto-renew")).toHaveCount(0); // nothing to renew on the free plan
  await expect(page.getByTestId("upgrade-PRO")).toContainText(/Return to|Upgrade/);
  await axe(page);
  await page.screenshot({ path: "e2e/screenshots/sub01-plan-lite.png", fullPage: true });
  seed("pro");
});
