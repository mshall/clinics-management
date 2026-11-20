import { test, expect } from "@playwright/test";

const DEV_OTP = process.env.SIGNUP_OTP_DEV_CODE || "424242";

test.describe("ON-01 signup (Arabic)", () => {
  test.use({ locale: "ar-EG" });

  test("self-serve signup reaches onboarding", async ({ page }) => {
    const unique = Date.now();
    const email = `signup.e2e.${unique}@example.com`;

    await page.goto("/signup?ref=e2e&refCode=demo");
    await page.getByLabel(/رقم الجوال|Mobile/i).fill(`0100${String(unique).slice(-7)}`);
    await page.getByRole("button", { name: /إرسال رمز|Send verification/i }).click();

    await page.getByLabel(/رمز التحقق|Verification/i).fill(DEV_OTP);
    await page.getByRole("button", { name: /تحقق|Verify/i }).click();

    await page.getByLabel(/اسمك|Your name/i).fill("د. اختبار كيورلي");
    await page.getByLabel(/البريد|Work email/i).fill(email);
    await page.locator("#password").fill("demopass8");
    await page.getByRole("button", { name: /متابعة|Continue/i }).click();

    await page.getByLabel(/اسم العيادة|Clinic name/i).fill(`عيادة اختبار ${unique}`);
    await page.getByLabel(/المدينة|City/i).fill("القاهرة");
    await page.getByRole("button", { name: /متابعة|Continue/i }).click();

    await page.getByRole("button", { name: /لايت|Lite/i }).click();
    // Accepting the required legal documents is mandatory before the clinic can be created (legal gate).
    for (const box of await page.locator('input[id^="legal-"]').all()) await box.check();
    const complete = page.waitForResponse(
      (r) => r.url().includes("/api/v1/public/signup/complete") && r.request().method() === "POST",
      { timeout: 120_000 },
    );
    await page.getByRole("button", { name: /إنشاء العيادة|Create clinic/i }).click();
    const res = await complete;
    expect(res.ok()).toBeTruthy();

    await page.waitForURL((u) => u.pathname.includes("onboarding"), { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: /مرحباً|Welcome/i }).first()).toBeVisible();
  });
});