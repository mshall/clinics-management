import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders } from "./golden-flow-helpers";
import { login } from "./helpers";

const physicianEmail = "physician.hel@drahmedshall.com";
const month = () => new Date().toISOString().slice(0, 7);

test("MN-02 owner sees all doctor statements with a balanced reconciliation", async ({ page, request }) => {
  const oh = authHeaders((await apiLogin(request, "admin@drahmedshall.com")).accessToken);
  const rec = await request.get(`${API_BASE}/revenue-share/reconciliation?period=${month()}`, { headers: oh });
  expect(rec.ok(), await rec.text()).toBeTruthy();
  expect((await rec.json()).balanced).toBe(true);

  await login(page, "admin@drahmedshall.com");
  await page.goto("/revenue");
  const card = page.getByTestId("doctor-statements-card");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByTestId("statement-period").fill(month());
  await expect(card.getByTestId("statement-reconciliation")).toHaveAttribute("data-balanced", "true", { timeout: 20_000 });
  await expect(card.getByTestId("share-rules-open")).toBeVisible();
});

test("MN-02 a doctor sees only their own statement and cannot approve", async ({ page, request }) => {
  const ph = authHeaders((await apiLogin(request, physicianEmail)).accessToken);
  const res = await request.get(`${API_BASE}/revenue-share/statements?period=${month()}`, { headers: ph });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { canManage: boolean; statements: { clinicianId: string }[] };
  expect(body.canManage).toBe(false);
  expect(new Set(body.statements.map((s) => s.clinicianId)).size).toBeLessThanOrEqual(1);
  const approve = await request.post(`${API_BASE}/revenue-share/statements/x/approve`, { headers: ph, data: {} });
  expect(approve.status()).toBe(403);

  await login(page, physicianEmail);
  await page.goto("/doctor-revenue");
  const card = page.getByTestId("doctor-statements-card");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByTestId("statement-period").fill(month());
  await expect(card.getByTestId("statement-approve")).toHaveCount(0);
  await expect(card.getByTestId("share-rules-open")).toHaveCount(0);
});
