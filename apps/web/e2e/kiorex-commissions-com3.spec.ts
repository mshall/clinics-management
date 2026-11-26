import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pinLocaleAndTheme } from "./crash-sweep-helpers";
import { login } from "./helpers";
import { provisionOrg, type Fixtures } from "./support/db-fixtures";

/**
 * COM-3 provider side (read only) against a private real API and database; the spec creates its own organisations and removes them. Two organisations: one where Kiorex has set wording, counsel status,
 * parameters, a cash charge in dispute and a payout; one where the wording is NOT set (the text block must not appear, the numbers still do). English and Arabic (RTL) at 320, 640x450, 1440 and 2560 px:
 * no horizontal overflow, axe serious/critical = 0, no raw i18n key, no reviewer / document / conditions anywhere.
 */
let set: Fixtures; let unset: Fixtures;
test.beforeAll(async () => { set = await provisionOrg({ commission: true, com3: "set" }); unset = await provisionOrg({ commission: true, com3: "unset" }); });
test.afterAll(async () => { await set?.cleanup(); await unset?.cleanup(); });
const SIZES: [number, number][] = [[320, 900], [640, 450], [1440, 1000], [2560, 1300]];
const axeClean = async (page: Page, scope: string) => {
  const r = await new AxeBuilder({ page }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
};
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

for (const lang of ["en", "ar"] as const) for (const [w, h] of SIZES) {
  test(`COM-3 (${lang}, ${w}x${h}): ledger parity columns, rate disclosure and counsel chip, settlement statement; no overflow; axe clean`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: w, height: h });
    await pinLocaleAndTheme(page, lang, "light");
    await login(page, set.org.finance);
    await page.goto("/kiorex-commissions");
    const panel = page.getByTestId("kiorex-commissions-panel");
    await expect(panel).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");

    await page.getByTestId("kxc-tab-ledger").click();
    await expect(page.getByTestId("kxc-ledger-tender").first()).toContainText(lang === "ar" ? "نقدًا" : "Cash at the visit");
    await expect(page.getByTestId("kxc-ledger-dispute").first()).toContainText(lang === "ar" ? "الاعتراض حتى" : "Dispute until");
    await expect(page.getByTestId("kxc-ledger-rate").first()).toContainText(lang === "ar" ? "الافتراضية" : "Default");
    await page.getByTestId("kxc-charge-timeline-btn").first().click();
    await expect(page.getByTestId("kxc-charge-timeline")).toBeVisible();
    await axeClean(page, '[data-testid="kiorex-commissions-panel"]');

    await page.getByTestId("kxc-tab-rate").click();
    await expect(page.getByTestId("kxc-counsel")).toHaveAttribute("data-status", "APPROVED_WITH_CONDITIONS");
    await expect(page.getByTestId("kxc-disclosure-rateDisclosure")).toContainText(lang === "ar" ? "نص تجريبي للإفصاح" : "TEST rate disclosure written by Kiorex");
    // terms summary has only an English text: it still shows, in English, marked as such, in the Arabic UI
    const terms = page.getByTestId("kxc-disclosure-termsSummary").locator("p");
    await expect(terms).toHaveAttribute("lang", "en"); await expect(terms).toHaveAttribute("dir", "ltr");
    await expect(page.getByTestId("kxc-rate-params")).toBeVisible();
    await axeClean(page, '[data-testid="kiorex-commissions-panel"]');

    await page.getByTestId("kxc-tab-settlement").click();
    const stmt = page.getByTestId("kxc-statement");
    await expect(stmt).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("kxc-stmt-source")).toHaveAttribute("data-source", "LOCAL_MIRROR");
    await expect(page.getByTestId("kxc-stmt-online")).toContainText("120");
    await expect(page.getByTestId("kxc-stmt-cashAccrued")).toContainText("120");
    await expect(page.getByTestId("kxc-stmt-dedCommission")).toContainText("40");
    await expect(page.getByTestId("kxc-stmt-net")).toContainText("80");
    await expect(page.getByTestId("kxc-stmt-recon")).toHaveAttribute("data-status", "DISPUTED"); // the charge in the fixture is under an open dispute
    await expect(stmt).toContainText(lang === "ar" ? "تحويل بنكي" : "bank transfer");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("kxc-stmt-csv").click()]);
    expect(dl.suggestedFilename()).toMatch(/^settlement-.*\.csv$/);
    await axeClean(page, '[data-testid="kiorex-commissions-panel"]');
    const text = await panel.innerText();
    expect(text).not.toMatch(/kiorexCom\.[a-zA-Z.]+/);
    expect(text).not.toMatch(/reviewer|conditions secret|DOC-/i);
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("wording not set: no disclosure block, the numbers and the counsel chip remain", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, unset.org.finance);
  await page.goto("/kiorex-commissions");
  await page.getByTestId("kxc-tab-rate").click();
  await expect(page.getByTestId("kxc-rate-effective")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("kxc-disclosure")).toHaveCount(0);
  await expect(page.getByTestId("kxc-counsel")).toHaveAttribute("data-status", "NOT_REVIEWED");
});

test("the statement is for finance / owner / admin only: a receptionist gets 403 on the figures and the CSV", async ({ page }) => {
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, set.org.reception);
  await page.goto("/kiorex-commissions");
  await expect(page.getByTestId("kxc-no-access")).toBeVisible({ timeout: 45_000 });
  const codes = await page.evaluate(async () => { const s = JSON.parse(localStorage.getItem("cms-auth") ?? "{}").state; const h = { Authorization: `Bearer ${s?.accessToken}` }; return Promise.all(["/api/v1/billing/kiorex-commissions/statement", "/api/v1/billing/kiorex-commissions/statement/2026-12/export.csv"].map(async (u) => (await fetch(u, { headers: h })).status)); });
  expect(codes).toEqual([403, 403]);
});

test("the owner (group admin) reads the statement; another organisation's tenant is never addressable", async ({ page }) => {
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, set.org.admin);
  const out = await page.evaluate(async (other) => {
    const s = JSON.parse(localStorage.getItem("cms-auth") ?? "{}").state; const h = { Authorization: `Bearer ${s?.accessToken}` };
    const mine = await (await fetch("/api/v1/billing/kiorex-commissions/statement", { headers: h })).json();
    const foreign = await fetch(`/api/v1/billing/kiorex-commissions/statement?tenantId=${other}&orgRef=${other}`, { headers: h }).then((r) => r.json());
    return { mine: mine.orgRef, foreign: foreign.orgRef };
  }, unset.org.tenantId);
  expect(out.mine).toBe(set.org.tenantId); expect(out.foreign).toBe(set.org.tenantId); // the tenant comes from the token only
});
