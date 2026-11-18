import { expect, test } from "@playwright/test";
import { assertDoctorRevenueUi, runGoldenFlowViaApi } from "./golden-flow-helpers";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("QA-01 golden flow (EN)", () => {
  test("book → InstaPay check-in → visit → Rx → split pay → cash close → doctor revenue", async ({
    page,
    request,
  }) => {
    const result = await runGoldenFlowViaApi(request, {
      receptionistEmail: "receptionist.hel@drahmedshall.com",
      physicianEmail: "physician.hel@drahmedshall.com",
      adminEmail: "admin@drahmedshall.com",
      financeEmail: "finance@drahmedshall.com",
    });
    expect(result.etaQueueCount).toBe(0);

    await login(page, "receptionist.hel@drahmedshall.com");
    await page.goto(`/appointments/${result.appointmentId}`);
    await expect(
      page.getByText(/completed|checked in|visit flow|WAITING|تم|مكتمل/i).first(),
    ).toBeVisible({ timeout: 60_000 });

    await assertDoctorRevenueUi(page, "physician.hel@drahmedshall.com", result.encounterId);
  });
});

test.describe("QA-01 golden flow — Lite owner-physician", () => {
  test.skip(
    process.env.SEED_PILOT_TENANTS !== "true" && process.env.KIORLY_ENV !== "staging",
    "Set SEED_PILOT_TENANTS=true for Lite pilot E2E",
  );

  test("lite pilot: same clinical + money path", async ({ page, request }) => {
    const result = await runGoldenFlowViaApi(request, {
      receptionistEmail: "sales-lite+reception@pilot.kiorly.com",
      physicianEmail: "sales-lite+physician@pilot.kiorly.com",
      adminEmail: "sales-lite@pilot.kiorly.com",
      checkInInstaPay: true,
    });
    expect(result.encounterId).toBeTruthy();
    await assertDoctorRevenueUi(
      page,
      "sales-lite+physician@pilot.kiorly.com",
      result.encounterId,
      "sales-lite@pilot.kiorly.com",
    );
  });
});

test.describe("QA-01 golden flow — Kiorex booking with deposit", () => {
  test("marketplace-sourced booking with scheduled InstaPay deposit", async ({ request }) => {
    const result = await runGoldenFlowViaApi(request, {
      receptionistEmail: "receptionist.hel@drahmedshall.com",
      physicianEmail: "physician.hel@drahmedshall.com",
      bookingSource: "KIOREX_MARKETPLACE",
      scheduledDeposit: true,
    });
    expect(result.appointmentId).toBeTruthy();
    expect(result.etaQueueCount).toBe(0);
  });
});

test.describe("QA-01 golden flow (Arabic UI)", () => {
  test.use({ locale: "ar-EG" });

  test("AR shell after full API golden path", async ({ page, request }) => {
    await runGoldenFlowViaApi(request, {
      receptionistEmail: "receptionist.hel@drahmedshall.com",
      physicianEmail: "physician.hel@drahmedshall.com",
    });

    await login(page, "physician.hel@drahmedshall.com", "demo");
    await page.goto("/encounters");
    await expect(page.locator("h1")).toContainText(/اللقاءات|encounters/i, { timeout: 60_000 });
  });
});