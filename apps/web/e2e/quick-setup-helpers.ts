import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { login } from "./helpers";
import { prisma } from "./nurse-fixtures";

const HERE = import.meta.dirname ?? join(fileURLToPath(import.meta.url), "..");
const bcrypt = createRequire(join(HERE, "../../api/package.json"))("bcryptjs") as typeof import("bcryptjs");

/**
 * Quick-setup E2E helpers: every test starts from a FRESH self-serve organisation (public signup, dev OTP), never from seeded demo data.
 * The Clinic web signup page is driven through the UI (`uiSignup`); Nurse and extra orgs use the same public API the page calls (`apiSignup`).
 */
export const API = process.env.PLAYWRIGHT_API_URL ?? `${process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5174"}/api/v1`;
export const DEV_OTP = process.env.SIGNUP_OTP_DEV_CODE || "424242";
export const PASSWORD = "demopass8";
let seq = 0;
export const uniq = () => `${Date.now()}${++seq}`;
export const phoneFor = (u: string) => `0100${u.slice(-7)}`;

export type Fresh = { email: string; password: string; accessToken: string; tenantId: string; userId: string; clinicId: string; name: string };

export async function apiSignup(
  request: APIRequestContext,
  o: { planKey?: string; edition?: "CLINIC" | "NURSE"; nurseKind?: "SOLO" | "AGENCY"; label?: string } = {},
): Promise<Fresh> {
  const u = uniq();
  const phone = phoneFor(u);
  const market = "EG";
  const otp = await request.post(`${API}/public/signup/otp`, { data: { phone, market } });
  expect(otp.ok(), await otp.text()).toBeTruthy();
  const ver = await request.post(`${API}/public/signup/verify`, { data: { phone, code: DEV_OTP, market } });
  expect(ver.ok(), await ver.text()).toBeTruthy();
  const { signupToken } = (await ver.json()) as { signupToken: string };
  const legal = (await (await request.get(`${API}/public/legal`)).json()) as { items: { document: string; version: string }[] };
  const email = `qs.${o.edition === "NURSE" ? "nurse" : "clinic"}.${u}@example.com`;
  const name = `${o.label ?? "QS Clinic"} ${u.slice(-6)}`;
  const res = await request.post(`${API}/public/signup/complete`, {
    data: {
      signupToken,
      profile: { displayName: "QS Owner", email, password: PASSWORD },
      specialty: "GENERAL_MEDICINE",
      clinic: { nameEn: name, city: "Cairo" },
      planKey: o.planKey ?? "PRO",
      legalAcceptances: legal.items.map((i) => ({ document: i.document, version: i.version })),
      edition: o.edition,
      nurseKind: o.nurseKind,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { accessToken: string; user: { id: string; tenantId: string } };
  const clinic = await prisma.clinic.findFirstOrThrow({ where: { tenantId: body.user.tenantId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return { email, password: PASSWORD, accessToken: body.accessToken, tenantId: body.user.tenantId, userId: body.user.id, clinicId: clinic.id, name };
}

/** Self-serve sign-up through the real page (3 steps + legal gate). Ends on /onboarding. */
export async function uiSignup(page: Page, plan: "Lite" | "Pro" = "Pro"): Promise<{ email: string; name: string }> {
  const u = uniq();
  const email = `qs.ui.${u}@example.com`;
  const name = `QS UI Clinic ${u.slice(-6)}`;
  await page.goto("/signup?ref=e2e&refCode=demo");
  await page.getByLabel(/Mobile/i).fill(phoneFor(u));
  await page.getByRole("button", { name: /Send verification/i }).click();
  await page.getByLabel(/Verification/i).fill(DEV_OTP);
  await page.getByRole("button", { name: /Verify/i }).click();
  await page.getByLabel(/Your name/i).fill("QS Owner");
  await page.getByLabel(/Work email/i).fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Continue/i }).click();
  await page.getByLabel(/Clinic name/i).fill(name);
  await page.getByLabel(/City/i).fill("Cairo");
  await page.getByRole("button", { name: /Continue/i }).click();
  await page.getByRole("button", { name: new RegExp(`^${plan}`, "i") }).click();
  for (const box of await page.locator('input[id^="legal-"]').all()) await box.check();
  await page.getByRole("button", { name: /Create clinic/i }).click();
  await page.waitForURL((x) => x.pathname.includes("onboarding"), { timeout: 90_000 });
  return { email, name };
}

export const signIn = (page: Page, f: { email: string; password?: string }) => login(page, f.email, f.password ?? PASSWORD);

export const checklist = (page: Page) => page.getByTestId("setup-checklist");
export const row = (page: Page, key: string) => page.locator(`[data-testid="setup-step"][data-step="${key}"]`);
export const bar = (page: Page) => page.getByTestId("setup-bar");

/** Walk one-phase-at-a-time nav until the step row is in the DOM (or exhaust phases). */
export async function revealStep(page: Page, key: string) {
  await expect(checklist(page)).toBeVisible();
  if (await row(page, key).count()) return;
  // Reset to first phase, then walk forward.
  for (let i = 0; i < 8; i++) {
    const back = page.getByTestId("setup-phase-back");
    if (!(await back.isEnabled().catch(() => false))) break;
    await back.click();
    await page.waitForTimeout(50);
  }
  for (let i = 0; i < 8; i++) {
    if (await row(page, key).count()) return;
    const next = page.getByTestId("setup-phase-next");
    if (!(await next.isEnabled().catch(() => false))) break;
    await next.click();
    await page.waitForTimeout(50);
  }
  await expect(row(page, key)).toBeVisible({ timeout: 5_000 });
}

/** Opens a step from the checklist via the sequential setup wizard, then lands on the action screen. */
export async function openStep(page: Page, key: string, urlPart: RegExp) {
  await revealStep(page, key);
  const cta = row(page, key).getByTestId("setup-cta");
  await expect(cta).toBeVisible();
  await cta.click();
  const wizard = page.getByTestId("setup-wizard");
  await expect(wizard).toBeVisible({ timeout: 10_000 });
  const doThis = page.getByTestId("setup-wizard-cta");
  if (await doThis.isVisible().catch(() => false)) {
    await doThis.click();
  } else {
    // Multi-branch steps: expand clinics and open the first pending entity.
    const toggle = page.getByTestId("setup-wizard-branches-toggle");
    if (await toggle.isVisible().catch(() => false)) {
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
      await page.getByTestId("setup-wizard-entity").filter({ has: page.getByRole("button", { name: /Open|فتح/i }) }).first().getByRole("button", { name: /Open|فتح/i }).click();
    }
  }
  await expect(page).toHaveURL(urlPart);
  await expect(bar(page)).toBeVisible();
  await expect(bar(page)).toHaveAttribute("data-step", key);
  await expect(page.getByTestId("setup-bar-back")).toBeVisible();
  await expect(page.getByTestId("setup-bar-skip")).toBeVisible();
}

/** After the work is saved the bar flips to success, then the checklist shows the step done (animation state), then the next step is highlighted. */
export async function expectFlipsToDone(page: Page, key: string, nextKey: string | null) {
  await expect(bar(page)).toHaveAttribute("data-success", "true", { timeout: 20_000 });
  await expect(page).toHaveURL(/\/(onboarding)?$/, { timeout: 15_000 });
  await revealStep(page, key);
  await expect(row(page, key)).toHaveAttribute("data-status", "done");
  await expect(row(page, key)).toHaveAttribute("data-just-done", "true");
  if (nextKey) {
    await revealStep(page, nextKey);
    await expect(row(page, nextKey)).toHaveAttribute("data-next", "true", { timeout: 5_000 });
  }
}

export async function progressPercent(page: Page): Promise<number> {
  return Number(await page.getByTestId("setup-progressbar").getAttribute("aria-valuenow"));
}

export async function axeClean(page: Page, include: string) {
  await page.waitForTimeout(1500); // let colour transitions and entry animations settle: axe samples computed colours
  const r = await new AxeBuilder({ page }).include(include).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

/** A further clinic in the organisation, created through the same API the Add clinic dialog uses (so the owner can open it). */
export async function addClinic(request: APIRequestContext, f: { accessToken: string }, nameEn: string, opts: { licence?: string } = {}): Promise<{ id: string }> {
  const r = await request.post(`${API}/clinics`, {
    headers: { Authorization: `Bearer ${f.accessToken}` },
    data: {
      nameEn, nameAr: nameEn, country: "EG", city: "Cairo", addressEn: "Maadi", addressAr: "المعادي", locationUrl: "https://maps.google.com/",
      phone: "+201000000555", email: `qs.${uniq()}@example.com`, licenseNumber: opts.licence ?? "SELF-SERVE-PENDING", defaultCurrency: "EGP",
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()) as { id: string };
}

/** A staff user with a given role in the fresh organisation (role-restricted views). Password is PASSWORD. */
export async function addStaff(tenantId: string, role: "BRANCH_MANAGER" | "RECEPTIONIST" | "PHYSICIAN" | "CLINIC_ADMIN", label: string) {
  const email = `qs.${label}.${uniq()}@example.com`;
  const user = await prisma.user.create({ data: { tenantId, email, passwordHash: bcrypt.hashSync(PASSWORD, 10), displayName: `QS ${label}`, role } });
  return { email, password: PASSWORD, userId: user.id };
}
