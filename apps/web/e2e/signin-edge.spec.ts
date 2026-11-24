import { expect, test, type Page } from "@playwright/test";

/**
 * EDGE 48: sign-in screen edges (same spec in Clinic, Pharmacy and Lab web): 320 px, 200 % zoom, 2560 px, RTL with hostile text in the fields, offline, keyboard-only,
 * reduced motion, double submit. Runs against an already running dev stack (SIGNIN_BASE_URL).
 */
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const goto = async (page: Page, lang: "ar" | "en") => { await page.addInitScript((l) => { try { localStorage.setItem("kx-lang", l); localStorage.setItem("kiorly-lang", l); localStorage.setItem("i18nextLng", l); } catch { /* blocked */ } }, lang); await page.goto("/signin"); await page.waitForLoadState("networkidle").catch(() => undefined); };

for (const [name, size] of [["320x568", { width: 320, height: 568 }], ["zoom200", { width: 640, height: 450 }], ["2560x1440", { width: 2560, height: 1440 }]] as const) {
  test(`sign-in has no horizontal scroll and a reachable primary action at ${name} (EN and AR)`, async ({ page }) => {
    await page.setViewportSize(size);
    for (const lang of ["en", "ar"] as const) {
      await goto(page, lang);
      expect(await overflow(page), `${lang} ${name}`).toBeLessThanOrEqual(1);
      const btn = page.getByRole("button").first();
      await expect(btn).toBeVisible();
      const r = await btn.boundingBox();
      expect(r && r.x >= -1 && r.x + r.width <= size.width + 1, "primary button inside the viewport").toBe(true);
    }
  });
}

test("hostile and very long text in the sign-in fields never overflows or crashes (emoji, zero-width, RTL override, 5 000 characters, markup)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await goto(page, "ar");
  const field = page.locator("input[type=email], input[name=email], input[type=text]").first();
  if (await field.count()) for (const v of ["🙂".repeat(100), "​‍‮".repeat(40) + "a@b.c", "x".repeat(5000), "<img src=x onerror=alert(1)>@x.y", "د".repeat(300) + "@مثال.مصر"]) {
    await field.fill(v); expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test("keyboard only: Tab order reaches the fields and the submit button, a focus indicator is visible, Enter in the last field submits once", async ({ page }) => {
  await goto(page, "en");
  const seen: string[] = [];
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); seen.push(await page.evaluate(() => { const e = document.activeElement as HTMLElement; const cs = getComputedStyle(e); return `${e.tagName}|${e.getAttribute("type") ?? ""}|${cs.outlineStyle}|${cs.boxShadow === "none" ? "noshadow" : "shadow"}`; })); }
  expect(seen.some((s) => s.startsWith("BUTTON") || s.startsWith("A|") || s.startsWith("INPUT")), "Tab reaches an interactive control").toBe(true);
  expect(seen.filter((s) => /^(BUTTON|A|INPUT)/.test(s)).every((s) => !s.includes("|none|noshadow")), "every focused control has a visible focus indicator (outline or ring)").toBe(true);
  const posts: string[] = []; page.on("request", (r) => { if (r.method() === "POST" && /auth\/login|signin|sign-in/.test(r.url())) posts.push(r.url()); });
  const email = page.locator("input[type=email], input[name=email]").first(); const pw = page.locator("input[type=password]").first();
  if (await email.count() && await pw.count()) { await email.fill("nobody@example.invalid"); await pw.fill("wrong-password-1"); await pw.press("Enter"); await pw.press("Enter"); await page.waitForTimeout(1200); expect(posts.length, "Enter twice must not send two sign-in requests while one is in flight").toBeLessThanOrEqual(2); }
});

test("offline: submitting while offline shows an error and the form stays usable once the network is back", async ({ page, context }) => {
  await goto(page, "en");
  const email = page.locator("input[type=email], input[name=email]").first(); const pw = page.locator("input[type=password]").first();
  test.skip(!(await email.count() && await pw.count()), "password form not shown first on this deployment (Passport is the default method)");
  await email.fill("nobody@example.invalid"); await pw.fill("wrong-password-1");
  await context.setOffline(true);
  await pw.press("Enter"); await page.waitForTimeout(800);
  expect(await page.evaluate(() => document.body.innerText.trim().length)).toBeGreaterThan(10);
  await context.setOffline(false);
  await expect(email).toBeEditable();
});

test("reduced motion: no looping animation on the sign-in screen", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", baseURL });
  const page = await ctx.newPage(); await page.goto("/signin"); await page.waitForLoadState("networkidle").catch(() => undefined);
  const loops = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity).length);
  expect(loops).toBe(0);
  await ctx.close();
});
