import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pinLocaleAndTheme } from "./crash-sweep-helpers";
import { login } from "./helpers";

/**
 * GRW-P2-S sponsored promotions screen against a running stack: the three-step wizard, the content guard refusing clinical wording, the draft, the budget card and the ledger, in English and Arabic (RTL),
 * no horizontal scroll at 320 and 1440, and axe (WCAG 2 A and AA). Needs one Kiorex-bookable visit type in the demo organisation (the test skips itself when there is none).
 */
const axe = async (page: Page) => { const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]); };
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
const stamp = Date.now().toString(36);
const local = (d: Date) => { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

async function fill(page: Page, o: { nameEn: string; nameAr: string; copyEn: string; copyAr: string }) {
  await page.getByTestId("promotion-new").click();
  await expect(page.getByTestId("promotion-wizard")).toBeVisible();
  await page.getByLabel(/Name \(English\)|الاسم \(بالإنجليزية\)/).fill(o.nameEn);
  await page.getByLabel(/Name \(Arabic\)|الاسم \(بالعربية\)/).fill(o.nameAr);
  await page.getByLabel(/What patients read \(English\)|ما يقرؤه المرضى \(بالإنجليزية\)/).fill(o.copyEn);
  await page.getByLabel(/What patients read \(Arabic\)|ما يقرؤه المرضى \(بالعربية\)/).fill(o.copyAr);
  await page.getByRole("button", { name: /^(Next|التالي)$/ }).click();
  await page.getByLabel(/^(Starts|يبدأ)/).fill(local(new Date(Date.now() - 3_600_000)));
  await page.getByLabel(/^(Ends|ينتهي)/).fill(local(new Date(Date.now() + 20 * 86_400_000)));
  await page.getByRole("button", { name: /^(Next|التالي)$/ }).click();
  await page.getByLabel(/^(Discount|الخصم)(?! type)/).first().fill("100");
  await page.getByLabel(/Total budget|الميزانية الإجمالية/).fill("1500");
}

for (const lang of ["en", "ar"] as const) {
  for (const width of [320, 1440]) {
    test(`promotions (${lang}, ${width}px): wizard creates a draft, the budget card and ledger render, no overflow, axe clean`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
      await pinLocaleAndTheme(page, lang, "light");
      await login(page, "admin@drahmedshall.com");
      await page.goto("/promotions");
      await expect(page.getByTestId("promotions-page")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      await fill(page, { nameEn: `Visit discount ${stamp}${lang}${width}`, nameAr: `خصم الكشف ${stamp}`, copyEn: "A discount on the visit fee, sponsored by the clinic", copyAr: "خصم على سعر الكشف برعاية العيادة" });
      await page.getByTestId("promotion-save").click();
      const created = page.getByTestId("promotions-page");
      const skip = await page.getByTestId("promotion-error").isVisible({ timeout: 4000 }).catch(() => false);
      test.skip(skip, "the demo organisation has no Kiorex-bookable visit type");
      await expect(created).toBeVisible({ timeout: 15_000 });
      const card = page.locator('[data-testid^="promotion-"]').filter({ hasText: lang === "ar" ? `خصم الكشف ${stamp}` : `Visit discount ${stamp}${lang}${width}` }).first();
      await expect(card).toBeVisible();
      await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
      await expect(card.getByTestId("promo-remaining")).toContainText(/1[,٬]?500|١[,٬]?٥٠٠/);
      await card.getByRole("button", { name: /^(Budget ledger|سجل الميزانية)$/ }).click();
      await expect(card.getByText(/No activity yet|لا يوجد نشاط بعد/)).toBeVisible();
      expect(await page.getByTestId("promotions-page").innerText()).not.toMatch(/promotions\.[a-zA-Z]+/);
      await noOverflow(page); await axe(page);
      if (width === 1440) await page.screenshot({ path: `e2e/screenshots/promotions-${lang}.png`, fullPage: true });
    });
  }
}

test("clinical wording is refused with the terms to change, and nothing reaches review", async ({ page }) => {
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, "admin@drahmedshall.com");
  await page.goto("/promotions");
  await expect(page.getByTestId("promotions-page")).toBeVisible({ timeout: 30_000 });
  await fill(page, { nameEn: `Free surgery ${stamp}`, nameAr: `جراحة مجانية ${stamp}`, copyEn: "Free surgery for new patients", copyAr: "جراحة مجانية للمرضى الجدد" });
  await page.getByTestId("promotion-save").click();
  const card = page.locator('[data-testid^="promotion-"]').filter({ hasText: `Free surgery ${stamp}` }).first();
  await expect(card).toBeVisible({ timeout: 15_000 }); // saved as a draft: the guard speaks when it is sent for review
  await card.getByRole("button", { name: /Send for review/ }).click();
  await expect(page.getByTestId("promotion-submit-error")).toContainText(/surgery/i, { timeout: 15_000 });
  await expect(card.getByText(/^Draft$/)).toBeVisible();
});

test("a reception user cannot read promotions", async ({ page }) => {
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, "receptionist.hel@drahmedshall.com");
  const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("cms-auth") ?? "{}") as { state?: { accessToken?: string } }).state?.accessToken ?? "");
  const res = await page.request.get("/api/v1/promotions", { headers: { authorization: `Bearer ${token}` } });
  expect([401, 403]).toContain(res.status());
});
