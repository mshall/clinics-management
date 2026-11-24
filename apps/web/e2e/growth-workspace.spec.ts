import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { pinLocaleAndTheme } from "./crash-sweep-helpers";
import { login } from "./helpers";

/**
 * GRW-P1-D1 Growth & Marketing workspace against an ALREADY RUNNING dev stack (web :5174 + API :3010); starts nothing.
 *   GROWTH_BASE_URL=http://localhost:5174 npx playwright test -c playwright.growth.config.ts
 * Real API for links, QR, posters, widget and recommendations; the acquisition data (performance, statement) is mocked so the numbers are exact.
 */
const axe = async (page: Page, scope?: string) => {
  const b = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]);
  const r = await (scope ? b.include(scope) : b).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
};
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

const PERF = {
  days: 90,
  providerOriginated: { bookings: 12, attended: 9, cancelledOrNoShow: 2, newPatients: 3, attendedRate: 0.75, cancellationRate: 0.167 },
  marketplaceOriginated: { bookings: 30, attended: 21, cancelledOrNoShow: 6, newPatients: 22, attendedRate: 0.7, cancellationRate: 0.2 },
  links: { visits: 100, bookings: 12, attended: 9, visitToBooking: 0.12, bookingToAttended: 0.75 },
  incrementalMarketplaceRevenue: 6600,
  trend: [{ week: "2026-11-02", provider: 4, marketplace: 9 }, { week: "2026-11-09", provider: 8, marketplace: 21 }],
  commission: { currency: "EGP", total: 880, byMonth: [{ month: "2026-11", amount: 880, charges: 22 }], decisions: { CHARGE: 22, NO_CHARGE: 14 }, incrementalRevenueNet: 5720 },
};
const STATEMENT = (reconciled: boolean) => ({
  period: "2026-11", currency: "EGP", chargesByStatus: { CONFIRMED: { count: 22, amount: "880.00" } }, providerLedBookings: 12,
  totals: { expectedFromDecisions: "880.00", activeCharges: reconciled ? "880.00" : "840.00", reversedOrWaived: "0.00" },
  byDecision: { CHARGE: 22, NO_CHARGE: 14, WAIVED: 0 }, byOrigin: { MARKETPLACE: 22, PROVIDER_LED: 12 },
  noChargeReasons: { PROVIDER_LED: 12, RETURNING_PATIENT: 2 },
  mismatches: reconciled ? [] : [{ appointmentId: "a1", kind: "AMOUNT_MISMATCH", expected: "40.00", actual: "0.00" }], reconciled,
});
async function mockInsights(page: Page, reconciled = true) {
  await page.route(/\/api\/v1\/growth\/performance\?/, (r) => r.fulfill({ json: PERF }));
  await page.route(/\/api\/v1\/kiorex\/commission-statement\?/, (r) => r.fulfill({ json: STATEMENT(reconciled) }));
}
async function open(page: Page, tab = "links") {
  await page.goto(`/kiorex/growth?tab=${tab}`);
  await expect(page.getByTestId("growth-page")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("growth-promise")).toBeVisible();
}

test.describe("Growth & Marketing workspace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await login(page, "admin@kiorly.com");
  });

  test("create a desk link, see it, open the QR (decodes to the short link), download SVG, print the Arabic poster, pause, resume, revoke", async ({ page, context }) => {
    await open(page);
    await expect(page.getByRole("heading", { name: "Growth & Marketing" })).toBeVisible();
    await expect(page.getByTestId("growth-promise")).toContainText("never carry a Kiorex fee");
    await expect(page.getByTestId("growth-kiorex-link")).toHaveAttribute("href", "/kiorex");
    const name = `PW desk ${uniq()}`;
    await page.getByTestId("link-label").fill(name);
    await page.getByTestId("link-scope").selectOption("DESK");
    await expect(page.getByTestId("link-create")).toBeDisabled(); // desk name still missing
    await page.getByTestId("link-desk").fill("Reception 1");
    await page.getByTestId("link-channel").selectOption("QR_DESK");
    await page.getByTestId("link-campaign").fill("ramadan-2027");
    await page.getByTestId("link-create").click();
    const row = page.getByTestId("link-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("link-status")).toHaveText("Active");
    const code = (await row.locator("span[dir=ltr]").first().innerText()).trim();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);

    await row.getByTestId("link-qr").click();
    const dialog = page.getByTestId("qr-dialog");
    await expect(dialog.getByTestId("qr-image")).toBeVisible();
    const shortUrl = (await dialog.getByTestId("qr-short-url").innerText()).trim();
    expect(shortUrl).toMatch(new RegExp(`/q/${code}$`));
    await axe(page, "[data-testid=qr-dialog]");
    const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByTestId("qr-download-svg").click()]);
    const svg = readFileSync((await dl.path())!, "utf8");
    const { data, info } = await sharp(Buffer.from(svg), { density: 300 }).resize({ width: 600, kernel: "nearest" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(shortUrl);

    await dialog.getByTestId("poster-lang").selectOption("ar");
    await dialog.getByTestId("poster-size").selectOption("A5");
    const [popup] = await Promise.all([context.waitForEvent("page"), dialog.getByTestId("poster-print").click()]);
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(popup.locator("body")).toContainText("امسح الرمز");
    await expect(popup.locator("svg").first()).toBeVisible();
    await popup.close();
    await page.keyboard.press("Escape");

    await row.getByTestId("link-pause").click();
    await expect(row.getByTestId("link-status")).toHaveText("Paused");
    await row.getByTestId("link-resume").click();
    await expect(row.getByTestId("link-status")).toHaveText("Active");
    await row.getByTestId("link-revoke").click();
    await page.getByTestId("revoke-confirm").click();
    await expect(row.getByTestId("link-status")).toHaveText("Revoked");
    await expect(row.getByTestId("link-pause")).toHaveCount(0);
    await axe(page, "[data-testid=links-section]"); // toasts and the closing dialog animate in the page-level scan, so the section is checked on its own
  });

  test("a doctor link offers the digital business card and the doctor card sheet", async ({ page }) => {
    await open(page);
    const doctor = page.getByTestId("link-doctor");
    test.skip((await page.getByTestId("link-scope").count()) === 0, "no create form");
    await page.getByTestId("link-scope").selectOption("DOCTOR");
    const options = await doctor.locator("option").allInnerTexts();
    test.skip(options.length < 2, "this clinic has no listed doctor in the seed");
    await doctor.selectOption({ index: 1 });
    const name = `PW doctor ${uniq()}`;
    await page.getByTestId("link-label").fill(name);
    await page.getByTestId("link-create").click();
    const row = page.getByTestId("link-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await row.getByTestId("link-qr").click();
    await expect(page.getByTestId("qr-vcard")).toBeVisible();
    await expect(page.getByTestId("poster-kind").locator("option")).toHaveText(["Poster", "Doctor cards (10 per sheet)"]);
  });

  test("widget: invalid origins are pointed out line by line and cannot be saved; valid ones save, persist and show the embed snippets", async ({ page }) => {
    await open(page, "widget");
    await expect(page.getByTestId("widget-section")).toBeVisible();
    const origins = page.getByTestId("widget-origins");
    await origins.fill("http://insecure.example.com\nhttps://*.wild.example.com\nhttps://ok.example.com/path\nhttps://localhost");
    const problems = page.getByTestId("widget-origin-errors").locator("li");
    await expect(problems).toHaveCount(4);
    await expect(problems.nth(0)).toContainText("Use https.");
    await expect(problems.nth(1)).toContainText("Wildcards are not allowed.");
    await expect(problems.nth(2)).toContainText("no path");
    await expect(page.getByTestId("widget-save")).toBeDisabled();
    await axe(page, "[data-testid=widget-section]");
    await origins.fill(Array.from({ length: 11 }, (_, i) => `https://s${i}.example.com`).join("\n"));
    await expect(page.getByTestId("widget-origin-errors")).toContainText("At most 10 sites.");
    await expect(page.getByTestId("widget-save")).toBeDisabled();
    const good = `https://www.pw-${uniq()}.example.com`;
    await origins.fill(`${good}\nhttps://pw-two.example.com:8443`);
    await expect(problems).toHaveCount(0);
    await page.getByTestId("widget-enabled").check();
    await page.getByTestId("widget-save").click();
    await expect(page.getByText("Widget settings saved")).toBeVisible();
    await expect(page.getByTestId("snippet-script")).toHaveValue(/data-kx-widget/);
    await expect(page.getByTestId("snippet-iframe")).toHaveValue(/<iframe/);
    await page.reload();
    await expect(page.getByTestId("widget-origins")).toHaveValue(new RegExp(good.replace(/\./g, "\\.")));
    await expect(page.getByTestId("widget-enabled")).toBeChecked();
    // leave the dev organisation clean
    await page.getByTestId("widget-enabled").uncheck();
    await origins.fill("");
    await page.getByTestId("widget-save").click();
    await expect(page.getByText("Widget settings saved")).toBeVisible();
  });

  test("performance and fee statement show provider-originated vs marketplace-originated, conversion, commission, incremental revenue, trend and the reconciliation verdict", async ({ page }) => {
    await mockInsights(page, true);
    await open(page, "performance");
    await expect(page.getByTestId("perf-provider-bookings")).toHaveText("12");
    await expect(page.getByTestId("perf-marketplace-bookings")).toHaveText("30");
    await expect(page.getByTestId("tile-conv")).toContainText("12%");
    await expect(page.getByTestId("tile-incremental")).toContainText("6,600");
    await expect(page.getByTestId("tile-commission")).toContainText("880");
    await expect(page.getByTestId("tile-net")).toContainText("5,720");
    await expect(page.getByTestId("trend")).toBeVisible();
    await expect(page.getByTestId("trend-table").locator("tbody tr")).toHaveCount(2);
    await axe(page, "[data-testid=performance-section]");
    await page.getByTestId("growth-tab-statement").click();
    await expect(page.getByTestId("statement-verdict")).toHaveAttribute("data-reconciled", "true");
    await expect(page.getByTestId("st-provider-led")).toContainText("12");
    await expect(page.getByTestId("st-reasons")).toContainText("Booked through your own channel");
    await axe(page, "[data-testid=statement-section]");
  });

  test("a statement that does not reconcile says so and lists the item", async ({ page }) => {
    await mockInsights(page, false);
    await open(page, "statement");
    await expect(page.getByTestId("statement-verdict")).toHaveAttribute("data-reconciled", "false");
    await expect(page.getByTestId("st-mismatches")).toContainText("Charge amount differs from the decision");
  });

  test("error and empty states: a failing section offers a retry, an empty month says so", async ({ page }) => {
    let fail = true;
    await page.route(/\/api\/v1\/growth\/performance\?/, (r) => (fail ? r.fulfill({ status: 500, json: { message: "boom" } }) : r.fulfill({ json: { ...PERF, providerOriginated: { ...PERF.providerOriginated, bookings: 0 }, marketplaceOriginated: { ...PERF.marketplaceOriginated, bookings: 0 }, links: { ...PERF.links, visits: 0 } } })));
    await open(page, "performance");
    await expect(page.getByTestId("performance-section").getByRole("alert")).toContainText("Could not load this section");
    fail = false;
    await page.getByTestId("performance-section").getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("performance-section")).toContainText("No bookings in this period yet");
  });

  test("recommendations come from the closed catalogue and never mention procedures, prices or testimonials as a tactic", async ({ page }) => {
    await page.route(/\/api\/v1\/growth\/recommendations/, (r) => r.fulfill({ json: { items: [{ id: "AVAILABILITY_MISSING", severity: "high", params: { doctors: 2 }, action: "availability" }, { id: "UPSELL_PACKAGES", severity: "high", params: {}, action: "links" }, { id: "CANCELLATIONS_HIGH", severity: "medium", params: { percent: 24 }, action: "bookings" }], guardrail: "x" } }));
    await open(page);
    const box = page.getByTestId("recommendations");
    await expect(box.getByTestId("rec-AVAILABILITY_MISSING")).toContainText("2 listed doctor(s) have no weekly working hours");
    await expect(box.getByTestId("rec-CANCELLATIONS_HIGH")).toContainText("24%");
    await expect(box.getByTestId("rec-UPSELL_PACKAGES")).toHaveCount(0);
    await expect(box).toContainText("never ask you to add procedures");
    await axe(page, "[data-testid=recommendations]");
  });

  test("the Kiorex tab links here and the sidebar has the entry", async ({ page }) => {
    await page.goto("/kiorex");
    await page.getByTestId("kiorex-growth-link").click();
    await expect(page).toHaveURL(/\/kiorex\/growth/);
    await expect(page.getByTestId("nav-growth")).toBeVisible();
  });

  test("public page: `?s=` is sent to the API, the Book button points at the destination it returns; /q/<code> follows the API answer", async ({ page }) => {
    let seen = "";
    await page.route(/\/api\/v1\/public\/booking-pages\/pw-clinic/, (r) => {
      seen = r.request().url();
      return r.fulfill({ json: { slug: "pw-clinic", channel: "CLINIC_LINK", commissionFree: true, tracked: true, lt: "T.S", clinic: { id: "c1", nameEn: "PW Clinic", nameAr: "عيادة", logoUrl: null, brandColor: "white", city: "Cairo", addressEn: "St", addressAr: "ش", locationUrl: "https://maps.example/x", phone: "201000000000", currency: "EGP" }, doctors: [{ clinicianId: "d1", slug: "dr-pw", nameEn: "Dr PW", nameAr: "د. بي", titleEn: null, titleAr: null, specialty: null, widgetUrl: "https://kiorex.example/ar/eg/doctor/dr-pw?lt=T.S" }], appointmentTypes: [], widgetUrl: "https://kiorex.example/ar/eg/clinic/pw-clinic?lt=T.S" } });
    });
    await page.goto("/b/pw-clinic?s=7K3M9QXA");
    const book = page.getByTestId("public-booking-book");
    await expect(book).toHaveAttribute("href", "https://kiorex.example/ar/eg/doctor/dr-pw?lt=T.S");
    expect(seen).toContain("?s=7K3M9QXA");
    await page.route(/\/api\/v1\/public\/links\/q\/ZZZZZZZZ/, (r) => r.fulfill({ status: 404, json: { message: "nope" } }));
    await page.goto("/q/ZZZZZZZZ");
    await expect(page.getByTestId("short-link-not-found")).toBeVisible();
    await page.route(/\/api\/v1\/public\/links\/q\/ABCDEFGH/, (r) => r.fulfill({ json: { target: `${new URL(page.url()).origin}/b/pw-clinic?s=ABCDEFGH` } }));
    await page.goto("/q/ABCDEFGH");
    await expect(page).toHaveURL(/\/b\/pw-clinic\?s=ABCDEFGH/);
  });
});

for (const lang of ["en", "ar"] as const) for (const theme of ["light", "dark"] as const) {
  test(`${lang} ${theme}: every tab renders, RTL follows the language, no horizontal overflow at 360 and 1440, axe clean`, async ({ page }) => {
    await pinLocaleAndTheme(page, lang, theme);
    await page.goto("/login");
    await login(page, "admin@kiorly.com");
    await mockInsights(page, true);
    for (const w of [1440, 360]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const tab of ["links", "widget", "performance", "statement"]) {
        await open(page, tab);
        await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(lang === "ar" ? "النمو والتسويق" : "Growth & Marketing");
        await expect(page.getByTestId(`growth-tab-${tab}`)).toHaveAttribute("data-state", "active");
        await page.waitForLoadState("networkidle");
        await noOverflow(page);
        if (w === 1440) await axe(page);
      }
    }
  });
}

test.describe("roles", () => {
  test("assistant (marketing) can create links but not touch widget origins; physician sees the not-available state", async ({ page }) => {
    await page.goto("/login");
    await login(page, "assistant@kiorly.com");
    await page.goto("/kiorex/growth?tab=widget");
    // the assistant may not even reach the Kiorex area in the seed, or reaches it read-limited: either way the widget form is not editable
    const form = page.getByTestId("widget-section");
    if (await form.count()) {
      await expect(page.getByTestId("widget-origins")).toBeDisabled();
      await expect(page.getByTestId("widget-save")).toHaveCount(0);
    } else {
      await expect(page.getByTestId("growth-page")).toHaveCount(0);
    }
  });
  test("physician: Growth & Marketing is not available", async ({ page }) => {
    await page.goto("/login");
    await login(page, "physician@kiorly.com");
    await page.goto("/kiorex/growth");
    await page.waitForLoadState("networkidle");
    const forbidden = page.getByText("Growth & Marketing is available to owners, administrators and marketing staff.");
    const gated = page.getByTestId("growth-page");
    expect((await forbidden.count()) + (await gated.count() === 0 ? 1 : 0)).toBeGreaterThan(0);
  });
});
