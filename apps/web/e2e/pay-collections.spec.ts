import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Prisma } from "@prisma/client";
import { pinLocaleAndTheme } from "./crash-sweep-helpers";
import { login } from "./helpers";
import { provisionOrg, type Fixtures } from "./support/db-fixtures";

/**
 * Kiorly Pay screens against a running PRIVATE stack (scripts/pay-e2e-stack.sh; flag clinic.pay_collections satisfied by the fixture snapshot): real API, mock providers.
 * Covers: the matching queue (exact reference applied by itself, suggested match with confidence, unmatched row, reversal never auto, manual match, overpayment refused, reject, audit), payment links
 * with QR and the public payer page (patient side) in English and Arabic, invoice payment status, refund requests, deposit checkout routing through the Pay layer, finance-only access, no overflow and axe.
 * The spec creates its own organisation in the private database (DATABASE_URL of the stack) and removes it afterwards.
 */
let fx: Fixtures;
const stamp = Date.now().toString(36);
const num = (k: string) => `PAYE-${stamp}-${k}`;
let patientId = "";
const ids: Record<string, string> = {};

const money = (n: number) => new Prisma.Decimal(String(n));
async function invoice(key: string, amount: number) {
  const inv = await fx.prisma.invoice.create({ data: { tenantId: fx.org.tenantId, clinicId: fx.org.clinicId, patientId, invoiceNumber: num(key), currency: "EGP", backgroundColor: "#fff", sectionsSnapshot: {}, patientName: "Ahmed Hassan", clinicNameEn: "Fixture clinic", clinicNameAr: "عيادة الاختبار", clinicAddressEn: "a", clinicAddressAr: "ع", clinicPhone: "1", clinicEmail: "b@x.test", clinicLicenseNumber: "L", lines: { create: [{ purpose: "Consultation", amountPaid: money(amount) }] } } });
  ids[key] = inv.id;
  return inv;
}
const csv = (...rows: string[]) => ["bankRef,amount,currency,reference,paidAt,payer,status,type", ...rows].join("\n");
const row = (bankRef: string, amount: string, ref: string, type = "credit") => `${bankRef},${amount},EGP,${ref},${new Date().toISOString()},Ahmed Hassan,success,${type}`;
const axe = async (page: Page, scope: string) => {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).include(scope).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.failureSummary?.replace(/\s+/g, " ")} ${n.html.slice(0, 160)}`).join(" | ")}`)).toEqual([]);
};
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
const upload = async (page: Page, content: string) => {
  await page.getByTestId("pay-ipn-file").setInputFiles({ name: "bank.csv", mimeType: "text/csv", buffer: Buffer.from(content) });
  await expect(page.getByTestId("pay-upload-result")).toBeVisible({ timeout: 30_000 });
};

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  fx = await provisionOrg({ bookableVisitType: true });
  patientId = (await fx.prisma.patient.create({ data: { tenantId: fx.org.tenantId, mrn: `PAYE-${stamp}`, firstNameEn: "Ahmed", lastNameEn: "Hassan", gender: "UNKNOWN", phone: "+201055509901", requiresAppointmentDeposit: true } })).id;
  await invoice("A", 500); await invoice("B", 700); await invoice("C", 320); await invoice("D", 400); await invoice("E", 90);
});
test.afterAll(async () => { await fx?.cleanup(); });

test("matching: exact reference applies by itself, a partial reference is suggested with confidence, an amount-only or reversal row never auto-applies; safety floors are stated", async ({ page }) => {
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, fx.org.finance);
  await page.goto("/pay");
  await expect(page.getByTestId("pay-page")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("pay-mock-note")).toBeVisible();
  await expect(page.getByTestId("pay-floors")).toContainText("0.95");
  await upload(page, csv(row("E1", "500.00", num("A")), row("E2", "700.00", `${num("B")}-note`), row("E3", "320.00", ""), row("E4", "55.00", num("E"), "reversal")));
  await expect(page.getByTestId("pay-upload-result")).toContainText("applied 1");
  // exact: applied, no human step; the invoice is paid
  expect(Number((await fx.prisma.billingPayment.aggregate({ where: { invoiceId: ids.A }, _sum: { totalAmount: true } }))._sum.totalAmount ?? 0)).toBe(500);
  const e2 = page.getByTestId("pay-row-E2");
  await expect(e2).toHaveAttribute("data-decision", "REVIEW");
  await expect(e2).toContainText(num("B"));
  await expect(e2).toContainText(/confidence 0\.\d+/);
  await expect(e2).toContainText("Reference partly matches");
  const e3 = page.getByTestId("pay-row-E3");
  await expect(e3).toHaveAttribute("data-decision", /UNMATCHED|REVIEW/);
  await expect(e3.getByText("No suggestion")).toBeVisible();
  const e4 = page.getByTestId("pay-row-E4");
  await expect(e4).toContainText("Reversal or refund row");
  await expect(page.getByTestId("pay-manual-E4")).toHaveCount(0);
  expect(Number((await fx.prisma.billingPayment.aggregate({ where: { invoiceId: ids.E }, _sum: { totalAmount: true } }))._sum.totalAmount ?? 0)).toBe(0);
  await expect(page.getByTestId("pay-match-summary")).toContainText("Waiting for review: 3");
});

test("matching: confirm a suggestion, match manually (overpayment refused), reject, and read the audit trail", async ({ page }) => {
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, fx.org.finance);
  await page.goto("/pay");
  await page.getByTestId("pay-confirm-E2").click();
  await expect(page.getByTestId("pay-row-E2")).toHaveCount(0, { timeout: 15_000 });
  expect(Number((await fx.prisma.billingPayment.aggregate({ where: { invoiceId: ids.B }, _sum: { totalAmount: true } }))._sum.totalAmount ?? 0)).toBe(700);
  // manual: a 320 payment cannot be matched to the 90 invoice (larger than owed), and can to invoice C
  await page.getByTestId("pay-manual-E3").click();
  await page.getByTestId("pay-manual-q").fill(num("E"));
  await page.getByTestId(`pay-pick-${num("E")}`).click();
  await page.getByTestId("pay-manual-confirm").click();
  await expect(page.getByTestId("pay-manual-error")).toContainText(/larger than what the invoice still owes/i);
  await page.getByTestId("pay-manual-q").fill(num("C"));
  await page.getByTestId(`pay-pick-${num("C")}`).click();
  await page.getByTestId("pay-manual-confirm").click();
  await expect(page.getByTestId("pay-manual-dialog")).toHaveCount(0, { timeout: 15_000 });
  expect(Number((await fx.prisma.billingPayment.aggregate({ where: { invoiceId: ids.C }, _sum: { totalAmount: true } }))._sum.totalAmount ?? 0)).toBe(320);
  // reject the reversal row; it leaves the queue and shows under Rejected
  await page.getByTestId("pay-reject-E4").click();
  await expect(page.getByTestId("pay-row-E4")).toHaveCount(0, { timeout: 15_000 });
  await page.getByTestId("pay-filter-REJECTED").click();
  await expect(page.getByTestId("pay-row-E4")).toBeVisible();
  // audit: who did what
  await page.getByTestId("pay-filter-CONFIRMED").click();
  await page.getByTestId("pay-audit-E3").click();
  const events = page.getByTestId("pay-audit-events").locator("li");
  await expect(events).toHaveCount(2);
  await expect(events.nth(0)).toHaveAttribute("data-action", "PAY_MATCH_RECEIVED");
  await expect(events.nth(1)).toHaveAttribute("data-action", "PAY_MATCH_CONFIRMED");
  await expect(events.nth(1)).toContainText("Fixture finance");
  await page.keyboard.press("Escape");
  await page.getByTestId("pay-filter-APPLIED").click();
  await page.getByTestId("pay-audit-E1").click();
  await expect(page.getByTestId("pay-audit-events").locator("li").nth(1)).toHaveAttribute("data-action", "PAY_MATCH_AUTO_APPLIED");
});

test("links: create an amount-locked payment link with a QR, the patient page shows it, a bank row for exactly that amount marks it paid", async ({ page, browser }) => {
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, fx.org.finance);
  await page.goto("/pay");
  await page.getByTestId("pay-tab-links").click();
  await page.getByTestId("pay-find").fill(num("D"));
  await page.getByTestId("pay-find-go").click();
  await page.getByTestId(`pay-invoice-${num("D")}`).click();
  await expect(page.getByTestId("pay-invoice-status")).toHaveAttribute("data-state", "PENDING");
  await page.getByTestId("pay-link-create").click();
  const url = await page.getByTestId("pay-link-url").innerText();
  expect(url).toMatch(/\/pay\/l\/[^/]+$/);
  await expect(page.getByTestId("pay-qr")).toBeVisible();
  // the patient opens it (no sign-in)
  const ctx = await browser.newContext({ locale: "en" });
  const p = await ctx.newPage();
  const path = new URL(url).pathname;
  await p.goto(path);
  await expect(p.getByTestId("pay-link-page")).toHaveAttribute("data-status", "ACTIVE", { timeout: 30_000 });
  await expect(p.getByTestId("pay-link-amount")).toContainText("400");
  await expect(p.getByTestId("pay-link-reference")).toHaveText(num("D"));
  await expect(p.getByText("Kiorly does not hold funds")).toBeVisible();
  await noOverflow(p);
  await axe(p, "[data-testid=pay-link-page]");
  // a different amount does not consume the link; the exact one does
  await page.getByTestId("pay-tab-matching").click();
  await upload(page, csv(row("L1", "399.00", num("D"))));
  await p.reload(); await expect(p.getByTestId("pay-link-page")).toHaveAttribute("data-status", "ACTIVE", { timeout: 30_000 });
  await upload(page, csv(row("L2", "400.00", num("D"))));
  await p.reload(); await expect(p.getByTestId("pay-link-page")).toHaveAttribute("data-status", "USED", { timeout: 30_000 });
  await expect(p.getByTestId("pay-link-status")).toContainText("Paid");
  // Arabic, RTL
  const ar = await browser.newContext({ locale: "ar" });
  const q = await ar.newPage();
  await pinLocaleAndTheme(q, "ar", "light");
  await q.goto(path);
  await expect(q.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(q.getByTestId("pay-link-status")).toContainText("تم الدفع");
  await ctx.close(); await ar.close();
  // staff status: the invoice is paid, with the bank row and the payment
  await page.getByTestId("pay-tab-links").click();
  await page.getByTestId("pay-find").fill(num("D"));
  await page.getByTestId("pay-find-go").click();
  await expect(page.getByTestId("pay-find-none")).toBeVisible();
  const status = await fx.prisma.billingPayment.aggregate({ where: { invoiceId: ids.D }, _sum: { totalAmount: true } });
  expect(Number(status._sum.totalAmount)).toBe(400);
});

test("refund request: from the invoice status card and the Refunds tab; the list shows the status; the server limits are shown, not bypassed", async ({ page }) => {
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, fx.org.finance);
  await page.goto("/pay");
  await page.getByTestId("pay-tab-refunds").click();
  await expect(page.getByTestId("pay-refunds-empty")).toBeVisible();
  const pay = await fx.prisma.billingPayment.findFirstOrThrow({ where: { invoiceId: ids.A } });
  await page.getByTestId("pay-refund-payment").fill(pay.id);
  await page.getByTestId("pay-refund-amount").fill("600");
  await page.getByTestId("pay-refund-reason").fill("Test over-refund");
  await page.getByTestId("pay-refund-submit").click();
  await expect(page.getByTestId("pay-refund-error")).toBeVisible();
  await page.getByTestId("pay-refund-amount").fill("50");
  await page.getByTestId("pay-refund-reason").fill("Patient request");
  await page.getByTestId("pay-refund-submit").click();
  await expect(page.getByTestId("pay-refund-sent")).toBeVisible();
  await expect(page.getByTestId("pay-refund-list")).toContainText("Patient request");
  expect(await fx.prisma.billingRefund.count({ where: { tenantId: fx.org.tenantId } })).toBe(1);
  // from the invoice status card: invoice F is partly paid by a confirmed bank row, so it is still searchable and shows its payment
  await invoice("F", 200);
  await page.getByTestId("pay-tab-matching").click();
  await upload(page, csv(row("F1", "50.00", num("F"))));
  await expect(page.getByTestId("pay-row-F1")).toHaveAttribute("data-decision", "REVIEW");
  await page.getByTestId("pay-confirm-F1").click();
  await expect(page.getByTestId("pay-row-F1")).toHaveCount(0, { timeout: 15_000 });
  await page.getByTestId("pay-tab-links").click();
  await page.getByTestId("pay-find").fill(num("F"));
  await page.getByTestId("pay-find-go").click();
  await page.getByTestId(`pay-invoice-${num("F")}`).click();
  await expect(page.getByTestId("pay-invoice-status")).toHaveAttribute("data-state", "PARTIAL");
  await page.getByTestId("pay-refund-open").click();
  await page.getByTestId("pay-inline-amount").fill("20");
  await page.getByTestId("pay-inline-reason").fill("Overcharged");
  await page.getByTestId("pay-inline-submit").click();
  await expect(page.getByTestId("pay-refund-inline")).toHaveCount(0, { timeout: 15_000 });
  expect(await fx.prisma.billingRefund.count({ where: { tenantId: fx.org.tenantId } })).toBe(2);
});

test("deposit checkout routing: the dialog offers Let Kiorly choose, explains where it goes and creates the link there (mock Kiorex Pay host)", async ({ page }) => {
  await pinLocaleAndTheme(page, "en", "light");
  const doctor = await fx.prisma.user.findFirstOrThrow({ where: { tenantId: fx.org.tenantId, role: "PHYSICIAN" } });
  const startsAt = new Date(Date.now() + 5 * 86_400_000);
  const apt = await fx.prisma.appointment.create({ data: { tenantId: fx.org.tenantId, clinicId: fx.org.clinicId, clinicianId: doctor.id, patientId, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), feeAmount: money(300), status: "CONFIRMED" } });
  await login(page, fx.org.reception);
  await page.goto(`/appointments/${apt.id}`);
  const open = page.getByTestId("deposit-send-link").or(page.getByTestId("deposit-ask-optional"));
  await open.first().click({ timeout: 60_000 });
  await page.getByRole("radio", { name: "Let Kiorly choose" }).click();
  await expect(page.getByTestId("deposit-route-hint")).toContainText("Kiorex Pay");
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByTestId("deposit-link-created")).toContainText("https://pay.kiorex.example/deposit/");
  const dep = await fx.prisma.patientDeposit.findFirstOrThrow({ where: { tenantId: fx.org.tenantId, appointmentId: apt.id } });
  expect(dep.method).toBe("KIOREX_PAY");
});

test("finance-only: the front desk never reaches the matching queue, the report or the bank rows (screen and API)", async ({ page }) => {
  await pinLocaleAndTheme(page, "en", "light");
  await login(page, fx.org.reception);
  await page.goto("/pay");
  await page.waitForTimeout(2_000);
  await expect(page.getByTestId("pay-queue")).toHaveCount(0);
  await expect(page.getByTestId("pay-rollup-table")).toHaveCount(0);
  const status = await page.evaluate(async () => {
    const token = (JSON.parse(localStorage.getItem("cms-auth") ?? "{}") as { state?: { accessToken?: string; token?: string } }).state;
    const bearer = token?.accessToken ?? token?.token ?? "";
    const r = await fetch("/api/v1/billing/pay/matching/queue", { headers: { authorization: `Bearer ${bearer}` } });
    return r.status;
  });
  expect([401, 403]).toContain(status);
});

for (const lang of ["en", "ar"] as const) {
  for (const width of [320, 1440]) {
    test(`Pay screens (${lang}, ${width}px): content, RTL, no raw keys, no horizontal overflow, axe clean`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
      await pinLocaleAndTheme(page, lang, "light");
      await login(page, fx.org.finance);
      await page.goto("/pay");
      await expect(page.getByTestId("pay-page")).toBeVisible({ timeout: 60_000 });
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      for (const tab of ["matching", "links", "refunds", "rollup"]) {
        await page.getByTestId(`pay-tab-${tab}`).click();
        const root = page.getByTestId("pay-page");
        expect(await root.innerText()).not.toMatch(/\bpay\.[a-zA-Z]+\.[a-zA-Z]+/);
        if (lang === "ar") expect(await root.innerText()).toMatch(/[؀-ۿ]/);
        await noOverflow(page);
        await axe(page, "[data-testid=pay-page]");
      }
      await page.getByTestId("pay-tab-matching").click();
      await page.getByTestId("pay-filter-CONFIRMED").click();
      await expect(page.getByTestId("pay-queue")).toBeVisible();
      await page.waitForTimeout(600); // let the colour transition of the pressed filter settle before axe samples it
      await axe(page, "[data-testid=pay-page]");
      if (width === 1440) await page.screenshot({ path: `e2e/screenshots/pay-matching-${lang}.png`, fullPage: true });
    });
  }
}
