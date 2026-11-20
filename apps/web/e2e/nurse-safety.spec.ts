import { expect, test } from "@playwright/test";
import { apiBase, apiLogin, bookHomeVisit, clearToday, createPatient, ensureHomeSettings, homeType, prisma, SOLO_EMAIL, tenantOf, uiLogin, verifyNurse } from "./nurse-fixtures";

/** Q7 — safety: SOS (123 / 122, live location to the safety contact), the check-in timer and the unsafe-abort flow (never a no-show). */
test("safety: check-in timer, SOS and leaving an unsafe visit", async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  const me = await tenantOf(SOLO_EMAIL);
  await verifyNurse(SOLO_EMAIL);
  await ensureHomeSettings(me.tenantId, me.userId);
  await clearToday(me.tenantId, me.userId);
  const type = await homeType(me.tenantId);
  const patient = await createPatient(me.tenantId, "Safety");
  const token = await apiLogin(request, baseURL!, SOLO_EMAIL);
  await bookHomeVisit(request, baseURL!, token, { clinicId: me.clinicId, patientId: patient.id, clinicianId: me.userId, typeId: type.id, minutesFromNow: 25 });
  const visit = await prisma.homeVisit.findFirstOrThrow({ where: { patientId: patient.id }, select: { id: true, appointmentId: true } });
  const dep = await request.post(`${apiBase(baseURL!)}/home-visits/${visit.id}/depart`, { headers: { Authorization: `Bearer ${token}` }, data: { lat: 30.06, lng: 31.32 } });
  expect(dep.ok()).toBe(true);

  await uiLogin(page, SOLO_EMAIL);
  await page.goto("/nurse/safety");
  await expect(page.getByTestId("nurse-safety")).toBeVisible();
  // 123 / 122 are always one tap away
  await expect(page.getByRole("link", { name: /123/ }).first()).toBeVisible();
  const active = page.getByTestId("safety-active");
  await expect(active).toContainText(patient.lastNameEn, { timeout: 30_000 });
  await expect(page.getByTestId("safety-timer")).toHaveAttribute("data-phase", /before|grace|prompt|alert/);
  await page.getByTestId("safety-answer").click();
  await expect(page.getByText("Thanks, check-in recorded.")).toBeVisible();

  // SOS
  await page.getByTestId("safety-sos").click();
  await expect(page.getByTestId("sos-panel")).toContainText("123");
  await expect(page.getByTestId("sos-panel")).toContainText("122");
  expect(await prisma.homeSafetyAlert.count({ where: { visitId: visit.id, kind: "SOS" } })).toBeGreaterThan(0);

  // unsafe abort: needs a reason, ends the visit, never a no-show
  await page.getByTestId("safety-leave").click();
  await expect(page.getByTestId("abort-confirm")).toBeDisabled();
  await page.locator("#abort-cat").selectOption("THREAT_OR_VIOLENCE");
  await page.locator("#abort-reason").fill("Aggressive relative at the door");
  await page.getByTestId("abort-confirm").click();
  await expect(page.getByTestId("abort-done")).toContainText("not a no-show");
  await expect.poll(async () => (await prisma.homeVisit.findUniqueOrThrow({ where: { id: visit.id } })).state, { timeout: 20_000 }).toBe("ABORTED_UNSAFE");
  const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: visit.appointmentId } });
  expect(appt.status).not.toBe("NO_SHOW");
});
