import { expect, test } from "@playwright/test";
import { apiBase, apiLogin, bookHomeVisit, clearToday, createPatient, ensureHomeSettings, homeType, prisma, SOLO_EMAIL, tenantOf, uiLogin, verifyNurse } from "./nurse-fixtures";

/** Q7 + Q8 — KNLAB01: transcribe a doctor's lab request, refusals (consent, identifier mismatch, future time, duplicate tube), hand-over and the custody timeline. */
test("lab sample collection: refusals are shown clearly, then hand-over and custody timeline", async ({ page, request, baseURL }) => {
  test.setTimeout(240_000);
  const me = await tenantOf(SOLO_EMAIL);
  await verifyNurse(SOLO_EMAIL);
  await ensureHomeSettings(me.tenantId, me.userId);
  await clearToday(me.tenantId, me.userId);
  const type = await homeType(me.tenantId);
  const patient = await createPatient(me.tenantId, "Lab");
  await prisma.patient.update({ where: { id: patient.id }, data: { dob: new Date("1985-04-12T00:00:00Z") } });
  const token = await apiLogin(request, baseURL!, SOLO_EMAIL);
  await bookHomeVisit(request, baseURL!, token, { clinicId: me.clinicId, patientId: patient.id, clinicianId: me.userId, typeId: type.id, minutesFromNow: 30 });
  const visit = await prisma.homeVisit.findFirstOrThrow({ where: { patientId: patient.id }, select: { id: true, appointmentId: true } });
  for (const [action, body] of [["depart", { lat: 30.06, lng: 31.32 }], ["arrive", { lat: 30.06, lng: 31.32 }]] as const) {
    expect((await request.post(`${apiBase(baseURL!)}/home-visits/${visit.id}/${action}`, { headers: { Authorization: `Bearer ${token}` }, data: body })).ok()).toBe(true);
  }

  await uiLogin(page, SOLO_EMAIL);
  await page.goto(`/nurse/visits/${visit.appointmentId}`);
  await page.getByTestId("visit-lab-link").click();
  await expect(page.getByTestId("nurse-lab")).toBeVisible();

  // a nurse transcribes a doctor's request (cannot order on her own authority)
  await page.locator("#lab-doctor").fill("Dr. Sherif Adel");
  await page.locator("#lab-code-0").fill("CBC");
  await page.locator("#lab-name-0").fill("Complete blood count");
  await expect(page.getByTestId("lab-create")).toBeDisabled();
  await page.getByLabel(/I confirm I am transcribing/).check();
  await page.getByTestId("lab-create").click();
  await page.getByTestId("lab-order-card").first().getByRole("link").click();
  await expect(page.getByTestId("nurse-lab-detail")).toBeVisible();

  const tubeLabel = `TUBE-${Date.now().toString(36).toUpperCase()}`;
  const fill = async (label: string, tube: string) => {
    await page.locator("#lab-id-FULL_NAME").fill(`E2E Lab Patient ${patient.lastNameEn.split(" ")[1]}`);
    await page.locator("#lab-id-DATE_OF_BIRTH").fill(label);
    await page.locator("#lab-tl-0").fill(tube);
  };
  // one identifier is not enough
  await page.locator("#lab-id-FULL_NAME").fill(`E2E Lab Patient ${patient.lastNameEn.split(" ")[1]}`);
  await page.locator("#lab-tl-0").fill(tubeLabel);
  await expect(page.getByTestId("lab-collect-submit")).toBeDisabled();
  // wrong date of birth -> identifier mismatch, nothing sent
  await fill("1990-01-01", tubeLabel);
  await page.getByTestId("lab-collect-submit").click();
  await expect(page.getByTestId("lab-block")).toHaveAttribute("data-code", "IDENTIFIER_MISMATCH");
  await expect(page.getByTestId("lab-block")).toContainText("Nothing was sent");
  // correct identifiers but no consent yet
  await fill("1985-04-12", tubeLabel);
  await page.getByTestId("lab-collect-submit").click();
  await expect(page.getByTestId("lab-block")).toHaveAttribute("data-code", "LAB_HANDOFF_NO_CONSENT");
  // future collection time
  await prisma.patientRecordShareConsent.create({ data: { tenantId: me.tenantId, patientId: patient.id, scope: "LAB_RESULTS", granted: true } });
  const future = new Date(Date.now() + 3 * 3600_000);
  const fut = new Date(future.getTime() - future.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.locator("#lab-collected").fill(fut);
  await page.getByTestId("lab-collect-submit").click();
  await expect(page.getByTestId("lab-block")).toHaveAttribute("data-code", "COLLECTED_IN_FUTURE");
  // valid -> handed over, custody timeline starts with the nurse's collection
  const now = new Date(Date.now() - 2 * 60_000);
  await page.locator("#lab-collected").fill(new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  await page.locator("#lab-temp").fill("4.5");
  await page.getByTestId("lab-collect-submit").click();
  await expect(page.getByTestId("lab-custody")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("lab-custody-events")).toContainText("Collected");
  await expect(page.getByTestId("lab-custody")).toContainText(tubeLabel);
  await expect(page.getByTestId("lab-collect-form")).toHaveCount(0);
  expect(await prisma.labSampleCollection.count({ where: { patientId: patient.id } })).toBe(1);
});
