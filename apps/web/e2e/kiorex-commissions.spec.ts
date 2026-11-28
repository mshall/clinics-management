import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pinLocaleAndTheme } from "./crash-sweep-helpers";
import { login } from "./helpers";
import { provisionOrg, type Fixtures } from "./support/db-fixtures";

/**
 * COM-1 / COM-2 Admin > Billing > Kiorex commissions against a private real API and database (the spec creates its own organisation with one charge, its decision, one collection run and
 * a rate view, and removes it afterwards; it needs DATABASE_URL of that private database, see support/db-fixtures.ts): finance sees the panel (cards, ledger with fee basis, collection with timeline),
 * the receptionist never does. English and Arabic (RTL), 320 / 768 / 1440 / 2560 px, no horizontal overflow, axe serious/critical = 0.
 */
let fx: Fixtures;
test.beforeAll(async () => { fx = await provisionOrg({ commission: true }); });
test.afterAll(async () => { await fx?.cleanup(); });
const open = async (page: Page) => { await page.goto("/kiorex-commissions"); };
const axeClean = async (page: Page, scope: string) => {
  const r = await new AxeBuilder({ page }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
};

for (const lang of ["en", "ar"] as const) for (const w of [320, 640, 768, 1440, 2560]) {
  test(`kiorex commissions panel (${lang}, ${w}px): finance sees summary, ledger and collection timeline; no overflow; axe clean`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: w, height: w === 640 ? 450 : 1000 });
    await pinLocaleAndTheme(page, lang, "light");
    await login(page, fx.org.finance);
    await open(page);
    const panel = page.getByTestId("kiorex-commissions-panel");
    await expect(panel).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    await panel.scrollIntoViewIfNeeded();
    await expect(page.getByTestId("kxc-cards")).toBeVisible();
    await axeClean(page, '[data-testid="kiorex-commissions-panel"]');
    await page.getByTestId("kxc-tab-ledger").click();
    await expect(panel.locator("tbody tr").first()).toBeVisible();
    await expect(panel).toContainText("300.00");
    await page.getByTestId("kxc-tab-collections").click();
    await panel.locator("tbody button").first().click();
    await expect(page.getByTestId("kxc-timeline")).toContainText("CHARGE_SUCCEEDED");
    await axeClean(page, '[data-testid="kiorex-commissions-panel"]');
    await page.getByTestId("kxc-tab-rate").click();
    await expect(page.getByTestId("kxc-rate-effective")).toContainText("volume agreement");
    await expect(page.getByTestId("kxc-rate-default")).toBeVisible();
    await expect(page.getByTestId("kxc-rate-override")).toBeVisible();
    expect(await panel.innerText()).not.toMatch(/kiorexCom\.[a-zA-Z]+/); // no raw i18n key
    await axeClean(page, '[data-testid="kiorex-commissions-panel"]');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test("a receptionist never sees the Kiorex commissions panel, and the API refuses the figures", async ({ page }) => {
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, fx.org.reception);
  await page.goto("/kiorex-commissions");
  await expect(page.getByTestId("kxc-no-access")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("kiorex-commissions-panel")).toHaveCount(0);
  const status = await page.evaluate(async () => { const s = JSON.parse(localStorage.getItem("cms-auth") ?? "{}").state; const r = await fetch("/api/v1/billing/kiorex-commissions/summary", { headers: { Authorization: `Bearer ${s?.accessToken}` } }); return r.status; });
  expect(status).toBe(403);
});

for (const lang of ["en", "ar"] as const) {
  test(`side nav (${lang}): finance has a Kiorex commissions entry that opens the stand-alone route; a receptionist has none`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await pinLocaleAndTheme(page, lang, "light");
    await login(page, fx.org.finance);
    await page.goto("/");
    const link = page.getByTestId("nav-kiorex-commissions");
    await expect(link).toBeVisible({ timeout: 45_000 });
    await expect(link).toContainText(lang === "ar" ? "عمولات كيوريكس" : "Kiorex commissions");
    await link.click();
    await expect(page).toHaveURL(/\/kiorex-commissions$/);
    await expect(page.getByTestId("kiorex-commissions-panel")).toBeVisible({ timeout: 45_000 });
  });
}

test("side nav: a receptionist is not offered the Kiorex commissions entry", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, fx.org.reception);
  await page.goto("/");
  await expect(page.getByRole("navigation").first()).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined); // the access query has answered by then
  await expect(page.getByTestId("nav-kiorex-commissions")).toHaveCount(0);
});
