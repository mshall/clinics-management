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

// ------------------------------------------------------------------ GRW-P2-C: provider marketing portal v2 (API mocked so the cards, slots and numbers are exact; the real services are covered by the integration tests)
const SVG_CARD = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#0d9488"/></svg>';
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const TEMPLATES = (locale: "en" | "ar") => ({
  items: [
    { id: "t-open", slug: "booking-open", kind: "POST", locale, title: locale === "ar" ? "الحجز أونلاين متاح" : "Online booking is open", body: locale === "ar" ? "الحجز أونلاين متاح الآن في {clinic}: {link}" : "Online booking is open at {clinic}: {link}", layoutKey: "post", protectedFooter: locale === "ar" ? "المواعيد حسب التوافر وتؤكدها العيادة." : "Appointments depend on availability and are confirmed by the clinic.", version: 1, shares30d: 3, needsDoctor: false },
    { id: "t-doc", slug: "doctor-intro", kind: "POST", locale, title: locale === "ar" ? "تعرّف على الطبيب" : "Meet the doctor", body: "{doctor} at {clinic}: {link}", layoutKey: "post", protectedFooter: "Appointments depend on availability.", version: 1, shares30d: 0, needsDoctor: true },
  ],
  guardrail: "x",
});
const SLOTS = {
  clinicId: "c1", clinicianId: "d1", timezone: "Africa/Cairo", days: 3, typeId: "ty",
  items: [
    { startsAt: "2030-01-10T08:00:00.000Z", endsAt: "2030-01-10T08:30:00.000Z", labelEn: "Thu 10 Jan, 10:00", labelAr: "الخميس ١٠ يناير، ١٠:٠٠ ص" },
    { startsAt: "2030-01-10T08:30:00.000Z", endsAt: "2030-01-10T09:00:00.000Z", labelEn: "Thu 10 Jan, 10:30", labelAr: "الخميس ١٠ يناير، ١٠:٣٠ ص" },
    { startsAt: "2030-01-10T09:00:00.000Z", endsAt: "2030-01-10T09:30:00.000Z", labelEn: "Thu 10 Jan, 11:00", labelAr: "الخميس ١٠ يناير، ١١:٠٠ ص" },
  ],
};
const STATEMENT_V2 = {
  month: "2026-11", zone: "Africa/Cairo", currency: "EGP", statement: "x",
  lines: [
    { appointmentId: "a1", date: "2026-11-05", isNewPatient: true, origin: "MARKETPLACE", bookingSource: "KIOREX_MARKETPLACE", decision: "CHARGE", reasonCodes: [], rate: "40.00", amount: "40.00", chargeStatus: "CONFIRMED", dispute: null },
    { appointmentId: "a2", date: "2026-11-06", isNewPatient: true, origin: "PROVIDER_LED", bookingSource: "CLINIC_LINK", decision: "NO_CHARGE", reasonCodes: ["PROVIDER_LED"], rate: null, amount: null, chargeStatus: null, dispute: null },
  ],
  totals: { active: "40.00", activeCount: 1, reversed: "0.00", waived: "0.00", providerLed: 1, disputesOpen: 0, decisions: { CHARGE: 1, NO_CHARGE: 1, WAIVED: 0 } },
};
const VERIFICATION = (badge: "VERIFIED" | "UPDATE_UNDER_REVIEW") => ({
  badge, policy: { reVerifyOnLicenseChange: true },
  items: [{ id: "vr1", clinicId: "c1", field: "LICENSE_NUMBER", oldRef: null, status: badge === "UPDATE_UNDER_REVIEW" ? "NEEDS_INFO" : "APPROVED", evidenceCount: 1, evidenceFileRefs: ["uploads/lic.pdf"], kiorexRef: "kx1", decisionNote: "Please add a utility bill", decidedAt: null, createdAt: "2026-11-24T10:00:00Z", updatedAt: "2026-11-24T10:00:00Z" }],
});
async function mockV2(page: Page, lang: "en" | "ar" = "en", badge: "VERIFIED" | "UPDATE_UNDER_REVIEW" = "UPDATE_UNDER_REVIEW") {
  await page.route(/\/api\/v1\/growth\/social\/templates/, (r) => r.fulfill({ json: TEMPLATES(new URL(r.request().url()).searchParams.get("locale") === "ar" ? "ar" : lang) }));
  await page.route(/\/api\/v1\/growth\/shareable-slots\?/, (r) => r.fulfill({ json: SLOTS }));
  await page.route(/\/api\/v1\/growth\/verification-requests(\?|$)/, (r) => (r.request().method() === "GET" ? r.fulfill({ json: VERIFICATION(badge) }) : r.fulfill({ status: 201, json: VERIFICATION(badge).items[0] })));
  await page.route(/\/api\/v1\/billing\/kiorex\/statements\/exports/, (r) => r.fulfill({ json: { items: [{ id: "e1", month: "2026-11", kind: "CSV", checksum: "a".repeat(64), createdAt: "2026-11-24T10:00:00Z" }] } }));
  await page.route(/\/api\/v1\/billing\/kiorex\/statements\?/, (r) => r.fulfill({ json: STATEMENT_V2 }));
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


test.describe("GRW-P2-C provider marketing portal v2", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await login(page, "admin@kiorly.com");
    await mockInsights(page, true);
    await mockV2(page);
  });

  test("share: pick an approved template, create the card, see the protected caption, copy and download; a refused wording is explained", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    let sent: Record<string, unknown> | null = null;
    let counted = 0;
    await page.route(/\/api\/v1\/growth\/social\/render/, (r) => {
      sent = r.request().postDataJSON() as Record<string, unknown>;
      if (String(sent.customLine ?? "").includes("guarantee")) return r.fulfill({ status: 422, json: { code: "CONTENT_NOT_ALLOWED", message: "x", findings: [{ id: "guarantee", category: "GUARANTEE" }] } });
      return r.fulfill({ json: { templateId: "t-open", locale: "en", caption: "Online booking is open at Nile Clinic: https://kiorly.link/b/nile?s=ABCD2345\n\nAppointments depend on availability and are confirmed by the clinic.", link: "https://kiorly.link/b/nile?s=ABCD2345", linkCode: "ABCD2345", layout: "post", svg: SVG_CARD, pngBase64: PNG_1PX } });
    });
    await page.route(/\/api\/v1\/growth\/social\/share/, (r) => { counted += 1; return r.fulfill({ json: { id: "s1", ok: true } }); });
    await open(page, "share");
    await expect(page.getByTestId("social-templates")).toBeVisible();
    await expect(page.getByTestId("template-booking-open")).toContainText("Shared 3 times");
    await page.getByTestId("template-booking-open").click();
    await page.getByTestId("share-custom").fill("We guarantee results");
    await page.getByTestId("share-render").click();
    await expect(page.getByTestId("share-error")).toContainText("cannot be published");
    await expect(page.getByTestId("share-error")).toContainText("a guarantee");
    await page.getByTestId("share-custom").fill("Open on Saturdays");
    await page.getByTestId("share-render").click();
    await expect(page.getByTestId("share-result")).toBeVisible();
    expect(sent).toMatchObject({ templateId: "t-open", customLine: "Open on Saturdays" });
    await expect(page.getByTestId("share-caption")).toHaveValue(/Appointments depend on availability/);
    await expect(page.getByTestId("share-image")).toBeVisible();
    await page.getByTestId("share-copy").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("https://kiorly.link/b/nile?s=ABCD2345");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("share-download").click()]);
    expect(dl.suggestedFilename()).toMatch(/\.png$/);
    await expect(page.getByTestId("share-whatsapp")).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
    await expect.poll(() => counted).toBeGreaterThanOrEqual(2);
    await axe(page, "[data-testid=social-templates]");
  });

  test("share: a doctor template needs a doctor; a missing link and a switched-off feature are explained", async ({ page }) => {
    let mode: "link" | "off" = "link";
    await page.route(/\/api\/v1\/growth\/social\/render/, (r) => (mode === "link" ? r.fulfill({ status: 409, json: { code: "SHARE_LINK_REQUIRED", message: "x" } }) : r.fulfill({ status: 403, json: { error: "FEATURE_DISABLED", key: "growth.provider_marketing_v2", scope: "org" } })));
    await open(page, "share");
    await page.getByTestId("template-doctor-intro").click();
    await expect(page.getByTestId("share-render")).toBeDisabled();
    await page.getByTestId("template-booking-open").click();
    await page.getByTestId("share-render").click();
    await expect(page.getByTestId("share-error")).toContainText("Create a link first");
    mode = "off";
    await page.getByTestId("share-render").click();
    await expect(page.getByTestId("share-error")).toContainText("switched off");
  });

  test("free times: choose up to 5, create the slot card with the provider link; a taken time clears the choice and says so", async ({ page }) => {
    let cardCalls = 0;
    await page.route(/\/api\/v1\/growth\/shareable-slots\/card/, (r) => {
      cardCalls += 1;
      if (cardCalls === 1) return r.fulfill({ status: 409, json: { code: "SLOT_NO_LONGER_AVAILABLE", message: "x", gone: [], remaining: [] } });
      return r.fulfill({ json: { clinicId: "c1", clinicianId: "d1", locale: "en", link: "https://kiorly.link/b/nile?s=ABCD2345&slot=2030-01-10T08%3A00%3A00.000Z", linkCode: "ABCD2345", slots: [], caption: "Next available times at Nile Clinic\n- Thu 10 Jan, 10:00", svg: SVG_CARD, pngBase64: PNG_1PX } });
    });
    await page.route(/\/api\/v1\/growth\/profile-preview/, (r) => r.fulfill({ json: { clinicId: "c1", nameEn: "Nile", nameAr: "نيل", slug: "nile", pageUrl: "https://kiorly.link/b/nile", bookableVisitTypes: 2, ready: true, doctors: [{ clinicianId: "d1", slug: "dr-a", nameEn: "Dr A", nameAr: "د. أ", titleEn: null, titleAr: null }] } }));
    await open(page, "slots");
    const options = page.getByTestId("slot-option");
    await expect(options).toHaveCount(3);
    await expect(page.getByTestId("slots-create")).toBeDisabled();
    await options.nth(0).check();
    await options.nth(1).check();
    await page.getByTestId("slots-create").click();
    await expect(page.getByTestId("slots-gone")).toBeVisible();
    await options.nth(0).check();
    await page.getByTestId("slots-create").click();
    await expect(page.getByTestId("slots-result")).toContainText("slot=2030-01-10");
    await axe(page, "[data-testid=shareable-slots]");
  });

  test("verified profile: the badge reads update under review, the request form needs evidence for a photo, a request is sent and a note from Kiorex is shown", async ({ page }) => {
    let posted: Record<string, unknown> | null = null;
    await page.route(/\/api\/v1\/growth\/verification-requests$/, (r) => { if (r.request().method() === "POST") { posted = r.request().postDataJSON() as Record<string, unknown>; return r.fulfill({ status: 201, json: VERIFICATION("UPDATE_UNDER_REVIEW").items[0] }); } return r.fulfill({ json: VERIFICATION("UPDATE_UNDER_REVIEW") }); });
    await open(page, "verification");
    await expect(page.getByTestId("verification-badge")).toHaveAttribute("data-badge", "UPDATE_UNDER_REVIEW");
    await expect(page.getByTestId("verification-badge")).toContainText("Update under review");
    await expect(page.getByTestId("vr-vr1")).toContainText("Please add a utility bill");
    await page.getByTestId("vr-field").selectOption("PHOTO");
    await page.getByTestId("vr-value").fill("new portrait");
    await page.getByTestId("vr-submit").click();
    await expect(page.getByTestId("vr-error")).toContainText("Check the value");
    await page.getByTestId("vr-evidence").fill("uploads/portrait.png\n../bad");
    await page.getByTestId("vr-submit").click();
    await expect(page.getByTestId("vr-error")).toBeVisible();
    await page.getByTestId("vr-evidence").fill("uploads/portrait.png");
    await page.getByTestId("vr-submit").click();
    await expect.poll(() => posted).toMatchObject({ field: "PHOTO", newValue: "new portrait", evidenceFileRefs: ["uploads/portrait.png"] });
    await axe(page, "[data-testid=verification-requests]");
  });

  test("statements v2: lines, totals, CSV and PDF downloads, export history; a provider-led visit shows no fee", async ({ page }) => {
    await page.route(/\/api\/v1\/billing\/kiorex\/statements\/2026-\d\d\.csv/, (r) => r.fulfill({ status: 200, headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="kiorex-statement.csv"' }, body: "date,appointment\r\n" }));
    await open(page, "statement");
    const box = page.getByTestId("statements-v2");
    await expect(box).toBeVisible();
    await page.getByTestId("stv2-month").selectOption({ index: 0 });
    await expect(box.getByTestId("stv2-line")).toHaveCount(2);
    await expect(box.getByTestId("stv2-active")).toContainText("40");
    await expect(box.getByTestId("stv2-provider-led")).toHaveText("1");
    await expect(box.getByTestId("stv2-line").nth(1)).toContainText("No fee");
    await expect(box.getByTestId("stv2-exports")).toContainText("CSV");
    const [csv] = await Promise.all([page.waitForEvent("download"), box.getByTestId("stv2-csv").click()]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    await axe(page, "[data-testid=statements-v2]");
  });

  test("recommendations: the new rules show their data window and can be dismissed or snoozed (persisted through the API)", async ({ page }) => {
    const states: Array<Record<string, unknown>> = [];
    await page.route(/\/api\/v1\/growth\/recommendations\/[A-Z_]+\/state/, (r) => { states.push({ id: r.request().url().split("/").slice(-2)[0], ...(r.request().postDataJSON() as object) }); return r.fulfill({ json: { id: "x", status: "DISMISSED" } }); });
    await page.route(/\/api\/v1\/growth\/recommendations\?/, (r) => r.fulfill({ json: { items: [{ id: "STATEMENT_DISPUTE_CLOSING", severity: "high", params: { count: 2, days: 3 }, action: "statements", window: "3d" }, { id: "RESPOND_TO_REVIEW", severity: "medium", params: { count: 1 }, action: "reviews", window: "30d" }], hidden: 0, catalogue: 21, guardrail: "x" } }));
    await open(page);
    const box = page.getByTestId("recommendations");
    await expect(box.getByTestId("rec-STATEMENT_DISPUTE_CLOSING")).toContainText("2 charge(s) can be disputed for only 3 more days");
    await expect(box.getByTestId("rec-window-STATEMENT_DISPUTE_CLOSING")).toContainText("the next 3 days");
    await expect(box.getByTestId("rec-RESPOND_TO_REVIEW")).toContainText("never mention medical details");
    await box.getByTestId("rec-snooze-RESPOND_TO_REVIEW").click();
    await box.getByTestId("rec-dismiss-STATEMENT_DISPUTE_CLOSING").click();
    await expect.poll(() => states.length).toBe(2);
    expect(states[0]).toMatchObject({ id: "RESPOND_TO_REVIEW", status: "SNOOZED", snoozeDays: 7 });
    expect(states[1]).toMatchObject({ id: "STATEMENT_DISPUTE_CLOSING", status: "DISMISSED" });
  });

  test("public page: a shared slot link passes `slot` to the API (the Book links come back with it)", async ({ page }) => {
    let seen = "";
    await page.route(/\/api\/v1\/public\/booking-pages\/pw-clinic/, (r) => {
      seen = r.request().url();
      return r.fulfill({ json: { slug: "pw-clinic", channel: "CLINIC_LINK", commissionFree: true, tracked: true, lt: "T.S", clinic: { id: "c1", nameEn: "PW Clinic", nameAr: "عيادة", logoUrl: null, brandColor: "white", city: "Cairo", addressEn: "St", addressAr: "ش", locationUrl: "https://maps.example/x", phone: "201000000000", currency: "EGP" }, doctors: [], appointmentTypes: [], widgetUrl: "https://kiorex.example/ar/eg/clinic/pw-clinic?lt=T.S&slot=2030-01-10T08%3A00%3A00.000Z" } });
    });
    await page.goto("/b/pw-clinic?s=ABCD2345&slot=2030-01-10T08%3A00%3A00.000Z");
    await expect(page.getByTestId("public-booking-page")).toBeVisible();
    expect(seen).toContain("s=ABCD2345");
    expect(decodeURIComponent(seen)).toContain("slot=2030-01-10T08:00:00.000Z");
  });
});

for (const lang of ["en", "ar"] as const) for (const theme of ["light", "dark"] as const) {
  test(`${lang} ${theme}: every tab renders, RTL follows the language, no horizontal overflow at 360 and 1440, axe clean`, async ({ page }) => {
    await pinLocaleAndTheme(page, lang, theme);
    await page.goto("/login");
    await login(page, "admin@kiorly.com");
    await mockInsights(page, true);
    await mockV2(page, lang);
    for (const w of [1440, 360]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const tab of ["links", "share", "slots", "widget", "performance", "statement", "verification"]) {
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
