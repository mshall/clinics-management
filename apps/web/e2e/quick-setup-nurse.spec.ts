import { expect, test } from "@playwright/test";
import { apiSignup, axeClean, bar, checklist, openStep, row, signIn } from "./quick-setup-helpers";

/**
 * Quick setup (Kiorly Nurse edition). Fresh self-serve Nurse organisations (public sign-up with edition NURSE): a SOLO nurse (organization of one) and an
 * AGENCY. The checklist is the same component; the step set differs (solo: coverage zones and own availability, agency: no personal-readiness steps).
 */
test.use({ actionTimeout: 20_000 });

test.describe("Quick setup - Nurse edition", () => {
  test.setTimeout(240_000);

  test("solo nurse: zones and availability open on their screens and flip to done on their own", async ({ page, request }) => {
    const f = await apiSignup(request, { planKey: "NURSE_LITE", edition: "NURSE", nurseKind: "SOLO", label: "Solo Nurse" });
    await signIn(page, f);
    // the Nurse home (Today route) carries a setup card: next step, progress, one button to the full checklist
    await page.goto("/home-visits/today");
    const card = page.getByTestId("nurse-setup-card");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-next", /^(clinic_profile|nurse_verification|nurse_zones)$/);
    const before = Number(await page.getByTestId("nurse-setup-progress").getAttribute("aria-valuenow"));
    await card.getByTestId("nurse-setup-open").click();
    await expect(page).toHaveURL(/\/nurse\/onboarding$/);
    await page.goto("/nurse/onboarding");
    await expect(checklist(page)).toBeVisible();
    for (const k of ["clinic_profile", "nurse_verification", "nurse_zones", "nurse_services", "nurse_prices", "nurse_availability", "nurse_safety_contact", "first_appointment"]) {
      await expect(row(page, k), k).toHaveCount(1);
    }
    for (const k of ["working_hours", "appointment_types", "first_check_in", "doctor_availability"]) await expect(row(page, k), `${k} is Clinic-only`).toHaveCount(0);
    await axeClean(page, "[data-testid=setup-checklist]");

    await openStep(page, "nurse_zones", /\/nurse\/onboarding\?.*setup=nurse_zones/);
    await expect(page.getByTestId("setup-bar-count")).toContainText(/Step \d+ of \d+/);
    await page.getByTestId("zones-editor").getByLabel(/district/i).fill("nasr-city, heliopolis");
    await page.getByTestId("zones-save").click();
    // the checklist sits on the same page as the step, so it flips in place (no navigation, the animation state is short-lived)
    await expect(bar(page)).toHaveAttribute("data-success", "true", { timeout: 20_000 });
    await expect(row(page, "nurse_zones")).toHaveAttribute("data-status", "done");
    // Nurse animation and highlight: the row that flipped carries the animation state, and exactly one pending step is highlighted as next
    await expect(row(page, "nurse_zones")).toHaveAttribute("data-just-done", "true");
    await expect(page.locator('[data-testid="setup-step"][data-next="true"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="setup-step"][data-next="true"]')).toHaveAttribute("data-status", "pending");

    await openStep(page, "nurse_availability", /\/nurse\/onboarding\?.*setup=nurse_availability/);
    await page.getByTestId("availability-editor").getByRole("checkbox").first().check();
    await page.getByTestId("availability-save").click();
    await expect(bar(page)).toHaveAttribute("data-success", "true", { timeout: 20_000 });
    await expect(row(page, "nurse_availability")).toHaveAttribute("data-status", "done");

    // the sign-up seeds the Nurse service catalogue with prices, so services and prices are already done; verification needs the platform review
    await expect(row(page, "nurse_services")).toHaveAttribute("data-status", "done");
    await expect(row(page, "nurse_prices")).toHaveAttribute("data-status", "done");
    await openStep(page, "nurse_verification", /\/profile\/verification/);
    await page.getByTestId("setup-bar-back").click();
    await page.reload();
    await expect(row(page, "nurse_zones")).toHaveAttribute("data-status", "done");
    await expect(row(page, "nurse_availability")).toHaveAttribute("data-status", "done");
    // the home card follows the same server progress: more done than at the start
    await page.goto("/home-visits/today");
    await expect(page.getByTestId("nurse-setup-progress")).toBeVisible();
    expect(Number(await page.getByTestId("nurse-setup-progress").getAttribute("aria-valuenow"))).toBeGreaterThan(before);
  });

  test("agency: no personal-readiness steps; per-agency profile row; safety contact opens the Safety screen", async ({ page, request }) => {
    const f = await apiSignup(request, { planKey: "NURSE_AGENCY", edition: "NURSE", nurseKind: "AGENCY", label: "Care Agency" });
    await signIn(page, f);
    await page.goto("/nurse/dispatch");
    await expect(page.getByTestId("nurse-setup-card")).toBeVisible(); // the agency home (dispatch) carries the same card
    await page.goto("/nurse/onboarding");
    await expect(checklist(page)).toBeVisible();
    for (const k of ["nurse_zones", "nurse_availability"]) await expect(row(page, k), `${k} is solo-only`).toHaveCount(0);
    for (const k of ["clinic_profile", "nurse_services", "nurse_prices", "nurse_safety_contact", "invite_receptionist"]) await expect(row(page, k), k).toHaveCount(1);
    await openStep(page, "nurse_safety_contact", /\/nurse\/safety/);
    await expect(bar(page)).toContainText(/Step \d+ of \d+/);
    await page.getByTestId("setup-bar-back").click();
    await expect(checklist(page)).toBeVisible();
    await axeClean(page, "[data-testid=setup-checklist]");
  });
});
