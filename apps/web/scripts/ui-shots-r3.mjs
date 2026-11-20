// Round 3 screenshot sweep (the surfaces that previously only inherited tokens): admin, HR, platform, dialogs, SOAP, nurse pages.
// Usage: TAG=r3-before [MODES=en-light,en-dark,ar-light,ar-dark] [VIEWS=desk,phone] [ONLY=admin,hr] node scripts/ui-shots-r3.mjs
// A route is "/path" or { name, route, open: [selectors clicked in order] }; selectors accept playwright syntax (role=button[name=/x/i]).
import { chromium } from "@playwright/test";
import path from "node:path";
const tag = process.env.TAG ?? "r3-after";
const base = process.env.BASE ?? "http://localhost:5174";
const out = path.resolve(process.cwd(), "../../../_docs/ui-review");
const modes = (process.env.MODES ?? "en-light").split(",");
const views = (process.env.VIEWS ?? "desk").split(",");
const only = process.env.ONLY?.split(",");
const V = { desk: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const owner = { email: "owner.na@demo.kiorex.test", pw: "Demo@12345", dir: "kiorly-clinic", routes: [
  { name: "admin", route: "/admin" },
  { name: "admin-org", route: "/admin", open: ["role=button[name=/^(Organization & settings|المؤسسة والإعدادات)$/i]"] },
  { name: "clinics", route: "/clinics" },
  { name: "patients-new", route: "/patients", open: ["role=button[name=/register patient|new patient|تسجيل مريض|مريض جديد/i]"] },
  { name: "encounter-new", route: "/encounters", open: ["role=button[name=/new encounter|زيارة جديدة|مقابلة جديدة/i]"] },
  { name: "soap", route: "/encounters", open: ["tr[role=link], a[href^='/encounters/']"] },
  { name: "appointment-invoice", route: "/appointments", open: ["tr[role=link]"] },
  { name: "cash-drawer", route: "/front-desk/cash-drawer" },
  { name: "installments", route: "/front-desk/installments" },
  { name: "kiorex", route: "/kiorex" },
  { name: "templates", route: "/clinical/templates" },
  { name: "support", route: "/customer-support" },
  { name: "onboarding", route: "/onboarding" },
  { name: "profile", route: "/profile" },
] };
const admin = { email: "admin@kiorly.com", pw: "demo", dir: "kiorly-clinic", prefix: "ga-", routes: [
  { name: "hr", route: "/hr" },
  { name: "hr-employees", route: "/hr?tab=employees" },
  { name: "hr-new-employee", route: "/hr?tab=employees", open: ["role=button[name=/add employee|إضافة موظف/i]"] },
  { name: "hr-attendance", route: "/hr?tab=attendance" },
  { name: "hr-leave", route: "/hr?tab=leave" },
  { name: "admin-groupadmin", route: "/admin" } ] };
const platform = { email: "superadmin@kiorly.com", pw: "demo", dir: "kiorly-clinic", prefix: "pf-", routes: [
  { name: "platform", route: "/platform" }, { name: "platform-orgs", route: "/platform/organizations" }, { name: "platform-plans", route: "/platform/plans" },
  { name: "platform-users", route: "/platform/users" }, { name: "platform-markets", route: "/platform/markets" }, { name: "platform-verifications", route: "/platform/verifications" },
  { name: "platform-insights", route: "/platform/insights" } ] };
const nurse = { email: "mona@nurse-demo.kiorly.test", pw: "Demo@12345", dir: "kiorly-nurse", phone: true, routes: [
  "/home-visits/today", "/nurse/care-plans", "/nurse/mar", "/nurse/safety", "/nurse/lab", "/nurse/dispatch", "/nurse/shifts", "/nurse/services", "/nurse/inbox", "/nurse/family", "/nurse/reports",
  { name: "care-plan-detail", route: "/nurse/care-plans", open: ["a[href^='/nurse/care-plans/']"] },
  { name: "mar-patient", route: "/nurse/mar", open: ["a[href^='/nurse/mar/']"] },
  { name: "lab-order", route: "/nurse/lab", open: ["a[href^='/nurse/lab/']"] },
  { name: "visit-record", route: "/home-visits/today", open: ["a[href^='/nurse/visits/']"] } ] };
const dispatch = { email: "dispatch@nurse-demo.kiorly.test", pw: "Demo@12345", dir: "kiorly-nurse", prefix: "dispatch-", phone: true, routes: ["/nurse/dispatch", "/nurse/shifts"] };
const signup = { anon: true, dir: "kiorly-clinic", prefix: "anon-", routes: [{ name: "signup", route: "/signup" }, { name: "login", route: "/login" }, { name: "forgot", route: "/forgot-password" }] };
const sets = [owner, admin, platform, nurse, dispatch, signup];
const M = { "en-light": ["en", false], "en-dark": ["en", true], "ar-light": ["ar", false], "ar-dark": ["ar", true] };
const browser = await chromium.launch();
for (const s of sets) {
  const key = s.dir + (s.prefix ?? "");
  for (const view of views) {
    if (view === "phone" && s.dir === "kiorly-nurse" ? false : false) continue;
    const dev = s.phone ? "phone" : view; // nurse is always phone
    if (s.phone && view !== views[0]) continue;
    for (const m of modes) {
      const [lang, dark] = M[m];
      const ctx = await browser.newContext({ viewport: V[dev], deviceScaleFactor: 1, colorScheme: dark ? "dark" : "light" });
      await ctx.addCookies([{ name: "cms_locale", value: lang, url: base }]);
      const page = await ctx.newPage();
      await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
      await page.evaluate(([l, d]) => { try { localStorage.setItem("cms_locale", l); localStorage.setItem("cms-theme", JSON.stringify({ state: { themeId: d ? "clinical-os-dark" : "clinical-os-light", persistDefault: true }, version: 0 })); } catch {} }, [lang, dark]);
      if (!s.anon) {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.locator("#email").fill(s.email); await page.locator("#password").fill(s.pw);
        await page.locator("button[type=submit]").first().click();
        await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 60000 }).catch(() => {});
      }
      for (const r of s.routes) {
        const route = typeof r === "string" ? r : r.route;
        const name = typeof r === "string" ? (route.replace(/\//g, "_").slice(1) || "home") : r.name;
        if (only && !only.includes(name)) continue;
        await page.goto(base + route, { waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForTimeout(2200);
        if (typeof r !== "string" && r.open) for (const sel of r.open) { await page.locator(sel).first().click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(1300); }
        await page.screenshot({ path: `${out}/${s.dir}/${tag}-${s.prefix ?? ""}${name}-${dev}-${m}.png` });
      }
      await ctx.close();
    }
  }
}
await browser.close();
