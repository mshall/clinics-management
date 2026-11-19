import { expect, test, type Page } from "@playwright/test";
import { bookAppointmentViaApi } from "./golden-flow-helpers";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

const receptionistEmail = "receptionist.hel@drahmedshall.com";
const flowOpts = {
  receptionistEmail,
  physicianEmail: "physician.hel@drahmedshall.com",
  adminEmail: "admin@drahmedshall.com",
};

/** Counts pointer taps the receptionist makes (typing is not a tap). */
async function tap(page: Page, counter: { n: number }, target: Parameters<Page["locator"]>[0] | ReturnType<Page["getByTestId"]>) {
  counter.n += 1;
  const loc = typeof target === "string" ? page.locator(target) : target;
  await loc.click();
}

for (const device of [
  { name: "10-inch tablet", viewport: { width: 800, height: 1280 } },
  { name: "phone", viewport: { width: 390, height: 844 } },
]) {
  test(`FS-02 InstaPay check-in on a ${device.name}: ≤4 taps and under 30 s`, async ({ page, request }) => {
    test.setTimeout(120_000);
    const booked = await bookAppointmentViaApi(request, flowOpts);
    await page.setViewportSize(device.viewport);
    await login(page, receptionistEmail);

    const taps = { n: 0 };
    const started = Date.now();
    taps.n += 1; // opening the appointment from the list / board
    await page.goto(`/appointments/${booked.appointmentId}`);
    await expect(page.getByTestId("quick-check-in-submit")).toBeVisible({ timeout: 20_000 });

    await tap(page, taps, page.getByTestId("collection-method-INSTAPAY"));
    const ref = page.getByTestId("transfer-reference-input");
    await expect(ref, "reference field is focused without an extra tap").toBeFocused();
    await page.keyboard.type(`FS02${Date.now().toString().slice(-8)}`);

    const res = page.waitForResponse((r) => r.url().includes(`/front-desk/appointments/${booked.appointmentId}/check-in`));
    await tap(page, taps, page.getByTestId("quick-check-in-submit"));
    expect((await res).ok(), "check-in accepted").toBeTruthy();
    await expect(page.getByTestId("checked-in-ticket")).toBeVisible({ timeout: 15_000 });
    const elapsed = Date.now() - started;

    expect(taps.n, "taps per check-in").toBeLessThanOrEqual(4);
    expect(elapsed, `check-in took ${elapsed} ms`).toBeLessThan(30_000);
  });
}

test("FS-02 a bad transaction ID is flagged on the field, before anything is sent", async ({ page, request }) => {
  test.setTimeout(120_000);
  const booked = await bookAppointmentViaApi(request, flowOpts);
  await page.setViewportSize({ width: 800, height: 1280 });
  await login(page, receptionistEmail);
  await page.goto(`/appointments/${booked.appointmentId}`);
  await page.getByTestId("collection-method-INSTAPAY").click();

  let sent = false;
  page.on("request", (r) => {
    if (r.url().includes("/check-in") && r.method() === "POST") sent = true;
  });
  await page.keyboard.type("ab");
  await page.keyboard.press("Enter");
  const err = page.getByTestId("transfer-reference-error");
  await expect(err).toBeVisible();
  await expect(page.getByTestId("transfer-reference-input")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("transfer-reference-input")).toBeFocused();
  expect(sent, "invalid reference is not submitted").toBe(false);

  await page.keyboard.type("c12345");
  await expect(err).toHaveCount(0);
});

test("FS-02 desktop receptionist checks in with the keyboard only", async ({ page, request }) => {
  test.setTimeout(120_000);
  const booked = await bookAppointmentViaApi(request, flowOpts);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, receptionistEmail);
  await page.goto(`/appointments/${booked.appointmentId}`);
  await expect(page.getByTestId("quick-check-in-submit")).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press("Alt+2");
  await expect(page.getByTestId("collection-method-INSTAPAY")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("transfer-reference-input")).toBeFocused();
  await page.keyboard.type(`FS02K${Date.now().toString().slice(-8)}`);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("checked-in-ticket")).toBeVisible({ timeout: 15_000 });
});
