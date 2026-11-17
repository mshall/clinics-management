import { test, expect } from "@playwright/test";
import { login } from "./helpers";

const PILOTS = [
  { tier: "lite", email: "sales-lite@pilot.kiorly.com", maxPrimary: 8 },
  { tier: "pro", email: "sales-pro@pilot.kiorly.com", maxPrimary: 12 },
  { tier: "clinic", email: "sales-clinic@pilot.kiorly.com", maxPrimary: 14 },
] as const;

for (const locale of ["en", "ar"] as const) {
  for (const pilot of PILOTS) {
    test.describe(`PL-06 sidebar ${pilot.tier} (${locale})`, () => {
      test.use({ locale: locale === "ar" ? "ar-EG" : "en-US" });

      test(`snapshot nav for ${pilot.tier}`, async ({ page }) => {
        test.skip(
          process.env.CI !== "true" && !process.env.SEED_PILOT_TENANTS,
          "Pilot tenants require SEED_PILOT_TENANTS or staging seed",
        );
        await login(page, pilot.email);
        await page.goto("/");
        const nav = page.locator("nav").first();
        await expect(nav).toBeVisible({ timeout: 60_000 });
        const links = nav.locator("a");
        const count = await links.count();
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThanOrEqual(pilot.maxPrimary + 2);
        await expect(nav).toHaveScreenshot(`pl06-nav-${pilot.tier}-${locale}.png`, {
          maxDiffPixelRatio: 0.08,
        });
      });
    });
  }
}

test.describe("PL-06 Lite upgrade gate", () => {
  test("direct /hr shows upgrade for Lite", async ({ page }) => {
    test.skip(!process.env.SEED_PILOT_TENANTS, "Needs pilot Lite tenant");
    await login(page, "sales-lite@pilot.kiorly.com");
    await page.goto("/hr");
    await expect(page.getByText(/upgrade|ترقية/i)).toBeVisible({ timeout: 30_000 });
  });
});