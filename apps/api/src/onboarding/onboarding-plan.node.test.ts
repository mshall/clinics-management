import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSetupPlan, canPerformStep, skipKey, SETUP_SKIPPED, type SetupClinicSnap, type SetupSnapshot } from "./onboarding-plan";

const clinic = (id: string, over: Partial<SetupClinicSnap> = {}): SetupClinicSnap => ({
  id, nameEn: `Clinic ${id}`, nameAr: `عيادة ${id}`, logoUrl: null, hasInvoiceLogo: false, licenseNumber: "SELF-SERVE-PENDING",
  openingTime: "09:00", closingTime: "00:00", hoursConfirmed: false, appointmentTypesConfigured: false, availabilityConfigured: false, kiorexListingReady: false, kiorexExcludedFromMarketplace: false, ...over,
});
const snap = (over: Partial<SetupSnapshot> = {}): SetupSnapshot => ({
  edition: "CLINIC", nurseKind: null, planKey: "PRO", whatsAppEntitled: true, clinics: [clinic("a")], whatsAppRemindersEnabled: false,
  staffInvited: false, patientCount: 0, appointmentCount: 0, checkedInCount: 0, doctorVerified: false, kiorexConnectStatus: null,
  nurse: { verified: false, zones: false, services: false, prices: false, availability: false, safetyContact: false }, ...over,
});
const owner = { isOwner: true, roles: [] };
const step = (p: ReturnType<typeof buildSetupPlan>, k: string) => p.steps.find((s) => s.key === k)!;

describe("quick setup plan", () => {
  it("a fresh organisation starts at 0% with the first step next", () => {
    const p = buildSetupPlan(snap(), {}, owner);
    assert.equal(p.progressPercent, 0);
    assert.equal(p.nextKey, "clinic_profile");
    assert.ok(p.steps.every((s) => s.manual === false));
    assert.match(step(p, "clinic_profile").href, /^\/clinics\/a\?tab=settings&setup=clinic_profile&entity=a$/);
  });

  it("completion comes from data and moves the next pointer", () => {
    const p = buildSetupPlan(snap({ clinics: [clinic("a", { licenseNumber: "L-1" })] }), {}, owner);
    assert.equal(step(p, "clinic_profile").status, "done");
    assert.equal(p.nextKey, "clinic_logo");
  });

  it("working hours: saved defaults count once confirmed, a changed time counts, untouched does not", () => {
    assert.equal(step(buildSetupPlan(snap(), {}, owner), "working_hours").status, "pending");
    assert.equal(step(buildSetupPlan(snap({ clinics: [clinic("a", { hoursConfirmed: true })] }), {}, owner), "working_hours").status, "done");
    assert.equal(step(buildSetupPlan(snap({ clinics: [clinic("a", { openingTime: "10:00" })] }), {}, owner), "working_hours").status, "done");
  });

  it("multi-entity: per-clinic states, aggregate counts, and a new clinic reopens the step", () => {
    const done = clinic("a", { licenseNumber: "L-1", hoursConfirmed: true });
    const one = buildSetupPlan(snap({ clinics: [done] }), {}, owner);
    assert.equal(step(one, "working_hours").status, "done");
    const two = buildSetupPlan(snap({ clinics: [done, clinic("b", { licenseNumber: "L-2" })] }), {}, owner);
    const hours = step(two, "working_hours");
    assert.equal(hours.status, "pending");
    assert.equal(hours.doneCount, 1);
    assert.equal(hours.totalCount, 2);
    assert.deepEqual(hours.entities!.map((e) => e.status), ["done", "pending"]);
    assert.match(hours.href, /entity=b$/, "deep link targets the first pending clinic");
    assert.equal(step(two, "clinic_profile").status, "done");
    assert.ok(two.progressPercent < one.progressPercent || one.progressPercent === two.progressPercent);
  });

  it("optional steps can be skipped per clinic only; required cannot", () => {
    const two = snap({ clinics: [clinic("a"), clinic("b")] });
    const p = buildSetupPlan(two, { [skipKey("clinic_logo", "a")]: SETUP_SKIPPED }, owner);
    assert.deepEqual(step(p, "clinic_logo").entities!.map((e) => e.status), ["skipped", "pending"]);
    const ignored = buildSetupPlan(two, { [skipKey("working_hours", "a")]: SETUP_SKIPPED }, owner);
    assert.equal(step(ignored, "working_hours").entities![0]!.status, "pending");
    assert.equal(step(buildSetupPlan(snap({ staffInvited: false }), { invite_receptionist: SETUP_SKIPPED }, owner), "invite_receptionist").status, "skipped");
  });

  it("roles: a receptionist cannot do clinic settings and sees who can; the owner always can", () => {
    const rec = { isOwner: false, roles: ["receptionist" as const] };
    const p = buildSetupPlan(snap(), {}, rec);
    assert.equal(step(p, "working_hours").canPerform, false);
    assert.ok(step(p, "working_hours").whoCan.includes("branch_manager"));
    assert.equal(step(p, "first_appointment").canPerform, true);
    assert.equal(canPerformStep({ roles: ["group_admin"] }, owner), true);
  });

  it("plan entitlements: WhatsApp reminders are unavailable on plans without it and excluded from progress", () => {
    const lite = buildSetupPlan(snap({ whatsAppEntitled: false }), {}, owner);
    assert.equal(step(lite, "whatsapp_reminders").available, false);
    const pro = buildSetupPlan(snap({ whatsAppEntitled: true }), {}, owner);
    assert.ok(pro.totalUnits > lite.totalUnits);
  });

  it("Connect to Kiorex is optional, org-level and detected from the connection status", () => {
    const pending = step(buildSetupPlan(snap(), {}, owner), "connect_kiorex");
    assert.equal(pending.required, false);
    assert.equal(pending.href, "/kiorex/connect?setup=connect_kiorex");
    const live = step(buildSetupPlan(snap({ kiorexConnectStatus: "REQUESTED" }), {}, owner), "connect_kiorex");
    assert.equal(live.status, "done");
    assert.equal(live.href, "/kiorex?setup=connect_kiorex");
  });

  it("WhatsApp reminders deep-links to org admin with hash after query params", () => {
    const href = step(buildSetupPlan(snap(), {}, owner), "whatsapp_reminders").href;
    assert.match(href, /^\/admin\?section=organization&setup=whatsapp_reminders#whatsapp-reminders$/);
  });

  it("excluding a branch from Kiorex marketplace counts the clinic profile step done", () => {
    const p = buildSetupPlan(
      snap({ clinics: [clinic("a", { kiorexExcludedFromMarketplace: true })] }),
      {},
      owner,
    );
    assert.equal(step(p, "kiorex_profile").status, "done");
  });

  it("Connect to Kiorex is hidden for roles that are not owner/admin", () => {
    const bm = buildSetupPlan(snap(), {}, { isOwner: false, roles: ["branch_manager"] });
    assert.equal(bm.steps.some((s) => s.key === "connect_kiorex"), false);
    assert.equal(buildSetupPlan(snap(), {}, { isOwner: false, roles: ["clinic_admin"] }).steps.some((s) => s.key === "connect_kiorex"), true);
  });

  it("check-in deep-links to the open appointment when there is one", () => {
    const p = buildSetupPlan(snap({ appointmentCount: 1, checkInAppointmentId: "ap1" }), {}, owner);
    assert.equal(step(p, "first_check_in").href, "/appointments/ap1?setup=first_check_in");
    assert.equal(step(buildSetupPlan(snap(), {}, owner), "first_check_in").href, "/front-desk/board?setup=first_check_in");
  });

  it("Nurse edition: solo has zones and availability, an agency does not; Clinic-only steps are absent", () => {
    const solo = buildSetupPlan(snap({ edition: "NURSE", nurseKind: "SOLO" }), {}, owner).steps.map((s) => s.key);
    const agency = buildSetupPlan(snap({ edition: "NURSE", nurseKind: "AGENCY" }), {}, owner).steps.map((s) => s.key);
    assert.ok(solo.includes("nurse_zones") && solo.includes("nurse_availability"));
    assert.ok(!agency.includes("nurse_zones") && !agency.includes("nurse_availability"));
    assert.ok(agency.includes("nurse_services") && !agency.includes("working_hours"));
  });

  it("all done once every unit is done or skipped", () => {
    const c = clinic("a", { licenseNumber: "L", logoUrl: "x", hoursConfirmed: true, appointmentTypesConfigured: true, availabilityConfigured: true, kiorexListingReady: true });
    const p = buildSetupPlan(
      snap({ clinics: [c], whatsAppRemindersEnabled: true, staffInvited: true, patientCount: 1, appointmentCount: 1, checkedInCount: 1, doctorVerified: true, kiorexConnectStatus: "APPROVED", referralLinkCount: 1 }),
      {}, owner,
    );
    assert.equal(p.allDone, true);
    assert.equal(p.progressPercent, 100);
    assert.equal(p.nextKey, null);
  });

  it("GRW-P1-D1 growth_links: optional, standalone (no Kiorex connection needed), done once a live link exists, opens the Growth workspace", () => {
    const owner = { isOwner: true, roles: [] as never[] };
    const pending = step(buildSetupPlan(snap(), {}, owner), "growth_links");
    assert.equal(pending.status, "pending");
    assert.equal(pending.required, false);
    assert.equal(pending.href, "/kiorex/growth?setup=growth_links");
    assert.equal(step(buildSetupPlan(snap({ referralLinkCount: 2 }), {}, owner), "growth_links").status, "done");
    assert.equal(step(buildSetupPlan(snap({ kiorexConnectStatus: null, referralLinkCount: 1 }), {}, owner), "growth_links").status, "done");
    assert.equal(buildSetupPlan(snap({ edition: "NURSE" }), {}, owner).steps.some((s) => s.key === "growth_links"), false, "Clinic edition only");
  });
});
