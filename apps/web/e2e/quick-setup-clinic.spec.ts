import { expect, test } from "@playwright/test";
import { createPatient, prisma } from "./nurse-fixtures";
import {
  API, addClinic, addStaff, apiSignup, axeClean, bar, checklist, expectFlipsToDone, openStep, phoneFor, progressPercent, row, signIn, uiSignup, uniq,
} from "./quick-setup-helpers";

/**
 * Quick setup (Clinic edition). Every test starts from a FRESH self-serve organisation (public signup, never seeded demo data).
 * Per step the journey asserts: the click opens the right screen (deep link, bar "Step n of N", first field focused), completing the action flips the
 * step to done on its own (data-status + data-just-done = the animation state), the next step is highlighted, progress moves, and it persists after reload.
 */
test.use({ actionTimeout: 20_000 });

/** The list starts expanded for the highlighted step and for steps with some clinics done; make the state explicit before asserting on it. */
async function setExpanded(toggle: import("@playwright/test").Locator, expanded: boolean) {
  if (((await toggle.getAttribute("aria-expanded")) === "true") !== expanded) await toggle.click();
}

test.describe("Quick setup - Clinic journey (fresh Pro organisation)", () => {
  test.setTimeout(300_000);

  test("every step opens its screen, detects completion, animates and moves on", async ({ page, request }) => {
    const { email } = await uiSignup(page, "Pro");
    await expect(checklist(page)).toBeVisible();
    expect(await progressPercent(page)).toBe(0);
    await expect(row(page, "clinic_profile")).toHaveAttribute("data-next", "true");
    await axeClean(page, "[data-testid=setup-checklist]");

    // 1 clinic profile: the licence field is focused, saving flips the step
    await openStep(page, "clinic_profile", /\/clinics\/[^/]+\?tab=settings/);
    await expect(page.getByTestId("setup-bar-count")).toContainText(/Step 1 of \d+/);
    await expect(page.locator("#clinic-reg-license")).toBeFocused({ timeout: 15_000 });
    await page.locator("#clinic-reg-license").fill("LIC-QS-1001");
    await page.locator("#clinic-reg-license").locator("xpath=ancestor::*[.//button[normalize-space()='Save']][1]").getByRole("button", { name: "Save" }).click();
    await expectFlipsToDone(page, "clinic_profile", "clinic_logo");
    const afterFirst = await progressPercent(page);
    expect(afterFirst).toBeGreaterThan(0);
    await page.reload();
    await expect(row(page, "clinic_profile")).toHaveAttribute("data-status", "done");
    expect(await progressPercent(page)).toBe(afterFirst);

    // 2 logo (optional): opens the upload card; completes when a logo is uploaded
    await openStep(page, "clinic_logo", /tab=settings/);
    await expect(page.getByTestId("clinic-logo-input")).toBeAttached();
    await page.getByTestId("clinic-logo-input").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
    await expectFlipsToDone(page, "clinic_logo", "working_hours");

    // 3 working hours: keeping the defaults still needs an explicit confirmation
    await openStep(page, "working_hours", /tab=settings/);
    await expect(page.locator("#clinic-opening-time")).toBeFocused({ timeout: 15_000 });
    await page.getByRole("button", { name: "Confirm these hours" }).click();
    await expectFlipsToDone(page, "working_hours", "appointment_types");

    // 4 appointment types: edit a fee
    await openStep(page, "appointment_types", /tab=settings/);
    const typesCard = page.locator('[data-setup-target="appointment_types"]');
    await typesCard.getByRole("button", { name: "Edit" }).first().click();
    await typesCard.locator(".border-dashed input").nth(3).fill("350");
    await typesCard.getByRole("button", { name: "Save" }).click();
    await expectFlipsToDone(page, "appointment_types", "doctor_availability");

    // 5 doctor availability: the dedicated screen for this clinic
    await openStep(page, "doctor_availability", /\/profile\/availability\?.*entity=/);
    await expect(page.getByTestId("availability-editor")).toBeVisible();
    await page.getByTestId("availability-save").click();
    await expectFlipsToDone(page, "doctor_availability", "invite_receptionist");

    // 6 invite a receptionist
    await openStep(page, "invite_receptionist", /\/team/);
    await expect(page.locator("#invite-contact")).toBeFocused({ timeout: 15_000 });
    await page.locator("#invite-contact").fill(`reception.${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expectFlipsToDone(page, "invite_receptionist", "whatsapp_reminders");

    // 7 WhatsApp reminders (Pro plan): the owner switches them on
    await openStep(page, "whatsapp_reminders", /\/admin/);
    const wa = page.locator('[data-setup-target="whatsapp_reminders"]');
    await wa.click();
    await wa.locator("xpath=ancestor::*[.//button[normalize-space()='Save']][1]").getByRole("button", { name: "Save" }).last().click();
    await expectFlipsToDone(page, "whatsapp_reminders", "import_patients");

    // 8 import patients: CSV through the wizard
    await openStep(page, "import_patients", /\/onboarding\/import/);
    await page.getByTestId("import-file").setInputFiles({ name: "patients.csv", mimeType: "text/csv", buffer: Buffer.from(`firstNameEn,lastNameEn,phone,gender\nQs,Patient,${phoneFor(uniq())},F\n`) });
    await page.getByRole("button", { name: /Check file/ }).click();
    await expect(page.getByTestId("import-status")).toHaveText("Ready to import", { timeout: 30_000 });
    await page.getByRole("button", { name: /Import 1 rows/ }).click();
    await expectFlipsToDone(page, "import_patients", "first_appointment");

    // 9 first appointment: the booking wizard opens by itself; the booking is then made against the API (the 3-step wizard has its own tests)
    await openStep(page, "first_appointment", /\/appointments\?.*book=1/);
    await expect(page.getByText(/People & clinic|Step 1/i).first()).toBeVisible({ timeout: 20_000 });
    const tok = await page.evaluate(() => JSON.parse(localStorage.getItem("cms-auth")!).state.accessToken as string);
    const H = { Authorization: `Bearer ${tok}` };
    const me = (await (await request.get(`${API}/auth/me`, { headers: H })).json()) as { id: string };
    const clinics = (await (await request.get(`${API}/clinics`, { headers: H })).json()) as { id: string }[];
    const types = (await (await request.get(`${API}/scheduling/appointment-types?clinicId=${clinics[0]!.id}`, { headers: H })).json()) as { id: string }[];
    const meFull = (await (await request.get(`${API}/auth/me`, { headers: H })).json()) as { tenantId: string };
    const patientId = (await prisma.patient.findFirstOrThrow({ where: { tenantId: meFull.tenantId, isSample: false }, select: { id: true } })).id;
    const start = new Date(Date.now() + 125 * 60_000); start.setSeconds(0, 0); // the type needs 120 min notice
    const booked = await request.post(`${API}/appointments`, { headers: H, data: { clinicId: clinics[0]!.id, patientId, clinicianId: me.id, appointmentTypeId: types[0]!.id, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 1200_000).toISOString() } });
    expect(booked.ok(), await booked.text()).toBeTruthy();
    await expectFlipsToDone(page, "first_appointment", "first_check_in");

    // 10 first check-in, done through the real UI (the appointment page used to crash with "Maximum update depth exceeded"; fixed in VisitCollectionFields).
    //    The deep link goes straight to the earliest open appointment, the receptionist-style panel checks the patient in with cash, the step flips by itself.
    await openStep(page, "first_check_in", /\/appointments\/[^/?]+\?.*setup=first_check_in/);
    await expect(page.getByTestId("quick-check-in-submit")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("collection-method-CASH_ON_VISIT").click();
    const checkIn = page.waitForResponse((r) => r.url().includes("/front-desk/appointments/") && r.url().includes("/check-in") && r.request().method() === "POST");
    await page.getByTestId("quick-check-in-submit").click();
    expect((await checkIn).ok(), "check-in accepted").toBeTruthy();
    await expectFlipsToDone(page, "first_check_in", "doctor_verification");

    // 11-13 the rest open the right screen (their completion needs outside review: doctor verification, Kiorex approval)
    await openStep(page, "doctor_verification", /\/profile\/verification/);
    await page.getByTestId("setup-bar-back").click();
    await openStep(page, "kiorex_profile", /\/clinics\/[^/]+\?tab=settings/);
    await expect(page.locator('[data-setup-target="kiorex_profile"]')).toBeVisible();
    await page.getByTestId("setup-bar-back").click();
    await openStep(page, "connect_kiorex", /\/kiorex\?.*setup=connect_kiorex/);
    await page.getByTestId("setup-bar-skip").click();
    await expect(checklist(page)).toBeVisible();
    // persistence after sign-out / sign-in
    await signIn(page, { email });
    await page.goto("/onboarding");
    for (const k of ["clinic_profile", "clinic_logo", "working_hours", "appointment_types", "doctor_availability", "invite_receptionist", "whatsapp_reminders", "import_patients", "first_appointment", "first_check_in"]) {
      await expect(row(page, k)).toHaveAttribute("data-status", "done");
    }
    expect(await progressPercent(page)).toBeGreaterThanOrEqual(70);
  });
});

test.describe("Quick setup - Clinic multi-entity, roles, plans, locale", () => {
  test.setTimeout(240_000);

  test("two clinics: nested per-clinic rows with their own state and deep link, aggregate progress, collapse/expand, a new clinic reopens the step", async ({ page, request }) => {
    const f = await apiSignup(request, { planKey: "PRO", label: "Nile Care" });
    const second = await addClinic(request, f, "Nile Care Zamalek", { licence: "LIC-Z-1" });
    await signIn(page, f);
    await page.goto("/onboarding");
    const hours = row(page, "working_hours");
    await expect(hours.getByTestId("setup-aggregate")).toHaveText(/0 of 2/);
    await setExpanded(hours.getByTestId("setup-toggle"), true);
    await expect(hours.getByTestId("setup-entity")).toHaveCount(2);
    // clinic profile: the 2nd clinic already has its licence (added with one), the 1st does not
    const profile = row(page, "clinic_profile");
    await expect(profile.getByTestId("setup-aggregate")).toHaveText(/1 of 2/);
    await expect(profile.locator(`[data-entity="${second.id}"]`)).toHaveAttribute("data-status", "done");
    // open the 2nd clinic's hours: the link carries ITS id and the bar names the clinic
    await hours.locator(`[data-entity="${second.id}"]`).getByTestId("setup-entity-cta").click();
    await expect(page).toHaveURL(new RegExp(`/clinics/${second.id}\\?tab=settings.*entity=${second.id}`));
    await expect(bar(page)).toContainText("Nile Care Zamalek");
    await page.getByRole("button", { name: "Confirm these hours" }).click();
    await expect(bar(page)).toHaveAttribute("data-success", "true", { timeout: 25_000 });
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(hours.getByTestId("setup-aggregate")).toHaveText(/1 of 2/);
    await expect(hours).toHaveAttribute("data-status", "pending");
    await expect(hours.locator(`[data-entity="${second.id}"]`)).toHaveAttribute("data-status", "done");
    await expect(hours.locator(`[data-entity="${second.id}"]`)).toHaveAttribute("data-just-done", "true");
    // finish the 1st clinic -> the step is done; a third clinic added later reopens it
    await hours.locator(`[data-entity="${f.clinicId}"]`).getByTestId("setup-entity-cta").click();
    await page.getByRole("button", { name: "Confirm these hours" }).click();
    await expect(bar(page)).toHaveAttribute("data-success", "true", { timeout: 25_000 });
    await expect(row(page, "working_hours")).toHaveAttribute("data-status", "done");
    const third = await addClinic(request, f, "Nile Care Heliopolis");
    await page.reload();
    await expect(row(page, "working_hours")).toHaveAttribute("data-status", "pending");
    await expect(row(page, "working_hours").getByTestId("setup-aggregate")).toHaveText(/2 of 3/);
    await setExpanded(row(page, "working_hours").getByTestId("setup-toggle"), true);
    await expect(row(page, "working_hours").locator(`[data-entity="${third.id}"]`)).toHaveAttribute("data-status", "pending");
    // collapse / expand the list; per-clinic optional step can be skipped for ONE clinic
    await setExpanded(row(page, "clinic_logo").getByTestId("setup-toggle"), true);
    await row(page, "clinic_logo").locator(`[data-entity="${third.id}"]`).getByRole("button", { name: /^Skip/ }).click();
    await expect(row(page, "clinic_logo").locator(`[data-entity="${third.id}"]`)).toHaveAttribute("data-status", "skipped");
    await expect(row(page, "clinic_logo").locator(`[data-entity="${f.clinicId}"]`)).toHaveAttribute("data-status", "pending");
    await setExpanded(hours.getByTestId("setup-toggle"), false);
    await expect(hours.getByTestId("setup-entities")).toBeHidden();
    await axeClean(page, "[data-testid=setup-checklist]");
  });

  test("role-restricted: a branch manager sees who can do owner-only steps (disabled primary, 'Ask the owner'), Connect to Kiorex is hidden, the server refuses too", async ({ page, request }) => {
    const f = await apiSignup(request, { planKey: "PRO" });
    const bm = await addStaff(f.tenantId, "BRANCH_MANAGER", "bm");
    await signIn(page, bm);
    await expect(checklist(page)).toBeVisible();
    await expect(row(page, "whatsapp_reminders").getByTestId("setup-cta-disabled")).toBeDisabled();
    await expect(row(page, "whatsapp_reminders").getByTestId("setup-ask-owner")).toContainText("Ask the owner");
    await expect(row(page, "whatsapp_reminders").getByTestId("setup-ask-owner")).toContainText("Owner / group admin");
    await expect(row(page, "connect_kiorex")).toHaveCount(0);
    await expect(row(page, "clinic_profile").getByTestId("setup-cta")).toBeEnabled();
    const login = await request.post(`${API}/auth/login`, { data: { email: bm.email, password: bm.password } });
    const t = ((await login.json()) as { accessToken: string }).accessToken;
    expect((await request.patch(`${API}/onboarding/steps/whatsapp_reminders`, { headers: { Authorization: `Bearer ${t}` }, data: { action: "skip" } })).status()).toBe(403);
    expect((await request.patch(`${API}/onboarding/steps/first_appointment`, { headers: { Authorization: `Bearer ${f.accessToken}` }, data: { action: "complete" } })).status()).toBe(400);
  });

  test("Lite plan: WhatsApp reminders is marked as an upgrade (no dead click) and is left out of the progress", async ({ page, request }) => {
    const f = await apiSignup(request, { planKey: "LITE" });
    await signIn(page, f);
    await page.goto("/onboarding");
    const wa = row(page, "whatsapp_reminders");
    await expect(wa.getByTestId("setup-upgrade")).toBeVisible();
    await expect(wa.getByTestId("setup-cta")).toHaveCount(0);
    await expect(wa).toHaveAttribute("data-available", "false");
    const label = await page.getByTestId("setup-progress-label").innerText();
    expect(label).toMatch(/of 12 done|of 11 done|of 10 done/); // 13 units on Pro, minus the unavailable one
  });

  test("completion state: celebration, dismissal remembered per organisation, reopens when a new clinic is added", async ({ page, request }) => {
    const f = await apiSignup(request, { planKey: "PRO" });
    // every step satisfied through real data (steps that need outside review are set in the database: verification, Kiorex request)
    const H = { Authorization: `Bearer ${f.accessToken}` };
    await request.patch(`${API}/clinics/${f.clinicId}`, { headers: H, data: { licenseNumber: "LIC-ALL-1", openingTime: "08:00", closingTime: "20:00", logoUrl: "https://example.com/logo.png" } });
    // platform review is outside the product UI: the doctor is marked verified in the database (needed before a type can be bookable on Kiorex)
    await prisma.clinicianVerification.upsert({ where: { userId: f.userId }, create: { tenantId: f.tenantId, userId: f.userId, status: "VERIFIED" }, update: { status: "VERIFIED" } });
    const types = (await (await request.get(`${API}/scheduling/appointment-types?clinicId=${f.clinicId}`, { headers: H })).json()) as { id: string; nameEn: string; durationMinutes: number; feeAmount: string }[];
    await new Promise((r) => setTimeout(r, 2500)); // "edited" means after the 2 s the sign-up seed needs; a person always takes longer
    expect((await request.post(`${API}/scheduling/appointment-types`, { headers: H, data: { id: types[0]!.id, clinicId: f.clinicId, nameEn: types[0]!.nameEn, durationMinutes: types[0]!.durationMinutes, feeAmount: 400, marketplaceBookable: true } })).ok()).toBeTruthy();
    const wk = (await (await request.get(`${API}/scheduling/availability?clinicId=${f.clinicId}&clinicianId=${f.userId}`, { headers: H })).json()) as { weekJson: unknown };
    await new Promise((r) => setTimeout(r, 2500));
    await request.put(`${API}/scheduling/availability`, { headers: H, data: { clinicId: f.clinicId, clinicianId: f.userId, weekJson: wk.weekJson } });
    await request.patch(`${API}/admin/tenant-settings`, { headers: H, data: { whatsAppRemindersEnabled: true, appointmentReminderHoursBefore: 24 } });
    await request.post(`${API}/invitations`, { headers: H, data: { phoneOrEmail: `inv.${uniq()}@example.com`, roles: ["RECEPTIONIST"] } });
    const pid = (await createPatient(f.tenantId, "Done")).id;
    const start = new Date(Date.now() + 3 * 3600_000); start.setMinutes(0, 0, 0);
    const ap = await request.post(`${API}/appointments`, { headers: H, data: { clinicId: f.clinicId, patientId: pid, clinicianId: f.userId, appointmentTypeId: types[0]!.id, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 1200_000).toISOString() } });
    const apId = ((await ap.json()) as { id: string }).id;
    await prisma.appointment.update({ where: { id: apId }, data: { status: "CHECKED_IN" } });
    await prisma.tenant.update({ where: { id: f.tenantId }, data: { providerSettings: { kiorexConnect: { status: "APPROVED" } } } });
    const plan = (await (await request.get(`${API}/onboarding`, { headers: H })).json()) as { steps: { key: string; status: string; available: boolean }[] };
    expect(plan.steps.filter((x) => x.available && x.status === "pending").map((x) => x.key), "steps still pending after the data setup").toEqual([]);
    await signIn(page, f);
    await page.goto("/onboarding");
    await expect(checklist(page)).toHaveAttribute("data-all-done", "true", { timeout: 30_000 });
    await expect(page.getByTestId("setup-complete")).toBeVisible();
    await page.goto("/");
    await expect(page.getByTestId("setup-complete")).toBeVisible();
    await page.getByTestId("setup-dismiss").click();
    await expect(checklist(page)).toHaveCount(0);
    await page.reload();
    await expect(checklist(page)).toHaveCount(0); // remembered server-side for the organisation
    await addClinic(request, f, "Late Clinic");
    await page.reload();
    await expect(checklist(page)).toBeVisible(); // new entity reopens its per-clinic steps
    await expect(checklist(page)).toHaveAttribute("data-all-done", "false");
  });

  test("Arabic RTL, dark theme, responsive 360-2560, no layout shift, keyboard and axe", async ({ browser, request }) => {
    const f = await apiSignup(request, { planKey: "PRO" });
    const ctx = await browser.newContext({ locale: "ar-EG", colorScheme: "dark", viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: "cms_locale", value: "ar", url: "http://localhost:5174" }]);
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { sessionStorage.setItem("cms-theme-session", "default-dark"); } catch { /* ignore */ } });
    await signIn(page, f);
    await page.goto("/onboarding");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(checklist(page)).toBeVisible();
    await expect(checklist(page)).toContainText("الإعداد السريع");
    for (const w of [360, 768, 1440, 2560]) {
      await page.setViewportSize({ width: w, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `no horizontal scroll at ${w}`).toBe(true);
    }
    // no layout shift: the checklist box does not move once it has rendered
    const box1 = await checklist(page).boundingBox();
    await page.waitForTimeout(1500);
    const box2 = await checklist(page).boundingBox();
    expect(Math.abs(box2!.y - box1!.y)).toBeLessThan(2);
    expect(Math.abs(box2!.height - box1!.height)).toBeLessThan(2);
    await axeClean(page, "[data-testid=setup-checklist]");
    // keyboard: Enter on the highlighted step's button opens its screen, and the bar is announced as a status region
    const cta = row(page, "clinic_profile").getByTestId("setup-cta");
    await cta.focus();
    await expect(cta).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(bar(page)).toBeVisible();
    await expect(bar(page).locator("[role=status]")).toBeVisible();
    await axeClean(page, "[data-testid=setup-bar]");
    await ctx.close();
  });
});
