// Usage: node scripts/axe-check.mjs — axe (wcag2a/aa) on key pages, EN+AR x light+dark; prints serious/critical violations.
import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
const base = process.env.BASE ?? "http://localhost:5174";
const sets = [
  { email: "owner.na@demo.kiorex.test", routes: ["/", "/patients", "/appointments", "/front-desk/board", "/revenue", "/reports"] },
  { email: "mona@nurse-demo.kiorly.test", routes: ["/home-visits/today", "/nurse/care-plans", "/nurse/safety"], mobile: true },
];
const browser = await chromium.launch();
const seen = new Map();
for (const s of sets) for (const lang of ["en", "ar"]) for (const dark of [false, true]) {
  const ctx = await browser.newContext({ viewport: s.mobile ? { width: 414, height: 860 } : { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "cms_locale", value: lang, url: base }]);
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate((d) => localStorage.setItem("cms-theme", JSON.stringify({ state: { themeId: d ? "clinical-os-dark" : "clinical-os-light", persistDefault: true }, version: 0 })), dark);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(s.email); await page.locator("#password").fill("Demo@12345");
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 60000 }).catch(() => {});
  for (const r of s.routes) {
    await page.goto(base + r, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2500);
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    for (const v of res.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
      const key = `${v.id}`; const e = seen.get(key) ?? { n: 0, where: new Set(), sample: v.nodes[0]?.html.slice(0, 160), fix: v.nodes[0]?.any?.[0]?.message ?? "" };
      e.n += v.nodes.length; e.where.add(`${r}|${lang}|${dark ? "dark" : "light"}`); seen.set(key, e);
    }
  }
  await ctx.close();
}
await browser.close();
for (const [k, e] of seen) console.log(k, e.n, [...e.where].slice(0, 6).join(" ; "), "\n   ", e.sample, "\n   ", e.fix);
console.log(seen.size ? "VIOLATIONS" : "CLEAN");
