import { expect, test } from "@playwright/test";
import { apiLogin, bookHomeVisit, clearToday, createPatient, ensureHomeSettings, homeType, prisma, SOLO_EMAIL, tenantOf, uiLogin, verifyNurse } from "./nurse-fixtures";

/** Q7 — MAR blocks are shown as blocks (allergy, expired / revoked order, controlled witness); nothing is recorded when refused. */
test("MAR: allergy conflict, expired order and controlled-witness blocks", async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  const me = await tenantOf(SOLO_EMAIL);
  await verifyNurse(SOLO_EMAIL);
  await ensureHomeSettings(me.tenantId, me.userId);
  const patient = await createPatient(me.tenantId, "Mar", { allergy: "PENICILLIN" });
  // the nurse can only open patients she has a visit with
  await clearToday(me.tenantId, me.userId);
  const type = await homeType(me.tenantId);
  await bookHomeVisit(request, baseURL!, await apiLogin(request, baseURL!, SOLO_EMAIL), { clinicId: me.clinicId, patientId: patient.id, clinicianId: me.userId, typeId: type.id, minutesFromNow: 40 });
  const day = (n: number) => new Date(Date.now() + n * 86_400_000);
  const base = { tenantId: me.tenantId, patientId: patient.id, source: "PHOTO_UPLOAD" as const, prescriberName: "Dr. E2E", confirmedByNurseId: me.userId, confirmedAt: new Date() };
  await prisma.doctorOrder.create({ data: { ...base, orderedOn: day(-1), expiresOn: day(20), linesJson: [{ medicineName: "Amoxicillin 500mg", dose: "500 mg", route: "oral" }] } });
  await prisma.doctorOrder.create({ data: { ...base, prescriberName: "Dr. Expired", orderedOn: day(-30), expiresOn: day(-3), linesJson: [{ medicineName: "Paracetamol 500mg", dose: "500 mg", route: "oral" }] } });
  await prisma.doctorOrder.create({ data: { ...base, prescriberName: "Dr. Controlled", orderedOn: day(-1), expiresOn: day(10), controlled: true, linesJson: [{ medicineName: "Morphine 10mg", dose: "10 mg", route: "IM" }] } });

  await uiLogin(page, SOLO_EMAIL);
  await page.goto(`/nurse/mar/${patient.id}`);
  await expect(page.getByTestId("nurse-mar")).toBeVisible();
  await expect(page.getByTestId("mar-rule")).toContainText("No order, no administration");
  await expect(page.getByTestId("mar-allergies")).toContainText(/penicillin/i);

  // expired order: shown as expired, cannot be given
  const expired = page.getByTestId("mar-order").filter({ hasText: "Dr. Expired" });
  await expect(expired).toContainText("Expired");
  await expect(expired.getByTestId("mar-administer-line")).toHaveCount(0);

  // allergy conflict is a block, nothing recorded
  const amox = page.getByTestId("mar-order").filter({ hasText: "Dr. E2E" });
  await amox.getByTestId("mar-administer-line").click();
  await page.getByTestId("mar-submit").click();
  const block = page.getByTestId("mar-block");
  await expect(block).toHaveAttribute("data-code", "ALLERGY_CONFLICT");
  await expect(block).toContainText("Blocked");
  await expect(block).toContainText("Nothing was recorded");
  expect(await prisma.medicationAdministration.count({ where: { patientId: patient.id } })).toBe(0);

  // controlled medicine needs a witness before the form can even be submitted
  await page.getByTestId("mar-order").filter({ hasText: "Dr. Controlled" }).getByTestId("mar-administer-line").click();
  await expect(page.locator("#mar-witness")).toBeVisible();
  await expect(page.getByTestId("mar-submit")).toBeDisabled();
  await page.locator("#mar-witness").fill("Nurse Hoda");
  await expect(page.getByTestId("mar-submit")).toBeEnabled();
});
