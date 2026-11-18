import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders, runGoldenFlowViaApi } from "./golden-flow-helpers";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("CL-03 prescription verification", () => {
  test("signed visit prints a verified Rx; the QR page shows only what is on paper", async ({ page, request }) => {
    const physicianEmail = "physician.hel@drahmedshall.com";
    const result = await runGoldenFlowViaApi(request, {
      receptionistEmail: "receptionist.hel@drahmedshall.com",
      physicianEmail,
      adminEmail: "admin@drahmedshall.com",
      financeEmail: "finance@drahmedshall.com",
    });

    const ph = authHeaders((await apiLogin(request, physicianEmail)).accessToken);
    const printRes = await request.post(`${API_BASE}/encounters/${result.encounterId}/prescription/print`, {
      headers: ph,
    });
    expect(printRes.ok(), await printRes.text()).toBeTruthy();
    const printed = (await printRes.json()) as { verifyUrl: string; patientName: string; items: { brand: string }[] };
    const token = printed.verifyUrl.split("/rx/")[1]!;

    const patient = (await (
      await request.get(`${API_BASE}/patients/${result.patientId}`, { headers: ph })
    ).json()) as { mrn: string; phone: string };

    await page.goto(`/rx/${token}`);
    const card = page.getByTestId("rx-verify-valid");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText(printed.items[0]!.brand);
    await expect(card).not.toContainText(patient.mrn);
    await expect(card).not.toContainText(patient.phone);
    await expect(card).not.toContainText(printed.patientName);

    await login(page, physicianEmail);
    await page.goto(`/encounters/${result.encounterId}`);
    await expect(page.getByTestId("signed-rx-actions")).toBeVisible({ timeout: 60_000 });
  });

  test("unknown verification link shows not found", async ({ page }) => {
    await page.goto("/rx/not-a-real-token-value");
    await expect(page.getByTestId("rx-verify-invalid")).toBeVisible({ timeout: 30_000 });
  });
});
