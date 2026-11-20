import { expect, test } from "@playwright/test";
import { apiLogin, bookHomeVisit, clearToday, createPatient, ensureHomeSettings, homeType, prisma, SOLO_EMAIL, tenantOf, uiLogin, verifyNurse, visitOf } from "./nurse-fixtures";

/** Q7 — solo nurse home visit end to end: booked -> on my way -> arrived -> vitals (critical value escalation) -> MAR -> sign -> finished. Real logins, real API (gates satisfied by the E2E stack). */
test.describe.configure({ mode: "serial" });

test("solo nurse: home visit end to end with vitals, critical-value escalation and MAR", async ({ page, request, baseURL }) => {
  test.setTimeout(240_000);
  const me = await tenantOf(SOLO_EMAIL);
  await verifyNurse(SOLO_EMAIL);
  await ensureHomeSettings(me.tenantId, me.userId);
  await clearToday(me.tenantId, me.userId);
  const type = await homeType(me.tenantId);
  const patient = await createPatient(me.tenantId, "Solo");
  const token = await apiLogin(request, baseURL!, SOLO_EMAIL);
  await bookHomeVisit(request, baseURL!, token, { clinicId: me.clinicId, patientId: patient.id, clinicianId: me.userId, typeId: type.id, minutesFromNow: 20 });

  await uiLogin(page, SOLO_EMAIL);
  await expect(page).toHaveURL(/home-visits\/today/, { timeout: 30_000 });
  await expect(page.getByTestId("nurse-nav")).toBeVisible().catch(() => undefined); // desktop sidebar only; Pixel 5 uses the bottom bar
  await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();

  const card = page.getByTestId("home-visit-card").filter({ hasText: patient.lastNameEn });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: "On my way" }).click();
  await expect(card.getByRole("button", { name: "Arrived" })).toBeVisible();
  await card.getByRole("button", { name: "Arrived" }).click();
  await expect(card.getByTestId("open-visit-record")).toBeVisible();
  await expect(card.getByTestId("sos-button")).toBeVisible();

  // visit record
  await card.getByTestId("open-visit-record").click();
  await expect(page.getByTestId("nurse-visit-record")).toBeVisible();
  await page.getByRole("button", { name: "+ Injection given" }).click();
  await page.getByLabel("Assessment").fill("Patient comfortable, wound clean.");
  await page.getByLabel("Intervention").fill("Injection given as ordered.");

  // vitals: a normal set first, then a critical one blocks signing until the action is logged
  await page.getByLabel("Pulse (bpm)").fill("78");
  await page.getByRole("button", { name: "Record vitals" }).click();
  await expect(page.getByTestId("vitals-history")).toContainText("78");
  await expect(page.getByTestId("critical-banner")).toHaveCount(0);
  await page.getByLabel("Systolic (mmHg)").fill("190");
  await page.getByLabel("Diastolic (mmHg)").fill("100");
  await page.getByRole("button", { name: "Record vitals" }).click();
  await expect(page.getByTestId("critical-banner")).toBeVisible();
  await expect(page.getByTestId("critical-banner")).toContainText("call the doctor");
  await expect(page.getByTestId("critical-banner").getByRole("link", { name: /123/ })).toBeVisible();
  await expect(page.getByTestId("visit-sign")).toBeDisabled();
  await page.getByTestId("escalation-log").click();
  await expect(page.getByTestId("critical-banner")).toHaveCount(0);
  await expect(page.getByTestId("visit-sign")).toBeEnabled();

  // MAR: no order -> no administration; add a doctor's order; give once; the duplicate and an off-order medicine are blocked
  await page.getByRole("link", { name: "Medication (MAR)" }).first().click();
  await expect(page.getByTestId("nurse-mar")).toBeVisible();
  await expect(page.getByTestId("mar-need-order")).toBeVisible();
  await expect(page.getByTestId("mar-submit")).toBeDisabled();
  await page.getByTestId("mar-add-order").click();
  const dlg = page.getByTestId("mar-order-dialog");
  await dlg.getByLabel("Prescriber (doctor)").fill("Dr. Amr Hassan");
  await dlg.locator("#ord-med-0").fill("Paracetamol 500mg");
  await dlg.locator("#ord-dose-0").fill("500 mg");
  await dlg.locator("#ord-route-0").fill("oral");
  await dlg.getByLabel(/I confirm the prescriber/).check();
  await page.getByTestId("mar-order-submit").click();
  await expect(page.getByTestId("mar-order")).toBeVisible();
  await page.getByTestId("mar-administer-line").click();
  await page.getByTestId("mar-submit").click();
  await expect(page.getByTestId("mar-given")).toContainText("Paracetamol 500mg");
  await page.getByTestId("mar-submit").click();
  await expect(page.getByTestId("mar-block")).toHaveAttribute("data-code", "DUPLICATE_ADMINISTRATION");
  await page.locator("#mar-medicine").fill("Ibuprofen 400mg");
  await page.getByTestId("mar-submit").click();
  await expect(page.getByTestId("mar-block")).toHaveAttribute("data-code", "MEDICINE_NOT_IN_ORDER");
  await expect(page.getByTestId("mar-block")).toContainText("Nothing was recorded");
  await expect(page.getByTestId("mar-given").locator("li")).toHaveCount(1);

  // back to the visit, sign, finish
  await page.goBack();
  await expect(page.getByTestId("nurse-visit-record")).toBeVisible();
  await page.getByTestId("visit-sign").click();
  await expect(page.getByTestId("nurse-error")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("visit-family-update")).toBeVisible({ timeout: 30_000 });
  await page.goto("/home-visits/today");
  const card2 = page.getByTestId("home-visit-card").filter({ hasText: patient.lastNameEn });
  // signing finalizes the encounter, which completes the appointment and the home visit; if it is still ARRIVED the nurse taps Finished
  await expect(card2).toBeVisible();
  const finishBtn = card2.getByRole("button", { name: "Finished" });
  if (await finishBtn.isVisible().catch(() => false)) await finishBtn.click();
  await expect.poll(async () => (await visitOf(patient.id)).state, { timeout: 30_000 }).toBe("FINISHED");
  const vitals = await prisma.vitalsObservation.findMany({ where: { patientId: patient.id } });
  expect(vitals.filter((v) => v.critical).every((v) => v.escalationAction === "CALLED_DOCTOR")).toBe(true);
  expect(await prisma.medicationAdministration.count({ where: { patientId: patient.id } })).toBe(1);
});
