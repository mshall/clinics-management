import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { pinLocaleAndTheme } from "./crash-sweep-helpers";
import { login } from "./helpers";

/**
 * Final close-out lane: the W6-W9 provider pages at the four edge viewports (320, 640x450, 1440, 2560) in English and Arabic (RTL), against a real private stack and its seeded demo users. Deliberately fixture-free:
 * the page renders its root, the direction follows the language, there is no horizontal overflow, no uncaught page error and axe (WCAG 2 A/AA) reports no serious or critical violation inside the page. The content
 * assertions (lots, ledger rows, wizard) stay in the per-page specs that own those fixtures.
 */
const PAGES = [
  { key: "credit wallet", path: "/credit", root: "credit-wallet", user: "admin@drahmedshall.com" },
  { key: "promotions", path: "/promotions", root: "promotions-page", user: "admin@drahmedshall.com" },
  { key: "kiorex commissions", path: "/kiorex-commissions", root: "kiorex-commissions-panel", user: "finance@drahmedshall.com" },
  { key: "growth workspace", path: "/kiorex/growth?tab=links", root: "growth-page", user: "admin@drahmedshall.com" },
] as const;
const VIEWPORTS = [{ w: 320, h: 740 }, { w: 640, h: 450 }, { w: 1440, h: 900 }, { w: 2560, h: 1440 }] as const;

// One sign-in per user and language (the API throttles logins per e-mail), then every page at every viewport.
const USERS = [...new Set(PAGES.map((p) => p.user))];
for (const user of USERS) for (const lang of ["en", "ar"] as const) {
  test(`${user} (${lang}): ${PAGES.filter((p) => p.user === user).map((p) => p.key).join(", ")} at 320, 640x450, 1440 and 2560: renders, direction, no overflow, no page error, axe serious/critical clean`, async ({ page }) => {
    test.setTimeout(600_000);
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
    await pinLocaleAndTheme(page, lang, "light");
    await login(page, user);
    for (const pg of PAGES.filter((p) => p.user === user)) for (const vp of VIEWPORTS) {
      const at = `${pg.key} ${vp.w}x${vp.h}`;
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto(pg.path);
      await expect(page.getByTestId(pg.root), at).toBeVisible({ timeout: 60_000 });
      await expect(page.locator("html"), at).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      await page.waitForLoadState("networkidle").catch(() => undefined);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${at}: no horizontal overflow`).toBeLessThanOrEqual(1);
      const r = await new AxeBuilder({ page }).include(`[data-testid="${pg.root}"]`).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${at} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}
