import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders } from "./golden-flow-helpers";
import { login } from "./helpers";

const financeEmail = "admin@drahmedshall.com";

test("MN-05 claims workspace lists payers and creates a batch shell", async ({ page, request }) => {
  test.setTimeout(90_000);
  const headers = authHeaders((await apiLogin(request, financeEmail)).accessToken);
  const stamp = Date.now();

  const payerRes = await request.post(`${API_BASE}/claims/payers`, {
    headers,
    data: { nameEn: `E2E TPA ${stamp}`, nameAr: "تي بي ايه", contractRef: `E2E-${stamp}` },
  });
  expect(payerRes.ok(), await payerRes.text()).toBeTruthy();
  const payer = (await payerRes.json()) as { id: string };

  await login(page, financeEmail);
  await page.goto("/front-desk/claims");
  await expect(page.getByTestId("claims-workspace")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("claims-payer-select").selectOption(payer.id);
  await expect(page.getByTestId("claims-create-batch")).toBeEnabled();
});
