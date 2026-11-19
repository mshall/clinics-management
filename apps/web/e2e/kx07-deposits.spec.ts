import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders, bookAppointmentViaApi } from "./golden-flow-helpers";
import { login } from "./helpers";

const receptionistEmail = "receptionist.hel@drahmedshall.com";

test("KX-07 deposit badge shows on the appointment", async ({ page, request }) => {
  test.setTimeout(120_000);
  const booked = await bookAppointmentViaApi(request, {
    receptionistEmail,
    physicianEmail: "physician.hel@drahmedshall.com",
  });
  const rh = authHeaders((await apiLogin(request, receptionistEmail)).accessToken);
  const dep = await request.post(`${API_BASE}/billing/deposits`, {
    headers: rh,
    data: {
      clinicId: booked.clinicId,
      patientId: booked.patientId,
      appointmentId: booked.appointmentId,
      amount: 50,
      method: "CASH",
    },
  });
  expect(dep.ok(), await dep.text()).toBeTruthy();

  const apt = await request.get(`${API_BASE}/appointments/${booked.appointmentId}`, { headers: rh });
  expect(apt.ok()).toBeTruthy();
  expect((await apt.json()).deposit).toMatchObject({ status: "HELD", source: "CLINIC" });

  await login(page, receptionistEmail);
  await page.goto(`/appointments/${booked.appointmentId}`);
  const badge = page.getByTestId("deposit-badge");
  await expect(badge).toBeVisible({ timeout: 20_000 });
  await expect(badge).toHaveAttribute("data-status", "HELD");
  await expect(badge).toContainText("Deposit");
});

test("KX-07 Kiorex tab shows the payouts reconciliation card", async ({ page }) => {
  await login(page, "admin@kiorly.com");
  await page.goto("/kiorex");
  const card = page.getByTestId("kiorex-payouts-card");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("kiorex-payouts-netDue")).toBeVisible();
  await expect(page.getByTestId("kiorex-payouts-outstanding")).toBeVisible();
});
