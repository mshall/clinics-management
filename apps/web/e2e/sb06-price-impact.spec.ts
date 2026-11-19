import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders } from "./golden-flow-helpers";

/** SB-06: platform price version preview (no publish) + who-moves-when report. */
test.describe("SB-06 price indexation", () => {
  test("preview impact returns tenants affected and MRR delta without publishing", async ({ request }) => {
    const admin = await apiLogin(request, "superadmin@kiorly.com");
    const headers = authHeaders(admin.accessToken);

    const plansRes = await request.get(`${API_BASE}/admin/platform/plans`, { headers });
    expect(plansRes.status(), await plansRes.text()).toBe(200);
    const plans = (await plansRes.json()) as Array<{
      id: string;
      key: string;
      prices: Array<{ id: string; marketId: string; currency: string; interval: string; unit: string; validTo: string | null; cohortKey: string | null; amount: string }>;
    }>;
    const pro = plans.find((p) => p.key === "PRO");
    const current = pro?.prices.find((p) => p.validTo === null && p.cohortKey === null);
    if (!pro || !current) test.skip(true, "No active PRO price in this database");

    const before = pro!.prices.length;
    const res = await request.post(`${API_BASE}/admin/platform/plans/${pro!.id}/prices`, {
      headers,
      data: {
        marketId: current!.marketId,
        currency: current!.currency,
        interval: current!.interval,
        unit: current!.unit,
        amount: Number(current!.amount) + 100,
        preview: true,
      },
    });
    expect(res.status(), await res.text()).toBeLessThan(300);
    const body = (await res.json()) as { preview: boolean; impact: { tenantsAffected: number; mrrDelta: string } };
    expect(body.preview).toBe(true);
    expect(body.impact.tenantsAffected).toBeGreaterThanOrEqual(0);
    expect(body.impact.mrrDelta).toMatch(/^-?\d+\.\d{2}$/);

    const after = (await (await request.get(`${API_BASE}/admin/platform/plans`, { headers })).json()) as typeof plans;
    expect(after.find((p) => p.id === pro!.id)!.prices.length).toBe(before);

    const report = await request.get(`${API_BASE}/admin/platform/plans/price-migrations`, { headers });
    expect(report.status()).toBe(200);
    expect(Array.isArray(((await report.json()) as { items: unknown[] }).items)).toBe(true);
  });
});
