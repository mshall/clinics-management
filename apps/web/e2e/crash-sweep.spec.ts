import { expect, test, type Page } from "@playwright/test";
import { apiLogin, authHeaders, API_BASE } from "./golden-flow-helpers";
import { showPasswordForm } from "./helpers";
import { pinLocaleAndTheme, watchPage } from "./crash-sweep-helpers";

/**
 * Crash sweep: every Clinic and Nurse route, as owner / doctor / receptionist / nurse (and the Nurse edition users), English and Arabic,
 * light and dark. Fails on console errors, React warnings (update depth, hooks, keys), uncaught exceptions and API 5xx.
 * Narrow with SWEEP_ROLES=owner,nurse SWEEP_LOCALES=en SWEEP_THEMES=light.
 */
const PASSWORD = "Demo@12345";
const ROLES: Record<string, { email: string; scope: "clinic" | "nurse" | "platform" }> = {
  owner: { email: "owner.na@demo.kiorex.test", scope: "clinic" },
  doctor: { email: "nadia.na@demo.kiorex.test", scope: "clinic" },
  receptionist: { email: "frontdesk1.na@demo.kiorex.test", scope: "clinic" },
  nurse: { email: "nurse.na@demo.kiorex.test", scope: "clinic" },
  "solo-nurse": { email: "mona@nurse-demo.kiorly.test", scope: "nurse" },
  "agency-owner": { email: "owner@nurse-demo.kiorly.test", scope: "nurse" },
  "agency-nurse": { email: "nurse1@nurse-demo.kiorly.test", scope: "nurse" },
};

const CLINIC_ROUTES = [
  "/", "/onboarding", "/onboarding/import", "/offline/today", "/team", "/patients", "/patients/duplicates", "/patients/:patientId",
  "/encounters", "/encounters/:encounterId", "/clinical/templates", "/appointments", "/appointments/:appointmentId", "/front-desk/board",
  "/front-desk/cash-drawer", "/front-desk/installments", "/front-desk/claims", "/front-desk/waiting-room", "/messaging/ai-receptionist",
  "/operations", "/clinics", "/clinics/:clinicId", "/clinics/:clinicId?tab=settings", "/kiorex", "/kiorex/connect", "/expenses", "/revenue", "/doctor-revenue",
  "/profile", "/profile/availability", "/profile/verification", "/privacy", "/hr", "/reports", "/reports/ar-aging", "/reports/branch-pl", "/customer-support",
  "/admin", "/admin?section=organization", "/guide", "/help", "/home-visits/today",
];
const NURSE_ROUTES = [
  "/", "/nurse/onboarding", "/home-visits/today", "/nurse/care-plans", "/nurse/mar", "/nurse/services", "/nurse/dispatch", "/nurse/shifts", "/nurse/safety",
  "/nurse/inbox", "/nurse/family", "/nurse/reports", "/nurse/lab", "/profile", "/profile/availability", "/profile/verification", "/privacy", "/team", "/help", "/guide",
];

const pick = (name: string, all: string[]) => (process.env[name] ? process.env[name]!.split(",") : all);
const roles = pick("SWEEP_ROLES", Object.keys(ROLES));
const locales = pick("SWEEP_LOCALES", ["en", "ar"]) as Array<"en" | "ar">;
const themes = pick("SWEEP_THEMES", ["light", "dark"]) as Array<"light" | "dark">;

async function signIn(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await showPasswordForm(page);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const post = page.waitForResponse((r) => r.url().includes("/api/v1/auth/login") && r.request().method() === "POST", { timeout: 60_000 });
    await page.locator("#password").press("Enter");
    const res = await post;
    if (res.status() === 429) {
      const body = (await res.json().catch(() => ({}))) as { retryAfterSec?: number };
      await page.waitForTimeout(((body.retryAfterSec ?? 20) + 1) * 1000);
      continue;
    }
    expect(res.ok(), `login ${email}`).toBeTruthy();
    break;
  }
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 60_000, waitUntil: "commit" });
}

async function firstId(request: Parameters<typeof apiLogin>[0], token: string, path: string): Promise<string | undefined> {
  const res = await request.get(`${API_BASE}${path}`, { headers: authHeaders(token) });
  if (!res.ok()) return undefined;
  const body = (await res.json()) as { items?: Array<{ id: string }> } | Array<{ id: string }>;
  const list = Array.isArray(body) ? body : body.items ?? [];
  return list[0]?.id;
}

for (const roleName of roles) {
  for (const locale of locales) {
    for (const theme of themes) {
      test(`sweep ${roleName} ${locale} ${theme}`, async ({ page, request }) => {
        const role = ROLES[roleName]!;
        test.setTimeout(600_000);
        const session = await apiLogin(request, role.email, PASSWORD);
        const ids = {
          patientId: await firstId(request, session.accessToken, "/patients?limit=1"),
          encounterId: await firstId(request, session.accessToken, "/encounters?limit=1"),
          appointmentId: await firstId(request, session.accessToken, "/appointments?limit=1"),
          clinicId: await firstId(request, session.accessToken, "/clinics"),
        };
        await pinLocaleAndTheme(page, locale, theme);
        const watch = watchPage(page);
        await signIn(page, role.email);
        const routes = role.scope === "nurse" ? NURSE_ROUTES : CLINIC_ROUTES;
        const failures: string[] = [];
        for (const template of routes) {
          const path = template.replace(/:(\w+)/g, (_m, k: keyof typeof ids) => ids[k] ?? "missing");
          if (path.includes("/missing")) continue;
          const visit = async () => {
            watch.reset();
            await page.goto(path, { waitUntil: "domcontentloaded" });
            await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
            await page.waitForTimeout(500);
          };
          await visit();
          if (path === "/") await expect(page.getByRole("navigation").first(), "signed in: the app shell is on screen").toBeVisible();
          // An API 5xx is retried once (a cold dev API can answer one transient 500); a repeat is a real failure.
          if (watch.findings.some((f) => f.kind === "http5xx")) await visit();
          // A route that crashed shows the router error boundary instead of the shell.
          const crashed = await page.getByText(/Unexpected Application Error|Something went wrong|حدث خطأ غير متوقع/i).first().isVisible().catch(() => false);
          const rtl = await page.evaluate(() => document.documentElement.dir);
          if (rtl !== (locale === "ar" ? "rtl" : "ltr")) failures.push(`${path}: dir=${rtl}`);
          if (crashed) failures.push(`${path}: error boundary visible`);
          for (const f of watch.findings) failures.push(`${path}: [${f.kind}] ${f.text.replace(/\s+/g, " ").slice(0, 300)}`);
        }
        expect(failures, failures.join("\n")).toEqual([]);
      });
    }
  }
}
