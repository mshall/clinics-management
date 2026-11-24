import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { showPasswordForm } from "./helpers";

/**
 * Kiorly Nurse edition walk of the Kiorex tab and the home card (ADR-040), against a RUNNING dev stack, nothing mocked:
 * a fresh self-serve Nurse tenant (public sign-up, edition NURSE) signs in, sees the front door, dismisses the home card
 * (stored on the server per user), and finds it dismissed in a brand-new browser context.
 *   KIOREX_TAB_BASE_URL=http://localhost:5174 KIOREX_TAB_SHOTS_DIR=<dir> npx playwright test -c playwright.kiorex-tab.config.ts kiorex-tab-nurse
 */
const BASE = process.env.KIOREX_TAB_BASE_URL ?? "http://localhost:5174";
const API = `${new URL(BASE).origin}/api/v1`;
const SHOTS = process.env.KIOREX_TAB_SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `nurse-${name}.png`), fullPage: true }); };
const PASSWORD = "demopass8";
const stamp = () => `${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;

async function signupNurse(request: APIRequestContext) {
  const u = stamp(); const phone = `0100${u.slice(-7)}`;
  expect((await request.post(`${API}/public/signup/otp`, { data: { phone, market: "EG" } })).ok()).toBeTruthy();
  const ver = await request.post(`${API}/public/signup/verify`, { data: { phone, code: process.env.SIGNUP_OTP_DEV_CODE || "424242", market: "EG" } });
  expect(ver.ok(), await ver.text()).toBeTruthy();
  const { signupToken } = (await ver.json()) as { signupToken: string };
  const legal = (await (await request.get(`${API}/public/legal`)).json()) as { items: { document: string; version: string }[] };
  const email = `kt.nurse.${u}@example.com`;
  const res = await request.post(`${API}/public/signup/complete`, { data: { signupToken, profile: { displayName: "KT Nurse", email, password: PASSWORD }, specialty: "GENERAL_MEDICINE", clinic: { nameEn: `KT Nurse ${u.slice(-6)}`, city: "Cairo" }, planKey: "NURSE_LITE", legalAcceptances: legal.items.map((i) => ({ document: i.document, version: i.version })), edition: "NURSE", nurseKind: "SOLO" } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return { email, accessToken: ((await res.json()) as { accessToken: string }).accessToken };
}
async function signIn(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await showPasswordForm(page);
  await page.locator("#email").fill(email); await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /^(sign in|تسجيل الدخول)$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 60_000, waitUntil: "commit" });
}
const lang = (page: Page, l: "en" | "ar") => page.evaluate((x) => { document.cookie = `cms_locale=${x}; Path=/`; localStorage.setItem("cms_locale", x); }, l);
const axe = async (page: Page) => { await page.waitForTimeout(700); const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${(n.any[0]?.message ?? "").slice(0, 200)} ${n.html.slice(0, 160)}`).slice(0, 3).join(" | ")}`)).toEqual([]); };
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

test("Nurse edition: home card, Kiorex tab, server-side dismissal, AR/RTL, dark, 390 and 1440", async ({ page, request, browser }) => {
  const f = await signupNurse(request);
  await signIn(page, f.email);

  // home card on the dashboard (owner of a fresh, unconnected Nurse tenant)
  await page.goto("/");
  const card = page.getByTestId("kiorex-home-card");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await page.setViewportSize({ width: 1440, height: 900 }); await shot(page, "home-card-1440");
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page); await shot(page, "home-card-390");
  await page.setViewportSize({ width: 1440, height: 900 });

  // Kiorex tab: not connected, Nurse wording, no horizontal overflow, axe clean
  await page.goto("/kiorex");
  await expect(page.getByTestId("kiorex-state")).toHaveAttribute("data-state", "NOT_CONNECTED", { timeout: 60_000 });
  await axe(page); await shot(page, "tab-1440");
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page); await shot(page, "tab-390");
  await page.setViewportSize({ width: 1440, height: 900 });

  // dismiss from the home card: persisted server-side per user
  await page.goto("/");
  await page.getByTestId("home-card-dismiss").click();
  await expect(card).toBeHidden();
  const token = await page.evaluate(() => { const raw = localStorage.getItem("cms-auth"); try { return (JSON.parse(raw ?? "{}") as { state?: { accessToken?: string } }).state?.accessToken ?? ""; } catch { return ""; } });
  await expect.poll(async () => ((await (await request.get(`${API}/me/preferences/dismissed-cards`, { headers: { Authorization: `Bearer ${token || f.accessToken}` } })).json()) as { keys: string[] }).keys, { timeout: 15_000 }).toContain("kiorex.homeCard");

  // a brand-new browser context (no localStorage at all) still sees it dismissed, and the tab offers to show it again
  const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
  await signIn(p2, f.email); await p2.goto("/");
  await p2.waitForLoadState("networkidle");
  await expect(p2.getByTestId("kiorex-home-card")).toHaveCount(0);
  await p2.goto("/kiorex"); await expect(p2.getByTestId("home-card-show")).toBeVisible({ timeout: 60_000 });
  await p2.getByTestId("home-card-show").click();
  await p2.goto("/"); await expect(p2.getByTestId("kiorex-home-card")).toBeVisible({ timeout: 60_000 });
  await ctx2.close();

  // one-time migration: a legacy browser-only dismissal is pushed to the server on first load
  await page.goto("/");
  const uid = await page.evaluate(() => { const raw = localStorage.getItem("cms-auth"); try { return (JSON.parse(raw ?? "{}") as { state?: { user?: { id?: string } } }).state?.user?.id ?? ""; } catch { return ""; } });
  if (uid) {
    await page.evaluate((id) => localStorage.setItem(`kiorex.homeCard.dismissed.${id}`, "1"), uid);
    await page.reload();
    await expect(page.getByTestId("kiorex-home-card")).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(() => page.evaluate((id) => localStorage.getItem(`kiorex.homeCard.dismissed.${id}`), uid), { timeout: 15_000 }).toBeNull();
    await page.goto("/kiorex"); await page.getByTestId("home-card-show").click();
  }

  // Arabic RTL and dark
  await lang(page, "ar"); await page.goto("/kiorex");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 60_000 });
  await expect(page.getByTestId("kiorex-state")).toBeVisible(); await axe(page); await shot(page, "tab-ar-1440");
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page); await shot(page, "tab-ar-390");
  await page.emulateMedia({ colorScheme: "dark" }); await page.evaluate(() => { document.documentElement.classList.add("dark"); });
  await shot(page, "tab-ar-dark-390"); await axe(page);
});
