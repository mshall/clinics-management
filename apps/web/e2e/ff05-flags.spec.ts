import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/** FF05 — platform flag page is a read-only mirror when Kiorex is the authority; org page shows value + source. */
for (const lang of ["en", "ar"] as const) {
  test(`FF05 org flag page shows effective value and source (${lang})`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript((l) => localStorage.setItem("i18nextLng", l), lang);
    await login(page, "admin@drahmedshall.com");
    await page.goto("/admin");
    await page.getByRole("button", { name: /^organization & settings$/i }).click();
    await expect(page.getByTestId("flag-source-ai_assistant")).toBeVisible({ timeout: 20_000 });
  });
}

test("FF05 platform overview shows the managed banner only in managed mode", async ({ page, request }) => {
  test.setTimeout(60_000);
  await login(page, "superadmin@kiorly.com");
  await page.goto("/platform");
  const status = await page.evaluate(async () => {
    const tok = sessionStorage.getItem("accessToken") ?? "";
    const r = await fetch("/api/v1/admin/platform/feature-flags-status", { headers: { Authorization: `Bearer ${tok}` } });
    return r.ok ? ((await r.json()) as { managed: boolean }) : null;
  });
  void request;
  const banner = page.getByTestId("flags-managed-banner");
  if (status?.managed) await expect(banner).toBeVisible();
  else await expect(banner).toHaveCount(0);
});
