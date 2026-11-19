import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders, bookAppointmentViaApi } from "./golden-flow-helpers";
import { login } from "./helpers";

const receptionistEmail = "receptionist.hel@drahmedshall.com";

test("FS-05 upcoming appointment shows a no-show risk chip labelled rule-based", async ({ page, request }) => {
  test.setTimeout(120_000);
  const booked = await bookAppointmentViaApi(request, {
    receptionistEmail,
    physicianEmail: "physician.hel@drahmedshall.com",
  });
  const rh = authHeaders((await apiLogin(request, receptionistEmail)).accessToken);
  const dto = (await (await request.get(`${API_BASE}/appointments/${booked.appointmentId}`, { headers: rh })).json()) as {
    noShowRisk: { method: string; band: string } | null;
  };
  expect(dto.noShowRisk, "Pro demo tenant gets a risk estimate").toBeTruthy();
  expect(dto.noShowRisk!.method).toBe("RULE_BASED");

  await login(page, receptionistEmail);
  await page.goto(`/appointments/${booked.appointmentId}`);
  const chip = page.getByTestId("no-show-risk-chip").first();
  await expect(chip).toBeVisible({ timeout: 20_000 });
  await expect(chip).toHaveAttribute("data-band", dto.noShowRisk!.band);
  await expect(chip).toContainText(/rule-based/i);

  await chip.hover();
  await expect(page.getByTestId("no-show-risk-tooltip").first()).toContainText(/not a trained prediction model/i);
});
