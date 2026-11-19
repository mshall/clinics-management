import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders, bookAppointmentViaApi } from "./golden-flow-helpers";
import { login } from "./helpers";

const receptionistEmail = "receptionist.hel@drahmedshall.com";
const physicianEmail = "physician.hel@drahmedshall.com";

test("MN-06 split payment posts one revenue row per method; installments screen lists the schedule", async ({ page, request }) => {
  test.setTimeout(120_000);
  const booked = await bookAppointmentViaApi(request, { receptionistEmail, physicianEmail });
  const adminHeaders = authHeaders((await apiLogin(request, "admin@drahmedshall.com")).accessToken);
  const headers = authHeaders((await apiLogin(request, receptionistEmail)).accessToken);

  const op = await request.post(`${API_BASE}/operations`, {
    headers: adminHeaders,
    data: {
      clinicId: booked.clinicId,
      patientId: booked.patientId,
      clinicianId: booked.clinicianId,
      operationDate: new Date().toISOString(),
      totalCost: 1500,
      acquisitionChannel: "WEBSITE_GOOGLE",
    },
  });
  expect(op.ok(), await op.text()).toBeTruthy();
  const operationId = ((await op.json()) as { id: string }).id;

  const plus = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
  const sched = await request.put(`${API_BASE}/billing/operations/${operationId}/installments`, {
    headers,
    data: { rows: [{ dueOn: plus(1), amount: 750 }, { dueOn: plus(30), amount: 750 }] },
  });
  expect(sched.ok(), await sched.text()).toBeTruthy();

  const split = await request.post(`${API_BASE}/billing/split-payments`, {
    headers,
    data: {
      clinicId: booked.clinicId,
      patientId: booked.patientId,
      target: { kind: "OPERATION", operationId },
      allocations: [
        { method: "CASH", amount: 400 },
        { method: "CARD", amount: 350 },
      ],
    },
  });
  expect(split.ok(), await split.text()).toBeTruthy();
  const paid = await split.json();
  expect(paid.allocations).toHaveLength(2);
  expect(paid.installmentsPaid).toHaveLength(1);
  for (const a of paid.allocations as { revenueEntryId: string }[]) {
    expect(a.revenueEntryId).toBeTruthy();
  }

  await login(page, receptionistEmail);
  await page.goto("/front-desk/installments");
  await expect(page.getByTestId("installments-page")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("combobox", { name: /clinic/i }).selectOption(booked.clinicId);
  await page.getByTestId("installments-filter").selectOption("");
  await expect(page.locator("[data-testid^='installment-row-']").first()).toBeVisible({ timeout: 20_000 });
});
