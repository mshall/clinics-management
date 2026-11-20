import { expect, test } from "@playwright/test";
import { login } from "./helpers";

async function openEncountersWithRows(page: import("@playwright/test").Page) {
  const listRes = page.waitForResponse(
    (r) => /\/api\/v1\/encounters\?/.test(r.url()) && r.request().method() === "GET",
  );
  await page.goto("/encounters");
  const response = await listRes;
  expect(response.status()).toBe(200);
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
}

async function expectEncounterDeleteVisible(page: import("@playwright/test").Page) {
  await openEncountersWithRows(page);
  await expect(page.getByRole("button", { name: /^delete$/i }).first()).toBeVisible();
}

async function expectEncounterDeleteHidden(page: import("@playwright/test").Page) {
  await openEncountersWithRows(page);
  await expect(page.getByRole("button", { name: /^delete$/i })).toHaveCount(0);
}

test.describe("Encounter delete by organization role", () => {
  test("group admin sees delete on encounters list", async ({ page }) => {
    await login(page, "admin@drahmedshall.com");
    await expectEncounterDeleteVisible(page);
  });

  test("group supervisor sees delete on encounters list", async ({ page }) => {
    await login(page, "supervisor@drahmedshall.com");
    await expectEncounterDeleteVisible(page);
  });

  // CALL_CENTER's role ceiling (nav-tab-keys ROLE_MAX) has no "encounters" tab, so the list API is forbidden outright (no delete to see).
  test("call center has no encounters access", async ({ page }) => {
    await login(page, "callcenter@drahmedshall.com");
    await page.goto("/patients");
    const status = await page.evaluate(async () => {
      const token = (JSON.parse(localStorage.getItem("cms-auth") ?? "{}") as { state?: { accessToken?: string } }).state?.accessToken ?? "";
      return (await fetch("/api/v1/encounters?page=1&pageSize=1", { headers: { Authorization: `Bearer ${token}` } })).status;
    });
    expect(status).toBe(403);
    await expect(page.getByRole("link", { name: /^encounters$/i })).toHaveCount(0);
  });

  test("physician does not see delete on encounters list", async ({ page }) => {
    await login(page, "physician@kiorly.com");
    await expectEncounterDeleteHidden(page);
  });

  test("clinic assistant does not see delete on encounters list", async ({ page }) => {
    await login(page, "assistant@kiorly.com");
    await expectEncounterDeleteHidden(page);
  });

  test("physician DELETE /encounters/:id is forbidden", async ({ page }) => {
    await login(page, "physician@kiorly.com");
    await page.goto("/encounters");
    const status = await page.evaluate(async () => {
      // The session token lives in the persisted zustand store (localStorage "cms-auth"), not in cookies.
      const token = (JSON.parse(localStorage.getItem("cms-auth") ?? "{}") as { state?: { accessToken?: string } }).state?.accessToken ?? "";
      const headers = { Authorization: `Bearer ${token}` };
      const listRes = await fetch("/api/v1/encounters?page=1&pageSize=1", { headers });
      if (!listRes.ok) return listRes.status;
      const list = (await listRes.json()) as { items?: Array<{ id: string }> };
      const id = list.items?.[0]?.id;
      if (!id) return null;
      const delRes = await fetch(`/api/v1/encounters/${id}`, { method: "DELETE", headers });
      return delRes.status;
    });
    expect(status).toBe(403);
  });
});
