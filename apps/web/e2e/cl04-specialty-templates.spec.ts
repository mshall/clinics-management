import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders } from "./golden-flow-helpers";
import { login } from "./helpers";

test.describe("CL-04 specialty templates", () => {
  test("OB/GYN template from the specialty picker computes EDD from LMP", async ({ page, request }) => {
    const physicianEmail = "physician.hel@drahmedshall.com";
    const session = await apiLogin(request, physicianEmail);
    const h = authHeaders(session.accessToken);
    const clinics = (await (await request.get(`${API_BASE}/clinics`, { headers: h })).json()) as { id: string; nameEn: string }[];
    const clinic = clinics.find((c) => /heliopolis/i.test(c.nameEn)) ?? clinics[0]!;
    const patients = (await (await request.get(`${API_BASE}/patients?pageSize=1`, { headers: h })).json()) as {
      items: { id: string }[];
    };
    const encRes = await request.post(`${API_BASE}/encounters`, {
      headers: h,
      data: { clinicId: clinic.id, patientId: patients.items[0]!.id, visitType: "Office visit" },
    });
    expect(encRes.ok(), await encRes.text()).toBeTruthy();
    const enc = (await encRes.json()) as { id: string };

    await login(page, physicianEmail);
    await page.goto(`/encounters/${enc.id}`);
    const picker = page.locator("#clinical-template");
    await expect(picker).toBeVisible({ timeout: 60_000 });
    await expect(picker.locator("optgroup", { hasText: "Default · OB / GYN" })).toHaveCount(1);
    const obValue = await picker.locator("option", { hasText: "Default · OB / GYN" }).getAttribute("value");
    await picker.selectOption(obValue!);
    await page.locator('input[type="date"]').first().fill("2026-01-01");
    await expect(page.getByTestId("computed-edd")).toHaveText("2026-10-08");

    await request.delete(`${API_BASE}/encounters/${enc.id}`, { headers: h });
  });
});
