import { expect, test } from "@playwright/test";
import { bookAppointmentViaApi } from "./golden-flow-helpers";
import { login } from "./helpers";
import { watchPage } from "./crash-sweep-helpers";

/**
 * Regression: the appointment detail page (check-in panel) threw "Maximum update depth exceeded" because VisitCollectionFields rebuilt its
 * imperative handle every render while the parent stored that handle in state (`ref={setHandle}`). This fails on ANY render-loop or hook error
 * on the main Clinic routes.
 */
const flow = {
  receptionistEmail: "receptionist.hel@drahmedshall.com",
  physicianEmail: "physician.hel@drahmedshall.com",
  adminEmail: "admin@drahmedshall.com",
};

test("no render loop on the main Clinic routes (receptionist, owner)", async ({ page, request }) => {
  test.setTimeout(240_000);
  const booked = await bookAppointmentViaApi(request, flow);
  const watch = watchPage(page);

  await login(page, flow.receptionistEmail);
  for (const path of ["/", "/appointments", `/appointments/${booked.appointmentId}`, "/patients", "/front-desk/board", "/profile"]) {
    await page.goto(path);
    await page.waitForTimeout(1500);
    if (path.startsWith("/appointments/")) await expect(page.getByTestId("quick-check-in-submit")).toBeVisible({ timeout: 20_000 });
  }
  await page.goto("/encounters");
  const newEnc = page.getByRole("button", { name: /new encounter/i });
  if (await newEnc.isVisible().catch(() => false)) {
    await newEnc.click();
    await page.waitForTimeout(1200);
  }

  await login(page, flow.adminEmail);
  for (const path of ["/", "/admin", "/kiorex", "/clinics", "/profile"]) {
    await page.goto(path);
    await page.waitForTimeout(1500);
  }
  expect(watch.findings, JSON.stringify(watch.findings, null, 2)).toEqual([]);
});
