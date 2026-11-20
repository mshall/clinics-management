// Usage: node scripts/ui-shots.mjs <before|after> — screenshots key screens (EN light/dark, AR light) into _docs/ui-review.
import { chromium } from "@playwright/test";
import path from "node:path";
const phase = process.argv[2] ?? "after";
const base = process.env.BASE ?? "http://localhost:5174";
const out = path.resolve(process.cwd(), "../../../_docs/ui-review");
const sets = [
  { dir: "kiorly-clinic", email: "frontdesk1.na@demo.kiorex.test", device: { width: 1440, height: 900 }, routes: ["/", "/appointments", "/front-desk/board", "/patients", "/revenue", "/reports"] },
  { dir: "kiorly-nurse", email: "mona@nurse-demo.kiorly.test", device: { width: 414, height: 860 }, routes: ["/home-visits/today", "/nurse/care-plans", "/nurse/mar", "/nurse/safety"] },
];
const browser = await chromium.launch();
for (const s of sets) {
  for (const mode of [{ n: "en-light", lang: "en", dark: false }, { n: "en-dark", lang: "en", dark: true }, { n: "ar-light", lang: "ar", dark: false }]) {
    const ctx = await browser.newContext({ viewport: s.device, deviceScaleFactor: 1, colorScheme: mode.dark ? "dark" : "light" });
    await ctx.addCookies([{ name: "cms_locale", value: mode.lang, url: base }]);
    const page = await ctx.newPage();
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate(([l, d]) => { try { localStorage.setItem("cms_locale", l); localStorage.setItem("cms-theme", JSON.stringify({ state: { themeId: d ? "clinical-os-dark" : "clinical-os-light", persistDefault: true }, version: 0 })); } catch {} }, [mode.lang, mode.dark]);
    await page.reload({ waitUntil: "domcontentloaded" });
    if (mode.n === "en-light") await page.screenshot({ path: `${out}/${s.dir}/${phase}-login-${mode.n}.png` });
    await page.locator("#email").fill(s.email);
    await page.locator("#password").fill("Demo@12345");
    await page.locator("button[type=submit]").first().click();
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 60000 }).catch(() => {});
    await ctx.addCookies([{ name: "cms_locale", value: mode.lang, url: base }]);
    for (const r of s.routes) {
      await page.goto(base + r, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${out}/${s.dir}/${phase}-${(r.replace(/\//g, "_").slice(1) || "home")}-${mode.n}.png` });
    }
    await ctx.close();
  }
}
await browser.close();
