import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/** UX-02 — Lite doctor tasks completable on a 360 px screen. */
test.use({
  viewport: { width: 360, height: 740 },
  isMobile: true,
  hasTouch: true,
});

test.describe("UX-02 mobile-first doctor views (360px)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "physician.hel@drahmedshall.com");
  });

  test("bottom nav is visible and reaches Today / patients / encounters", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByTestId("mobile-bottom-nav");
    await expect(nav).toBeVisible();

    await nav.getByRole("link", { name: /patients|مرضى/i }).click();
    await expect(page).toHaveURL(/\/patients/);
    const overflowPatients = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowPatients).toBeLessThanOrEqual(2);

    await nav.getByRole("link", { name: /encounter|زيارات/i }).click();
    await expect(page).toHaveURL(/\/encounters/);
    const overflowEnc = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowEnc).toBeLessThanOrEqual(2);

    await page.goto("/kiorex");
    await expect(page.locator("main")).toBeVisible();
    const overflowKx = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowKx).toBeLessThanOrEqual(2);
  });
});
