// Usage: TAG=after [ONLY=kiorly-clinic|kiorly-nurse] [MODES=en-light,en-dark,ar-light] node scripts/ui-shots.mjs
// Screenshots the redesigned screens into _docs/ui-review/<dir>/<tag>-<name>-<mode>.png. Routes may be
// "/path" or { name, route, open } where `open` is a CSS selector clicked after load (to reach detail pages).
import { chromium } from "@playwright/test";
import path from "node:path";
const phase = process.env.TAG ?? process.argv[2] ?? "after";
const base = process.env.BASE ?? "http://localhost:5174";
const out = path.resolve(process.cwd(), "../../../_docs/ui-review");
const only = process.env.ONLY;
const routeFilter = process.env.ROUTE?.split(",");
const wantModes = (process.env.MODES ?? "en-light,en-dark,ar-light").split(",");
const desk = { width: 1440, height: 900 };
const phone = { width: 414, height: 860 };
export const sets = [
  { dir: "kiorly-clinic", email: "frontdesk1.na@demo.kiorex.test", device: desk, prefix: "fd-", routes: [
    "/appointments", "/front-desk/board", "/patients",
    { name: "appointment-detail", route: "/appointments", open: "tr[role=link]" },
    { name: "patient-360", route: "/patients", open: "tr[role=link]" },
    { name: "appointments-calendar", route: "/appointments", open: "role=tab[name=/calendar|التقويم/i]" },
    { name: "appointments-week", route: "/appointments", open: ["role=tab[name=/calendar|التقويم/i]", "[data-testid=calendar-view-week]", "role=button[name=/next|التالي/i]", "role=button[name=/next|التالي/i]"] },
    "/front-desk/cash-drawer", "/front-desk/claims" ] },
  { dir: "kiorly-clinic", email: "owner.na@demo.kiorex.test", device: desk, prefix: "owner-", routes: [
    "/", "/revenue", "/reports", "/expenses", "/kiorex", "/clinics", "/encounters", "/operations", "/admin", "/onboarding",
    { name: "encounter", route: "/encounters", open: "tr[role=link], a[href^='/encounters/']" } ] },
  { dir: "kiorly-nurse", email: "mona@nurse-demo.kiorly.test", device: phone, routes: [
    "/home-visits/today", "/nurse/care-plans", "/nurse/mar", "/nurse/safety", "/nurse/lab", "/nurse/dispatch", "/nurse/services", "/nurse/reports",
    { name: "visit-record", route: "/home-visits/today", open: "a[href^='/nurse/visits/']" } ] },
];
const browser = await chromium.launch();
for (const s of sets) {
  if (only && s.dir !== only) continue;
  for (const mode of [{ n: "en-light", lang: "en", dark: false }, { n: "en-dark", lang: "en", dark: true }, { n: "ar-light", lang: "ar", dark: false }, { n: "ar-dark", lang: "ar", dark: true }]) {
    if (!wantModes.includes(mode.n)) continue;
    const ctx = await browser.newContext({ viewport: s.device, deviceScaleFactor: 1, colorScheme: mode.dark ? "dark" : "light" });
    await ctx.addCookies([{ name: "cms_locale", value: mode.lang, url: base }]);
    const page = await ctx.newPage();
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate(([l, d]) => { try { localStorage.setItem("cms_locale", l); localStorage.setItem("cms-theme", JSON.stringify({ state: { themeId: d ? "clinical-os-dark" : "clinical-os-light", persistDefault: true }, version: 0 })); } catch {} }, [mode.lang, mode.dark]);
    await page.reload({ waitUntil: "domcontentloaded" });
    if (mode.n === "en-light") await page.screenshot({ path: `${out}/${s.dir}/${phase}-${s.prefix ?? ""}login-${mode.n}.png` });
    await page.locator("#email").fill(s.email);
    await page.locator("#password").fill("Demo@12345");
    await page.locator("button[type=submit]").first().click();
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 60000 }).catch(() => {});
    await ctx.addCookies([{ name: "cms_locale", value: mode.lang, url: base }]);
    for (const r of s.routes) {
      const route = typeof r === "string" ? r : r.route;
      const name0 = typeof r === "string" ? route : r.name;
      if (routeFilter && !routeFilter.includes(name0)) continue;
      const name = typeof r === "string" ? (route.replace(/\//g, "_").slice(1) || "home") : r.name;
      await page.goto(base + route, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(2500);
      if (typeof r !== "string" && r.open) {
        for (const sel of [].concat(r.open)) {
          await page.locator(sel).first().click({ timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(1500);
        }
      }
      await page.screenshot({ path: `${out}/${s.dir}/${phase}-${s.prefix ?? ""}${name}-${mode.n}.png`, fullPage: false });
    }
    await ctx.close();
  }
}
await browser.close();
