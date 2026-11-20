import { expect, test } from "@playwright/test";
import { AGENCY, apiLogin, bookHomeVisit, clearToday, createPatient, ensureHomeSettings, homeType, prisma, tenantOf, uiLogin, verifyNurse } from "./nurse-fixtures";

/** Q7 — agency dispatch: the dispatcher reassigns a visit; an aide and an unverified nurse are visibly not dispatchable (stop-ship guard). */
test("agency dispatch: assign / reassign verified nurses; aides and unverified staff are blocked", async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  const agency = await tenantOf(AGENCY.owner);
  const nurse1 = await tenantOf(AGENCY.nurse1);
  const nurse2 = await tenantOf(AGENCY.nurse2);
  await verifyNurse(AGENCY.nurse1);
  await verifyNurse(AGENCY.nurse2);
  for (const n of [nurse1, nurse2]) await ensureHomeSettings(agency.tenantId, n.userId);
  const nurse2Row = await prisma.user.findFirstOrThrow({ where: { id: nurse2.userId }, select: { displayName: true } });
  // an unverified nurse (never dispatchable)
  const tag = `${Date.now()}`.slice(-6);
  const unverified = await prisma.user.create({ data: { tenantId: agency.tenantId, email: `e2e.unverified.${tag}@nurse-demo.kiorly.test`, passwordHash: "x", displayName: `E2E Unverified ${tag}`, role: "PHYSICIAN", profession: "NURSE" } });
  await clearToday(agency.tenantId, nurse1.userId);
  await clearToday(agency.tenantId, nurse2.userId);

  const type = await homeType(agency.tenantId);
  const patient = await createPatient(agency.tenantId, "Agency");
  const ownerToken = await apiLogin(request, baseURL!, AGENCY.owner);
  await bookHomeVisit(request, baseURL!, ownerToken, { clinicId: agency.clinicId, patientId: patient.id, clinicianId: nurse1.userId, typeId: type.id, minutesFromNow: 90 });

  await uiLogin(page, AGENCY.dispatcher);
  await page.goto("/"); // Nurse home gate: agency office staff land on dispatch
  await expect(page).toHaveURL(/nurse\/dispatch/, { timeout: 30_000 });
  const row = page.getByTestId("dispatch-visit").filter({ hasText: patient.lastNameEn });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTestId("dispatch-assign").click();
  const dialog = page.getByTestId("assign-dialog");
  await expect(dialog).toBeVisible();
  // the guard is visible: the aide and the unverified nurse are listed as not assignable and are not selectable
  await expect(dialog.getByTestId("assign-blocked")).toContainText("Aya");
  await expect(dialog.getByTestId("assign-blocked")).toContainText("never sent alone");
  await expect(dialog.getByTestId("assign-blocked")).toContainText(`E2E Unverified ${tag}`);
  await expect(dialog.getByTestId("assign-blocked")).toContainText("not verified");
  await expect(dialog.locator("#assign-nurse option", { hasText: `E2E Unverified ${tag}` })).toHaveCount(0);
  await dialog.locator("#assign-nurse").selectOption({ label: nurse2Row.displayName });
  await dialog.getByTestId("assign-confirm").click();
  await expect(page.getByTestId("assign-dialog")).toHaveCount(0);
  await expect(row).toContainText(`Assigned to ${nurse2Row.displayName}`, { timeout: 15_000 });

  // and the server enforces it even if the UI were bypassed
  const visit = await prisma.homeVisit.findFirstOrThrow({ where: { patientId: patient.id }, select: { id: true, clinicianId: true } });
  expect(visit.clinicianId).toBe(nurse2.userId);
  const bypass = await request.post(`${new URL(baseURL!).origin}/api/v1/home-visits/${visit.id}/assign`, { headers: { Authorization: `Bearer ${await apiLogin(request, baseURL!, AGENCY.dispatcher)}` }, data: { clinicianId: unverified.id } });
  expect(bypass.status()).toBeGreaterThanOrEqual(400);
  expect((await prisma.homeVisit.findUniqueOrThrow({ where: { id: visit.id } })).clinicianId).toBe(nurse2.userId);

  // roster tab shows the same guard
  await page.getByRole("tab", { name: "Roster" }).click();
  await expect(page.locator('[data-testid="roster-row"][data-kind="AIDE"]').first()).toHaveAttribute("data-dispatchable", "false");
  await prisma.user.delete({ where: { id: unverified.id } }).catch(() => undefined);
});
