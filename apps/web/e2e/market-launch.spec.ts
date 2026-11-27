import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pinLocaleAndTheme } from "./crash-sweep-helpers";
import { login } from "./helpers";
import { assertPrivateDatabase } from "./support/db-fixtures";
import { createPrismaClient } from "../../api/src/prisma/create-prisma-client";

/**
 * Platform, Market launch (founder decisions B and C, 27 Nov 2026) against a running PRIVATE stack (DATABASE_URL = the private database the API runs on).
 * Initiate country launch (every API field is filled from the country), Go live shows a clear error and writes an audit row, Pause/Disable/Enable need a reason,
 * the history lists who did what, the second-approver rule, and the whole screen in Arabic (RTL). Serial: one market, walked through its life.
 */
const SUPER = "superadmin@kiorly.com";
const CODE = "OM"; // a country with a default row that is not live in the private database
let prisma: ReturnType<typeof createPrismaClient>;
const row = (page: Page) => page.getByTestId(`market-row-${CODE}`);
const open = async (page: Page, lang: "en" | "ar" = "en") => {
  await pinLocaleAndTheme(page, lang, "light");
  await login(page, SUPER);
  await page.goto("/platform/markets");
  await expect(page.getByTestId("market-table")).toBeVisible({ timeout: 30_000 });
};
const axe = async (page: Page, scope: string) => {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).include(scope).analyze();
  expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
};

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  assertPrivateDatabase();
  prisma = createPrismaClient();
  await prisma.$connect();
  await prisma.tenant.deleteMany({ where: { market: { code: CODE } } });
  await prisma.market.deleteMany({ where: { code: CODE } });
});
test.afterAll(async () => {
  await prisma.market.deleteMany({ where: { code: CODE } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("Initiate country launch fills currency, timezone, locale, phone region, weekend days and languages; saves a draft", async ({ page }) => {
  await open(page);
  await page.getByTestId("market-new").click();
  const dlg = page.getByTestId("market-create");
  await dlg.getByTestId("market-create-save").click(); // nothing chosen: field errors, no request
  await expect(dlg.getByRole("alert").first()).toBeVisible();
  await dlg.getByLabel(/^country/i).selectOption(CODE);
  await expect(dlg.getByLabel(/^currency/i)).toHaveValue("OMR");
  await expect(dlg.getByLabel(/^timezone/i)).toHaveValue("Asia/Muscat");
  await expect(dlg.getByLabel(/^locale/i)).toHaveValue("ar-OM");
  await expect(dlg.getByLabel(/^phone region/i)).toHaveValue("OM");
  await expect(dlg.getByLabel(/^host cell/i)).toHaveValue("frankfurt");
  // invalid timezone is caught on the form
  await dlg.getByLabel(/^timezone/i).fill("Mars/Base");
  await dlg.getByTestId("market-create-save").click();
  await expect(dlg.getByText(/valid timezone/i)).toBeVisible();
  await dlg.getByLabel(/^timezone/i).fill("Asia/Muscat");
  await axe(page, "[data-testid=market-create]");
  const post = page.waitForResponse((r) => r.url().endsWith("/api/v1/admin/platform/markets") && r.request().method() === "POST");
  await dlg.getByTestId("market-create-save").click();
  expect((await post).status()).toBe(201);
  await expect(row(page)).toBeVisible();
  await expect(row(page).getByTestId("market-status")).toHaveText("Draft");
  await expect(page.getByTestId("market-create")).toHaveCount(0);
  // the same country again is a clean message, not a failure
  await page.getByTestId("market-new").click();
  await page.getByTestId("market-create").getByLabel(/^country/i).selectOption(CODE);
  await page.getByTestId("market-create-save").click();
  await expect(page.getByTestId("market-create-error")).toContainText(/already exists/i);
});

test("Go live without the prerequisites shows a clear error and writes no audit row; with them it writes the audit row and the history shows it", async ({ page }) => {
  await open(page);
  await page.getByTestId(`market-golive-${CODE}`).click();
  const dlg = page.getByTestId("market-action-launch");
  await dlg.getByTestId("market-action-confirm").click();
  await expect(dlg.getByTestId("market-action-error")).toContainText(/at least 3 characters/i);
  await dlg.getByLabel(/^reason/i).fill("Counsel approved the launch");
  await dlg.getByLabel(/approval reference/i).fill("DOC-OM-1");
  await dlg.getByLabel(/approval link/i).fill("http://not-https.example");
  await dlg.getByTestId("market-action-confirm").click();
  await expect(dlg.getByTestId("market-action-error")).toContainText(/https/i);
  await dlg.getByLabel(/approval link/i).fill("https://docs.example.org/approvals/om-1");
  await dlg.getByTestId("market-action-confirm").click();
  await expect(dlg.getByTestId("market-action-error")).toContainText(/tax pack is missing/i); // the error the founder reported was silent: now it is on screen
  const market = await prisma.market.findFirstOrThrow({ where: { code: CODE } });
  expect(await prisma.marketAuditEvent.count({ where: { marketId: market.id, action: "LAUNCH" } })).toBe(0);
  await dlg.getByRole("button", { name: /cancel/i }).click();

  // prerequisites: tax pack
  await page.getByTestId(`market-prereq-${CODE}`).click();
  const pre = page.getByTestId("market-prereq");
  await expect(pre).toContainText(/tax pack/i);
  await pre.getByLabel(/^invoice vat/i).fill("5");
  await pre.getByLabel(/^subscription vat/i).fill("5");
  await pre.getByLabel(/^default visit fee/i).fill("20");
  await expect(pre.getByTestId("market-save-tax")).toBeDisabled(); // a reason is required
  await pre.getByLabel(/^reason/i).fill("Tax pack from the counsel memo");
  await pre.getByTestId("market-save-tax").click();
  await expect(pre.getByRole("status")).toContainText(/saved/i);
  await page.keyboard.press("Escape");
  await expect(row(page).getByTestId("market-prereq-cell")).toContainText(/ready to go live/i);

  await page.getByTestId(`market-golive-${CODE}`).click();
  const d2 = page.getByTestId("market-action-launch");
  await d2.getByLabel(/^reason/i).fill("Counsel approved the launch");
  await d2.getByLabel(/approval reference/i).fill("DOC-OM-1");
  await d2.getByLabel(/approval link/i).fill("https://docs.example.org/approvals/om-1");
  await d2.getByTestId("market-action-confirm").dblclick(); // a double click launches once
  await expect(page.getByTestId("market-action-launch")).toHaveCount(0);
  await expect(row(page).getByTestId("market-status")).toHaveText("Live");
  await expect(row(page).getByTestId("market-operability")).toContainText(/active/i);
  const ev = await prisma.marketAuditEvent.findMany({ where: { marketId: market.id, action: "LAUNCH" } });
  expect(ev).toHaveLength(1);
  expect(ev[0]).toMatchObject({ actorSource: "CLINIC_PLATFORM", reason: "Counsel approved the launch", approvalRef: "DOC-OM-1", approvalLink: "https://docs.example.org/approvals/om-1", fromStatus: "DRAFT", toStatus: "LIVE" });
  expect(ev[0]!.actorEmail).toBe(SUPER);

  await page.getByTestId(`market-history-${CODE}`).click();
  const hist = page.getByTestId("market-history");
  await expect(hist.getByTestId("market-history-row").first()).toContainText("LAUNCH");
  await expect(hist.getByTestId("market-history-row").first()).toContainText("Counsel approved the launch");
  await expect(hist.getByTestId("market-history-row").first()).toContainText("DOC-OM-1");
  await expect(hist.getByTestId("market-history-row").first()).toContainText(SUPER);
});

test("Pause, Disable and Enable each need a reason, validate the days, and write audit rows", async ({ page }) => {
  await open(page);
  const market = await prisma.market.findFirstOrThrow({ where: { code: CODE } });
  await page.getByTestId(`market-pause-${CODE}`).click();
  const dlg = page.getByTestId("market-action-pause");
  await dlg.getByLabel(/^reason/i).fill("Payment partner outage");
  for (const bad of ["0", "366", "1.5", "abc"]) {
    await dlg.getByLabel(/^days/i).fill(bad);
    await dlg.getByTestId("market-action-confirm").click();
    await expect(dlg.getByTestId("market-action-error")).toContainText(/whole number of days/i);
  }
  await dlg.getByLabel(/^days/i).fill("3");
  await dlg.getByTestId("market-action-confirm").click();
  await expect(row(page).getByTestId("market-operability")).toContainText(/paused/i);
  await page.getByTestId(`market-enable-${CODE}`).click();
  await page.getByTestId("market-action-enable").getByLabel(/^reason/i).fill("Outage is over");
  await page.getByTestId("market-action-enable").getByTestId("market-action-confirm").click();
  await expect(row(page).getByTestId("market-operability")).toContainText(/active/i);
  await page.getByTestId(`market-disable-${CODE}`).click();
  await page.getByTestId("market-action-disable").getByLabel(/^reason/i).fill("Regulator question");
  await page.getByTestId("market-action-disable").getByTestId("market-action-confirm").click();
  await expect(row(page).getByTestId("market-operability")).toContainText(/disabled/i);
  const actions = (await prisma.marketAuditEvent.findMany({ where: { marketId: market.id }, orderBy: { createdAt: "asc" } })).map((e) => e.action);
  expect(actions).toEqual(expect.arrayContaining(["CREATE", "TAX_PACK_UPDATED", "LAUNCH", "PAUSE", "ENABLE", "DISABLE"]));
  const paused = await prisma.marketAuditEvent.findFirstOrThrow({ where: { marketId: market.id, action: "PAUSE" } });
  expect((paused.metadata as { days: number }).days).toBe(3);
});

test("second approver (optional, default off): the change becomes a request and needs a different person", async ({ page }) => {
  await open(page);
  const market = await prisma.market.findFirstOrThrow({ where: { code: CODE } });
  expect(market.requireSecondApprover).toBe(false);
  await page.getByTestId(`market-prereq-${CODE}`).click();
  const pre = page.getByTestId("market-prereq");
  await pre.getByLabel(/^reason/i).fill("Two-person rule for this market");
  await pre.getByRole("button", { name: /turn on/i }).click();
  await expect(pre.getByRole("status")).toContainText(/saved/i);
  await page.keyboard.press("Escape");
  await page.getByTestId(`market-enable-${CODE}`).click();
  const dlg = page.getByTestId("market-action-enable");
  await expect(dlg).toContainText(/second approver is required/i);
  await dlg.getByLabel(/^reason/i).fill("Reopen the market");
  await dlg.getByTestId("market-action-confirm").click();
  await expect(page.getByTestId("market-page-note")).toContainText(/different administrator must approve/i);
  await expect(row(page).getByTestId("market-operability")).toContainText(/disabled/i); // nothing changed yet
  const reqs = await prisma.marketChangeRequest.findMany({ where: { marketId: market.id, status: "PENDING" } });
  expect(reqs).toHaveLength(1);
  // the same person cannot approve their own request
  await page.getByTestId(`market-prereq-${CODE}`).click();
  await page.getByTestId("market-prereq").getByRole("button", { name: /^approve/i }).click();
  await expect(page.getByTestId("market-prereq").getByRole("alert")).toContainText(/different person/i);
  expect((await prisma.market.findFirstOrThrow({ where: { code: CODE } })).operationalStatus).toBe("DISABLED");
});

for (const width of [360, 1280]) {
  test(`Arabic (RTL, ${width}px): the screen, the dialogs and the errors are in Arabic, no horizontal overflow, axe clean`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: /إطلاق السوق/ })).toBeVisible();
    await expect(row(page).getByTestId("market-status")).toHaveText("مباشر");
    await page.getByTestId(`market-enable-${CODE}`).click();
    await page.getByTestId("market-action-enable").getByTestId("market-action-confirm").click();
    await expect(page.getByTestId("market-action-error")).toContainText("سبباً");
    await axe(page, "[data-testid=market-action-enable]");
    await page.keyboard.press("Escape");
    await page.getByTestId(`market-history-${CODE}`).click();
    await expect(page.getByTestId("market-history")).toContainText("السجل");
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await axe(page, "[data-testid=market-table]");
  });
}

test("the country of a clinic is shown, never edited (an organisation belongs to its country for life)", async ({ page }) => {
  await login(page, "admin@drahmedshall.com");
  await page.goto("/admin");
  const cell = page.locator("tbody tr").filter({ has: page.locator("td.ltr-nums", { hasText: /^EG$/ }) }).first();
  await expect(cell).toBeVisible({ timeout: 30_000 });
  await cell.click();
  const ro = page.getByTestId("clinic-country-readonly").first();
  await expect(ro).toBeVisible();
  await expect(ro).toContainText("EG");
  await expect(page.getByText(/country is fixed when the organisation is created/i).first()).toBeVisible();
  // no country picker in the dialog
  await expect(page.getByRole("dialog").getByPlaceholder(/country/i)).toHaveCount(0);
});
