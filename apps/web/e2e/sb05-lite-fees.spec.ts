import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders } from "./golden-flow-helpers";

/** SB-05: Lite plan shows "Kiorex fees this month" (with carry-forward) instead of a subscription. */
test.describe("SB-05 Lite Kiorex fees", () => {
  test("GET /billing/lite-fees exposes fees, carry-forward and minimum invoice", async ({ request }) => {
    const admin = await apiLogin(request, "admin@kiorly.com");
    const headers = authHeaders(admin.accessToken);
    const res = await request.get(`${API_BASE}/billing/lite-fees`, { headers });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as {
      isLite: boolean;
      feesThisMonth: string;
      carriedForward: string;
      projectedTotal: string;
      minInvoice: string;
    };
    expect(body.carriedForward).toMatch(/^\d+\.\d{2}$/);
    expect(Number(body.projectedTotal)).toBeCloseTo(Number(body.feesThisMonth) + Number(body.carriedForward), 2);
    expect(Number(body.minInvoice)).toBeGreaterThan(0);

    const sub = await request.get(`${API_BASE}/billing/subscription`, { headers });
    const plan = sub.ok() ? ((await sub.json()) as { plan?: { key?: string } }).plan?.key : undefined;
    expect(body.isLite).toBe(plan === "LITE");
  });
});
