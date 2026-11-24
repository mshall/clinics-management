import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { apiSignup, checklist, signIn } from "./quick-setup-helpers";
import { pinLocaleAndTheme } from "./crash-sweep-helpers";

/**
 * Screenshots of the quick-setup checklist and the Nurse home card for the design review.
 * Run with QS_SHOTS_DIR=../../../_docs/test-flow/quick-setup (EN/AR x light/dark x 390/1440). Skipped otherwise.
 */
const DIR = process.env.QS_SHOTS_DIR;
test.skip(!DIR, "set QS_SHOTS_DIR to capture");
test.use({ actionTimeout: 20_000 });

async function shoot(page: Page, auth: string, lang: "en" | "ar", theme: "light" | "dark", width: number, path: string, locator: () => ReturnType<Page["getByTestId"]>, file: string) {
  await page.setViewportSize({ width, height: 900 });
  await pinLocaleAndTheme(page, lang, theme);
  await page.addInitScript((a) => { try { localStorage.setItem("cms-auth", a); } catch { /* ignore */ } }, auth);
  await page.goto(path);
  await expect(locator()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1800); // let entry animations and the progress ease settle
  await capture(page, locator(), `${DIR}/${file}-${lang}-${theme}-${width}.png`);
}

/** Grows the viewport to the element so sticky headers and the bottom nav never overlap it, then clips to the card with a little context around it. */
async function capture(page: Page, el: ReturnType<Page["getByTestId"]>, path: string) {
  const width = page.viewportSize()!.width;
  await page.setViewportSize({ width, height: 3200 });
  await page.waitForTimeout(400);
  const box = (await el.boundingBox())!;
  const y = Math.max(0, box.y - 12);
  await page.setViewportSize({ width, height: Math.ceil(box.y + box.height + 120) }); // room for the fixed bottom nav below the card
  await page.waitForTimeout(300);
  await page.screenshot({ path, clip: { x: 0, y, width, height: Math.ceil(box.height + 24) } });
}

test("Clinic and Nurse checklist screenshots", async ({ browser, request }) => {
  test.setTimeout(900_000);
  // Fresh organisations; remembered in QS_SHOTS_ACCOUNTS so a re-run does not hit the public sign-up throttle again.
  const cache = process.env.QS_SHOTS_ACCOUNTS;
  let accounts: { clinic: { email: string }; nurse: { email: string } } | null = null;
  try { if (cache) accounts = JSON.parse(readFileSync(cache, "utf8")); } catch { /* none yet */ }
  if (!accounts) {
    accounts = {
      clinic: await apiSignup(request, { planKey: "PRO", label: "Shots Clinic" }),
      nurse: await apiSignup(request, { planKey: "NURSE_LITE", edition: "NURSE", nurseKind: "SOLO", label: "Shots Nurse" }),
    };
    if (cache) writeFileSync(cache, JSON.stringify({ clinic: { email: accounts.clinic.email }, nurse: { email: accounts.nurse.email } }));
  }
  const { clinic, nurse } = accounts;
  const authFor = async (f: { email: string }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await signIn(p, f);
    const a = await p.evaluate(() => localStorage.getItem("cms-auth")!);
    await ctx.close();
    return a;
  };
  const clinicAuth = await authFor(clinic);
  const nurseAuth = await authFor(nurse);
  for (const lang of ["en", "ar"] as const) {
    for (const theme of ["light", "dark"] as const) {
      for (const width of [390, 1440]) {
        const ctx = await browser.newContext();
        const p = await ctx.newPage();
        await shoot(p, clinicAuth, lang, theme, width, "/", () => checklist(p), "clinic");
        await ctx.close();
        const nctx = await browser.newContext();
        const np = await nctx.newPage();
        await shoot(np, nurseAuth, lang, theme, width, "/nurse/onboarding", () => checklist(np), "nurse");
        await np.goto("/home-visits/today");
        await expect(np.getByTestId("nurse-setup-card")).toBeVisible({ timeout: 30_000 });
        await np.waitForTimeout(1800);
        await capture(np, np.getByTestId("nurse-setup-card"), `${DIR}/nurse-home-card-${lang}-${theme}-${width}.png`);
        await nctx.close();
      }
    }
  }
});
