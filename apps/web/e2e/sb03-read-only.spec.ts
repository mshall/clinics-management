import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * SB-03: READ_ONLY tenants keep clinical read/export; scheduling writes are blocked.
 * Uses direct API calls (subscription status set via test harness is not available in e2e —
 * this spec documents expected API behavior when the demo org is configured READ_ONLY).
 */
test.describe("SB-03 read-only access", () => {
  test("GET patients and GET encounters succeed for group admin", async ({ page }) => {
    await login(page, "admin@kiorly.com");
    const patients = page.waitForResponse((r) => /\/api\/v1\/patients\?/.test(r.url()) && r.method() === "GET");
    await page.goto("/patients");
    expect((await patients).status()).toBe(200);

    const encounters = page.waitForResponse((r) => /\/api\/v1\/encounters\?/.test(r.url()) && r.method() === "GET");
    await page.goto("/encounters");
    expect((await encounters).status()).toBe(200);
  });

  test("POST /appointments returns 403 when subscription is READ_ONLY (API probe)", async ({ page }) => {
    await login(page, "admin@kiorly.com");
  const statusRes = await page.request.get("/api/v1/billing/access-state");
    expect(statusRes.status()).toBe(200);
    const state = (await statusRes.json()) as { status: string; allowedActions: string[] };

    if (state.status !== "READ_ONLY") {
      test.skip(true, "Demo tenant is not READ_ONLY — run sb03-dunning.integration.test.ts for full matrix");
    }

    const clinics = await page.request.get("/api/v1/clinics");
    expect(clinics.status()).toBe(200);
    const clinicList = (await clinics.json()) as { items: { id: string }[] };
    const clinicId = clinicList.items[0]?.id;
    if (!clinicId) test.skip(true, "No clinic");

    const create = await page.request.post("/api/v1/appointments", {
      data: {
        clinicId,
        patientMrn: "MRN-DEMO",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        durationMinutes: 30,
      },
    });
    expect(create.status()).toBe(403);
    expect(state.allowedActions).toContain("EXPORT");
    expect(state.allowedActions).not.toContain("SCHEDULING_WRITE");
  });
});