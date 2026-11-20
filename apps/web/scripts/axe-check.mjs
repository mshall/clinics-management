// Usage: node scripts/axe-check.mjs — axe (wcag2a/aa) on key pages, EN+AR x light+dark; prints serious/critical violations.
import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
const base = process.env.BASE ?? "http://localhost:5174";
// A route is "/path" or { route, open: [selectors clicked in order] } to reach detail pages / calendar views.
const sets = [
  { email: "owner.na@demo.kiorex.test", routes: ["/", "/patients", "/appointments", "/front-desk/board", "/revenue", "/reports", "/expenses", "/kiorex", "/clinics", "/encounters", "/operations", "/onboarding", "/admin",
    { route: "/patients", open: ["tr[role=link]"] },
    { route: "/appointments", open: ["tr[role=link]"] },
    { route: "/encounters", open: ["tr[role=link], a[href^='/encounters/']"] },
    { route: "/appointments", open: ["role=tab[name=/calendar|التقويم/i]", "[data-testid=calendar-view-week]"] },
    { route: "/appointments", open: ["role=tab[name=/calendar|التقويم/i]", "[data-testid=calendar-view-day]"] } ] },
  { email: "frontdesk1.na@demo.kiorex.test", routes: ["/appointments", "/front-desk/board", "/front-desk/cash-drawer", "/front-desk/claims"] },
  { email: "mona@nurse-demo.kiorly.test", routes: ["/home-visits/today", "/nurse/care-plans", "/nurse/mar", "/nurse/safety", "/nurse/lab", "/nurse/dispatch", "/nurse/services", "/nurse/reports",
    { route: "/home-visits/today", open: ["a[href^='/nurse/visits/']"] }], mobile: true },
];
// Env knobs: SETS=owner,mona (email substring filter), LANGS=en, DARK=0|1 (default both), VERBOSE=1 prints node selectors.
const onlySets = process.env.SETS?.split(",");
const onlyLangs = (process.env.LANGS ?? "en,ar").split(",");
const darkModes = process.env.DARK === "0" ? [false] : process.env.DARK === "1" ? [true] : [false, true];
const browser = await chromium.launch();
const seen = new Map();
for (const s of sets) for (const lang of onlyLangs) for (const dark of darkModes) {
  if (onlySets && !onlySets.some((x) => s.email.includes(x))) continue;
  const ctx = await browser.newContext({ viewport: s.mobile ? { width: 414, height: 860 } : { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "cms_locale", value: lang, url: base }]);
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate((d) => localStorage.setItem("cms-theme", JSON.stringify({ state: { themeId: d ? "clinical-os-dark" : "clinical-os-light", persistDefault: true }, version: 0 })), dark);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(s.email); await page.locator("#password").fill("Demo@12345");
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 60000 }).catch(() => {});
  for (const rr of s.routes) {
    const r = typeof rr === "string" ? rr : rr.route + "#" + rr.open.join(">").slice(0, 40);
    await page.goto(base + (typeof rr === "string" ? rr : rr.route), { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2500);
    if (typeof rr !== "string") for (const sel of rr.open) { await page.locator(sel).first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1500); }
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    for (const v of res.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
      const key = `${v.id}`; const e = seen.get(key) ?? { n: 0, where: new Set(), sample: v.nodes[0]?.html.slice(0, 160), fix: v.nodes[0]?.any?.[0]?.message ?? "" };
      e.n += v.nodes.length; if (process.env.VERBOSE) (e.targets ??= new Set()).add(`${r} :: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`); e.where.add(`${r}|${lang}|${dark ? "dark" : "light"}`); seen.set(key, e);
    }
  }
  await ctx.close();
}
await browser.close();
for (const [k, e] of seen) console.log(k, e.n, [...e.where].slice(0, 6).join(" ; "), "\n   ", e.sample, "\n   ", e.fix, e.targets ? "\n   TARGETS:\n     " + [...e.targets].slice(0, 8).join("\n     ") : "");
console.log(seen.size ? "VIOLATIONS" : "CLEAN");
