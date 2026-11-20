import { test, expect } from "@playwright/test";

const DEV_OTP = process.env.SIGNUP_OTP_DEV_CODE;

test.describe("ON-07 field-sales rep console", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("rep signs a clinic that stays awaiting the owner until the OTP is confirmed", async ({ page }) => {
    const unique = Date.now();
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("rep@kiorly.com");
    await page.getByLabel(/password/i).fill("demo");
    await page.getByRole("button", { name: /^(sign in|log in)$/i }).click();
    await page.waitForURL((u) => u.pathname === "/rep", { timeout: 30_000 });
    await expect(page.getByTestId("rep-code")).toHaveText("REP-DEMO");

    await page.getByLabel("Clinic name").fill(`Rep E2E ${unique}`);
    await page.getByLabel(/City/i).fill("Cairo");
    await page.getByLabel("Owner full name").fill("Dr Rep E2E");
    await page.getByLabel("Owner email").fill(`rep.e2e.${unique}@example.com`);
    await page.getByLabel(/Owner mobile/i).fill(`0101${String(unique).slice(-7)}`);
    const created = page.waitForResponse((r) => r.url().includes("/api/v1/rep/tenants") && r.request().method() === "POST");
    await page.getByTestId("rep-create").click();
    expect((await created).status()).toBe(201);

    const clinic = page.getByTestId("rep-clinic").filter({ hasText: `Rep E2E ${unique}` });
    await expect(clinic.getByTestId("rep-clinic-status")).toHaveText("Awaiting owner code");

    for (const box of await clinic.getByRole("checkbox").all()) await box.check();
    await clinic.getByTestId("rep-otp").fill("000000");
    const wrong = page.waitForResponse((r) => r.url().includes("/confirm"));
    await clinic.getByTestId("rep-confirm-submit").click();
    expect((await wrong).status()).toBe(400);
    await expect(clinic.getByTestId("rep-clinic-status")).toHaveText("Awaiting owner code");

    test.skip(!DEV_OTP, "SIGNUP_OTP_DEV_CODE not set — owner confirmation covered by on07 integration test");
    await clinic.getByTestId("rep-otp").fill(DEV_OTP!);
    await clinic.getByTestId("rep-confirm-submit").click();
    await expect(clinic.getByTestId("rep-clinic-status")).toHaveText("Confirmed");
  });
});
