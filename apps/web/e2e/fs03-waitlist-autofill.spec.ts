import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders, bookAppointmentViaApi } from "./golden-flow-helpers";
import { login } from "./helpers";

const receptionistEmail = "receptionist.hel@drahmedshall.com";

test("FS-03 front desk adds a patient to the waitlist and sees the cancelled slot being offered", async ({ page, request }) => {
  test.setTimeout(120_000);
  const booked = await bookAppointmentViaApi(request, {
    receptionistEmail,
    physicianEmail: "physician.hel@drahmedshall.com",
  });
  const rh = authHeaders((await apiLogin(request, receptionistEmail)).accessToken);
  const apt = (await (await request.get(`${API_BASE}/appointments/${booked.appointmentId}`, { headers: rh })).json()) as {
    startsAt: string;
  };
  const patients = (await (await request.get(`${API_BASE}/patients?pageSize=20`, { headers: rh })).json()) as {
    items: { id: string; mrn: string; firstNameEn: string; lastNameEn: string }[];
  };
  const other = patients.items.find((p) => p.id !== booked.patientId);
  expect(other, "a second patient to put on the waitlist").toBeTruthy();

  await login(page, receptionistEmail);
  await page.goto("/front-desk/board");
  await page.locator("select").first().selectOption(booked.clinicId);
  const panel = page.getByTestId("waitlist-panel");
  await expect(panel).toBeVisible({ timeout: 20_000 });

  await panel.getByRole("button", { name: /patient to add/i }).click();
  await panel.getByRole("combobox").fill(other!.mrn);
  await page.locator('[data-pick-list-panel][role="listbox"]').getByRole("option").first().click();
  await expect(panel.getByTestId("waitlist-add")).toBeEnabled();
  const added = page.waitForResponse((r) => r.url().endsWith("/scheduling/waitlist") && r.request().method() === "POST");
  await panel.getByTestId("waitlist-add").click();
  const addRes = await added;
  expect(addRes.ok(), await addRes.text()).toBeTruthy();
  const entryId = ((await addRes.json()) as { id: string }).id;
  const entrySel = `[data-testid="waitlist-entry"][data-entry-id="${entryId}"]`;
  await expect(panel.locator(entrySel)).toBeVisible({ timeout: 15_000 });

  const cancel = await request.patch(`${API_BASE}/appointments/${booked.appointmentId}/status`, {
    headers: rh,
    data: { status: "CANCELLED", cancellationReason: "Patient called to cancel" },
  });
  expect(cancel.ok(), await cancel.text()).toBeTruthy();

  await page.reload();
  await page.locator("select").first().selectOption(booked.clinicId);
  const slot = page.locator(`[data-testid="waitlist-slot"][data-starts-at="${new Date(apt.startsAt).toISOString()}"]`);
  await expect(slot, "freed slot is listed with its offer status").toBeVisible({ timeout: 20_000 });
  await expect(slot.getByTestId("waitlist-slot-status")).toBeVisible();

  await page.locator(entrySel).getByRole("button", { name: /remove/i }).click();
  await expect(page.locator(entrySel)).toHaveCount(0, { timeout: 15_000 });
});
