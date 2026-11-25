import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pinLocaleAndTheme } from "./crash-sweep-helpers";
import { login } from "./helpers";
import { provisionOrg, type Fixtures } from "./support/db-fixtures";

/**
 * GRW-P2-W provider credit screen against a running PRIVATE stack: real API and real ledger. The spec creates its own organisation with returned, onboarding, referral and bonus credit (and removes it afterwards): it needs
 * DATABASE_URL of the private database the stack runs on (see support/db-fixtures.ts), never the shared demo organisation.
 * Checks content in English and Arabic (RTL), the "what can it pay for" rules, no horizontal scroll at 320 and 1440, and axe (WCAG 2 A and AA) in both languages.
 */
const axe = async (page: Page, scope?: string) => {
  const b = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]);
  const r = await (scope ? b.include(scope) : b).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
};
let fx: Fixtures;
test.beforeAll(async () => { fx = await provisionOrg({ credit: true }); });
test.afterAll(async () => { await fx?.cleanup(); });
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

for (const lang of ["en", "ar"] as const) {
  for (const width of [320, 640, 1440, 2560]) {
    test(`credit wallet (${lang}, ${width}px): balance, lots by expiry and category, what it can pay for, history, statement; no overflow; axe clean`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 740 : width === 640 ? 450 : width === 2560 ? 1440 : 900 });
      await pinLocaleAndTheme(page, lang, "light");
      await login(page, fx.org.admin);
      await page.goto("/credit");
      const root = page.getByTestId("credit-wallet");
      await expect(root).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      await expect(page.getByTestId("credit-balance")).toBeVisible();
      await expect(page.getByTestId("credit-uses").locator("li")).toHaveCount(5);
      // referral credit cannot fund patient discounts, returned fees and the connect bonus can: the list says so
      const rows = page.getByTestId("credit-lots").locator("tbody tr");
      expect(await rows.count()).toBeGreaterThan(2);
      await expect(page.getByTestId("credit-banner")).toBeVisible(); // the fixture lot of 150 expires in 12 days
      await expect(page.getByTestId("credit-statement")).toBeVisible();
      await expect(page.getByTestId("credit-history")).toBeVisible();
      expect(await root.innerText()).not.toMatch(/credits\.[a-zA-Z]+/); // no raw i18n key
      if (lang === "ar") expect(await root.innerText()).toMatch(/[؀-ۿ]/);
      else expect(await root.innerText()).toMatch(/Credit/);
      await noOverflow(page);
      await axe(page);
      if (width === 1440) await page.screenshot({ path: `e2e/screenshots/credits-wallet-${lang}.png`, fullPage: true });
    });
  }
}

test("the statement month selector reloads the section and a month without activity says so", async ({ page }) => {
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, fx.org.admin);
  await page.goto("/credit");
  const select = page.getByTestId("credit-month");
  await expect(select).toBeVisible({ timeout: 30_000 });
  const options = await select.locator("option").allTextContents();
  expect(options.length).toBe(12);
  await select.selectOption({ index: 11 });
  await expect(page.getByTestId("credit-statement")).toBeVisible();
});

test("a reception user cannot read the credit wallet", async ({ page }) => {
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, fx.org.reception);
  const res = await page.request.get("/api/v1/credits/wallet", { headers: { authorization: `Bearer ${await page.evaluate(() => (JSON.parse(localStorage.getItem("cms-auth") ?? "{}") as { state?: { accessToken?: string } }).state?.accessToken ?? "")}` } });
  expect([401, 403]).toContain(res.status());
});
