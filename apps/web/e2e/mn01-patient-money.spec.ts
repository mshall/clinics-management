import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders, bookAppointmentViaApi } from "./golden-flow-helpers";
import { login } from "./helpers";

const receptionistEmail = "receptionist.hel@drahmedshall.com";

test("MN-01 patient packages tab: sell a package, use a session, refund a payment", async ({ page, request }) => {
  test.setTimeout(120_000);
  const booked = await bookAppointmentViaApi(request, {
    receptionistEmail,
    physicianEmail: "physician.hel@drahmedshall.com",
  });
  const rh = authHeaders((await apiLogin(request, receptionistEmail)).accessToken);
  const pay = await request.post(`${API_BASE}/billing/payments`, {
    headers: rh,
    data: { clinicId: booked.clinicId, patientId: booked.patientId, allocations: [{ method: "CASH", amount: 120 }] },
  });
  expect(pay.ok(), await pay.text()).toBeTruthy();

  await login(page, receptionistEmail);
  await page.goto(`/patients/${booked.patientId}`);
  await page.getByTestId("patient-tab-money").click();
  const section = page.getByTestId("patient-money-section");
  await expect(section).toBeVisible({ timeout: 20_000 });

  await section.getByRole("button", { name: "Sell package" }).click();
  await page.getByLabel("Name (English)").fill("E2E Physio x2");
  await page.getByLabel("Sessions").fill("2");
  await page.getByLabel("Price paid").fill("300");
  await page.getByRole("dialog").getByRole("button", { name: "Sell package" }).click();
  await expect(section.getByText("E2E Physio x2").first()).toBeVisible();
  await section.getByRole("button", { name: "Use 1 session" }).first().click();
  await expect(section.getByText(/1 of 2 sessions left/).first()).toBeVisible();

  await section.getByTestId("open-refund").first().click();
  await page.getByLabel("Amount").fill("20");
  await page.getByLabel("Reason").fill("E2E partial refund");
  await page.getByRole("button", { name: "Confirm refund" }).click();
  await expect(section.getByText("E2E partial refund").first()).toBeVisible();
  await expect(section.getByText("Refunded").first()).toBeVisible();
});
