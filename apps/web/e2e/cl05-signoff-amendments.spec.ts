import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders, runGoldenFlowViaApi } from "./golden-flow-helpers";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("CL-05 doctor sign-off and amendment trail", () => {
  test("on a phone, the doctor sees who signed, when it locks, the amendment trail, and can re-sign", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const physicianEmail = "physician.hel@drahmedshall.com";
    const result = await runGoldenFlowViaApi(request, {
      receptionistEmail: "receptionist.hel@drahmedshall.com",
      physicianEmail,
      adminEmail: "admin@drahmedshall.com",
      financeEmail: "finance@drahmedshall.com",
    });
    const ph = authHeaders((await apiLogin(request, physicianEmail)).accessToken);
    const reason = `Corrected exam finding ${Date.now()}`;
    const amendRes = await request.post(`${API_BASE}/encounters/${result.encounterId}/amend`, {
      headers: ph,
      data: { reason },
    });
    expect(amendRes.ok(), await amendRes.text()).toBeTruthy();

    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, physicianEmail);
    await page.goto(`/encounters/${result.encounterId}`);

    const trail = page.getByTestId("encounter-signoff-trail");
    await expect(trail).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("encounter-signed-line")).toBeVisible();
    await expect(page.getByTestId("encounter-amendment-trail")).toContainText(reason);

    const sign = page.getByTestId("encounter-sign-button");
    await sign.scrollIntoViewIfNeeded();
    await expect(sign).toBeEnabled();
    const box = await sign.boundingBox();
    expect(box && box.height >= 40, "sign button is a usable tap target").toBeTruthy();
    await sign.click();
    const resigned = page.waitForResponse(
      (r) => r.url().includes(`/encounters/${result.encounterId}/finalize`) && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /yes, finalize|نعم/i }).click();
    expect((await resigned).ok()).toBeTruthy();

    await expect(page.getByTestId("encounter-amendment-trail")).toContainText(/re-signed/i, { timeout: 30_000 });
    await expect(page.getByTestId("encounter-lock-line")).toBeVisible();
    await expect(page.getByTestId("encounter-sign-button")).toHaveCount(0);
  });
});
