import { expect, test } from "@playwright/test";
import { bookAppointmentViaApi } from "./golden-flow-helpers";
import { login } from "./helpers";

const receptionistEmail = "receptionist.hel@drahmedshall.com";

test("FS-04 send a deposit link, open the pay page, mark it paid", async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  const booked = await bookAppointmentViaApi(request, {
    receptionistEmail,
    physicianEmail: "physician.hel@drahmedshall.com",
  });

  await login(page, receptionistEmail);
  await page.goto(`/appointments/${booked.appointmentId}`);
  const ask = page.getByTestId("deposit-ask-optional").or(page.getByTestId("deposit-send-link"));
  await expect(ask.first()).toBeVisible({ timeout: 20_000 });
  await ask.first().click();
  await page.getByLabel(/Deposit amount/).fill("40");
  await page.getByRole("dialog").getByRole("button", { name: "Send link" }).click();

  const created = page.getByTestId("deposit-link-created");
  await expect(created).toBeVisible();
  const url = (await created.locator("code").textContent())!.trim();
  expect(url).toContain("/pay/");
  await expect(page.getByTestId("deposit-badge")).toHaveAttribute("data-status", "PENDING");

  const patientPage = await browser.newPage();
  await patientPage.goto(new URL(url).pathname);
  await expect(patientPage.getByTestId("deposit-pay-page")).toHaveAttribute("data-status", "PENDING", { timeout: 20_000 });
  await expect(patientPage.getByTestId("deposit-pay-amount")).toContainText("40");
  await patientPage.close();

  await page.getByTestId("deposit-mark-paid").click();
  await page.getByLabel("Transaction reference").fill("IPN-E2E-0001");
  await page.getByRole("button", { name: "Confirm payment" }).click();
  await expect(page.getByTestId("deposit-badge")).toHaveAttribute("data-status", "HELD", { timeout: 20_000 });
});
