import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PatientAllergyCode, PlanKey } from "@prisma/client";
import { Reflector } from "@nestjs/core";
import { planVisitDates } from "./care-plan-schedule";
import { evaluateAdministration, validatePhotoOrderConfirmation, type OrderForCheck } from "./mar-safety";
import { editionFromHost, navigationFor, resolveEdition, terminologyFor, NURSE_BRAND, canChangeEdition } from "./nurse-edition";
import { NURSE_PLANS, NURSE_SAFETY_IN_EVERY_PLAN } from "./nurse-plans";
import { NURSE_SERVICE_CATALOGUE } from "./nurse-services";
import { BASELINE_VITALS_THRESHOLDS, evaluateVitals, resolveVitalsThresholds, validateVitalsInput } from "./vitals";
import { signFamilyToken, verifyFamilyToken } from "./family-update.service";
import { PLAN_MATRIX } from "../entitlements/plans-matrix";
import { resolveKiorexCommissionRate, type RateRow } from "../kiorex/kiorex-commission-resolver";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { KiorexFlagSnapshotService } from "../feature-flags/kiorex-flag-snapshot.service";
import { REQUIRES_SCOPE_KEY } from "../scope-of-practice/requires-scope.decorator";
import { NurseMarController } from "./nurse-mar.controller";
import { NurseClinicalController } from "./nurse-clinical.controller";
import { CLINIC_FLAG_DEFINITIONS } from "../feature-flags/feature-flag-keys";

const NOW = new Date("2026-11-20T10:00:00Z");
const order = (over: Partial<OrderForCheck> = {}): OrderForCheck => ({
  id: "o1",
  patientId: "p1",
  status: "ACTIVE",
  expiresOn: new Date("2026-11-30"),
  controlled: false,
  lines: [{ medicineName: "Ceftriaxone 1g", dose: "1g", route: "IM", minIntervalMinutes: 480 }, { medicineName: "Paracetamol", dose: "500mg", route: "PO", minIntervalMinutes: 240 }],
  ...over,
});
const entry = (over = {}) => ({ patientId: "p1", medicineName: "Ceftriaxone", dose: "1g", route: "IM", administeredAt: NOW, ...over });
const code = (r: ReturnType<typeof evaluateAdministration>) => (r.ok ? "OK" : r.code);

describe("KNMAR / BR57 MAR safety (never a flag): no order, no administration", () => {
  it("MAR negative path: no order, wrong patient, revoked, expired, medicine not on the order", () => {
    assert.equal(code(evaluateAdministration({ order: null, entry: entry(), allergies: [], recent: [] })), "DOCTOR_ORDER_REQUIRED");
    assert.equal(code(evaluateAdministration({ order: order({ patientId: "other" }), entry: entry(), allergies: [], recent: [] })), "ORDER_PATIENT_MISMATCH");
    assert.equal(code(evaluateAdministration({ order: order({ status: "REVOKED" }), entry: entry(), allergies: [], recent: [] })), "ORDER_REVOKED");
    assert.equal(code(evaluateAdministration({ order: order({ expiresOn: new Date("2026-11-19") }), entry: entry(), allergies: [], recent: [] })), "ORDER_EXPIRED");
    assert.equal(code(evaluateAdministration({ order: order(), entry: entry({ medicineName: "Morphine" }), allergies: [], recent: [] })), "MEDICINE_NOT_IN_ORDER");
  });

  it("an order is valid through the end of its expiry day", () => {
    assert.equal(code(evaluateAdministration({ order: order({ expiresOn: new Date("2026-11-20") }), entry: entry({ administeredAt: new Date("2026-11-20T22:00:00Z") }), allergies: [], recent: [] })), "OK");
  });

  it("allergy and duplicate checks run on every entry", () => {
    const pen = { order: order({ lines: [{ medicineName: "Amoxicillin 500", dose: "500mg", route: "PO" }] }), entry: entry({ medicineName: "Amoxicillin" }) };
    assert.equal(code(evaluateAdministration({ ...pen, allergies: [{ code: PatientAllergyCode.PENICILLIN, otherComment: null }], recent: [] })), "ALLERGY_CONFLICT");
    const dup = evaluateAdministration({ order: order(), entry: entry({ administeredAt: NOW }), allergies: [], recent: [{ medicineName: "Ceftriaxone 1g", administeredAt: new Date(NOW.getTime() - 60 * 60_000), doctorOrderId: "o1" }] });
    assert.equal(code(dup), "DUPLICATE_ADMINISTRATION");
    const later = evaluateAdministration({ order: order(), entry: entry({ administeredAt: NOW }), allergies: [], recent: [{ medicineName: "Ceftriaxone 1g", administeredAt: new Date(NOW.getTime() - 9 * 3600_000), doctorOrderId: "o1" }] });
    assert.equal(code(later), "OK");
  });

  it("controlled medicines need a controlled order and a witness (BR35)", () => {
    const c = order({ controlled: true });
    assert.equal(code(evaluateAdministration({ order: c, entry: entry(), allergies: [], recent: [] })), "CONTROLLED_REQUIRES_WITNESS");
    assert.equal(code(evaluateAdministration({ order: c, entry: entry({ witnessName: "Dr Sami" }), allergies: [], recent: [] })), "OK");
  });

  it("photo orders: the nurse must confirm prescriber, dates and lines (Q10 default)", () => {
    assert.equal(validatePhotoOrderConfirmation({ prescriberName: "Dr A", orderedOn: "2026-11-20", expiresOn: "2026-11-27", lines: [{ medicineName: "X" }] }), null);
    assert.ok(validatePhotoOrderConfirmation({ prescriberName: "", orderedOn: "2026-11-20", expiresOn: "2026-11-27", lines: [{ medicineName: "X" }] }));
    assert.ok(validatePhotoOrderConfirmation({ prescriberName: "Dr A", orderedOn: "2026-11-20", expiresOn: "2026-11-01", lines: [{ medicineName: "X" }] }));
    assert.ok(validatePhotoOrderConfirmation({ prescriberName: "Dr A", orderedOn: "2026-11-20", expiresOn: "2026-11-27", lines: [] }));
  });
});

describe("KNREC02 / KNESC01 vitals", () => {
  it("flags out-of-range values and marks critical ones with escalation guidance (no AI advice)", () => {
    const ok = evaluateVitals({ systolic: 120, diastolic: 80, pulse: 72, spo2: 98, temperatureC: 36.8 });
    assert.deepEqual(ok.flags, {});
    assert.equal(ok.critical, false);
    const bad = evaluateVitals({ systolic: 190, diastolic: 100, spo2: 88, glucoseMgDl: 50 });
    assert.equal(bad.flags.systolic, "CRITICAL_HIGH");
    assert.equal(bad.flags.diastolic, "HIGH");
    assert.equal(bad.flags.spo2, "CRITICAL_LOW");
    assert.equal(bad.critical, true);
    assert.equal(bad.escalation?.required, true);
    assert.deepEqual(bad.escalation?.numbers, { ambulance: "123", police: "122" });
    assert.equal(evaluateVitals({ pulse: 105 }).flags.pulse, "HIGH");
  });
  it("rejects impossible entries; thresholds are a CMO-unsigned placeholder until a market pack carries a signed set", () => {
    assert.ok(validateVitalsInput({}));
    assert.ok(validateVitalsInput({ spo2: 140 }));
    assert.ok(validateVitalsInput({ systolic: 80, diastolic: 90 }));
    assert.equal(validateVitalsInput({ systolic: 120, diastolic: 80 }), null);
    assert.equal(BASELINE_VITALS_THRESHOLDS.cmoSignOff, null);
    const t = resolveVitalsThresholds({ clinicalConfig: { vitalsThresholds: { version: "eg-2027", cmoSignOff: { by: "Dr X", at: "2027-01-01" }, ranges: { pulse: { low: 55, high: 95 } } } } });
    assert.equal(t.version, "eg-2027");
    assert.equal(t.ranges.pulse.high, 95);
    assert.equal(t.ranges.spo2.criticalLow, 90, "unspecified vitals keep the baseline");
  });
});

describe("KNCP01 care plan schedule", () => {
  it("dressing daily x 14 days = 14 dates; 3x per week spreads out", () => {
    const d = planVisitDates([{ appointmentTypeId: "t1", everyDays: 1, durationDays: 14, timeOfDay: "10:00" }], "2026-11-23", "Africa/Cairo");
    assert.equal(d.length, 14);
    assert.equal(d[0]!.date, "2026-11-23");
    assert.equal(d[13]!.date, "2026-12-06");
    const w = planVisitDates([{ appointmentTypeId: "t1", frequencyPerWeek: 3, durationDays: 14, timeOfDay: "10:00" }], "2026-11-23", "Africa/Cairo");
    assert.equal(w.length, 7);
  });
  it("validates inputs and caps the plan size", () => {
    assert.throws(() => planVisitDates([{ appointmentTypeId: "t", durationDays: 0, timeOfDay: "10:00" }], "2026-11-23", "UTC"));
    assert.throws(() => planVisitDates([{ appointmentTypeId: "t", durationDays: 5, timeOfDay: "25:00" }], "2026-11-23", "UTC"));
    assert.throws(() => planVisitDates([{ appointmentTypeId: "t", everyDays: 1, durationDays: 365, timeOfDay: "10:00" }], "2026-11-23", "UTC"), /at most/);
  });
});

describe("edition, host and branding (KNED, ADR-031)", () => {
  it("nurse.kiorly.com means NURSE for signed-out surfaces; a signed-in org's own edition always wins", () => {
    assert.equal(editionFromHost("nurse.kiorly.com"), "NURSE");
    assert.equal(editionFromHost("Nurse.Kiorly.com:443"), "NURSE");
    assert.equal(editionFromHost("nurse.localhost:5174"), "NURSE");
    assert.equal(editionFromHost("app.kiorly.com"), null);
    assert.equal(editionFromHost("evilnurse.kiorly.com.attacker.io"), null);
    assert.equal(resolveEdition({ host: "nurse.kiorly.com" }), "NURSE");
    assert.equal(resolveEdition({ host: "app.kiorly.com" }), "CLINIC");
    assert.equal(resolveEdition({ orgEdition: "CLINIC", host: "nurse.kiorly.com" }), "CLINIC");
    assert.equal(resolveEdition({ orgEdition: "NURSE", host: "app.kiorly.com" }), "NURSE");
  });
  it("Nurse Rose accent, terminology and the seven tabs (+ Team, Dispatch for agencies)", () => {
    assert.equal(NURSE_BRAND.accent, "#E11D48");
    assert.equal(terminologyFor("NURSE", "SOLO").clinic.en, "Practice");
    assert.equal(terminologyFor("NURSE", "AGENCY").clinic.en, "Agency");
    assert.equal(terminologyFor("NURSE", "SOLO").encounter.en, "Visit record");
    assert.equal(terminologyFor("NURSE", "SOLO").doctor.en, "Nurse");
    assert.equal(terminologyFor("CLINIC", null).clinic.en, "Clinic");
    assert.equal(navigationFor("NURSE", "SOLO")!.length, 7);
    assert.deepEqual(navigationFor("NURSE", "AGENCY")!.map((t) => t.id), ["today", "visits", "patients", "care_plans", "payments", "reports", "team", "dispatch", "settings"]);
    assert.equal(navigationFor("CLINIC", null), null);
  });
  it("only the Kiorex super admin may change the edition (KNED04)", () => {
    assert.equal(canChangeEdition({ isPlatformSuperAdmin: true }), true);
    assert.equal(canChangeEdition({ isPlatformSuperAdmin: false }), false);
  });
});

describe("Nurse plans (KX-23 §05): PROPOSED prices flagged NEEDS_HUMAN, safety in every plan", () => {
  it("every plan price is PROPOSED + NEEDS_HUMAN and no billing row is seeded", () => {
    for (const p of NURSE_PLANS) {
      assert.equal(p.priceStatus, "PROPOSED");
      assert.equal(p.needsHuman, "NEEDS_HUMAN");
    }
    assert.equal(NURSE_PLANS.find((p) => p.key === "NURSE_PRO")!.priceMonthlyEgp, 399);
    assert.equal(NURSE_PLANS.find((p) => p.key === "NURSE_AGENCY")!.includedNurses, 10);
    const seed = readFileSync(join(process.cwd(), "prisma", "plan-catalog-seed.ts"), "utf8");
    assert.ok(!/NURSE_/.test(seed), "nurse prices must not become PlanPrice rows");
  });
  it("home-visit safety is in every plan including Nurse Lite (P5)", () => {
    assert.equal(NURSE_SAFETY_IN_EVERY_PLAN, true);
    assert.equal(PLAN_MATRIX[PlanKey.NURSE_LITE].mod_clinical, true);
    assert.equal(PLAN_MATRIX[PlanKey.NURSE_AGENCY].home_dispatch, true);
    assert.equal(PLAN_MATRIX[PlanKey.NURSE_LITE].home_dispatch, false);
    assert.equal(PLAN_MATRIX[PlanKey.NURSE_PRO].nurse_private_duty_shifts, true);
    assert.equal(PLAN_MATRIX[PlanKey.NURSE_LITE].nurse_private_duty_shifts, false);
    assert.equal(PLAN_MATRIX[PlanKey.NURSE_AGENCY].max_clinicians, 10);
  });
  it("the service catalogue is HOME-visit seeds: injection, IV, dressing, catheter, vitals, post-op, elderly, newborn/mother", () => {
    assert.deepEqual(NURSE_SERVICE_CATALOGUE.map((s) => s.code), ["injection", "iv_cannula_infusion", "wound_dressing", "catheter_care", "vitals_monitoring", "post_operative_care", "elderly_care_visit", "newborn_mother_care"]);
    for (const s of NURSE_SERVICE_CATALOGUE) assert.ok(s.nameAr && s.durationMinutes > 0);
  });
});

describe("nurse.* flags are edition-gated (ADR-031)", () => {
  const prisma = (edition: string) => ({
    tenant: { findUnique: async () => ({ id: "t1", edition, whatsAppRemindersEnabled: true, market: { code: "EG", featureFlags: [], featureDefaults: {} }, tenantFeatureFlags: [] }) },
    featureFlag: { findMany: async () => [] },
  });
  const flags = (edition: string) => {
    const snaps = new KiorexFlagSnapshotService(prisma(edition) as never, {} as never);
    snaps.setSnapshotForTests({ product: "kiorly-clinic", version: 1, generatedAt: new Date().toISOString(), flags: CLINIC_FLAG_DEFINITIONS.map((d) => ({ key: d.key, class: d.class, scopes: [...d.scopes], dependsOn: [...d.dependsOn], launchLocked: d.launchLocked, gateSatisfied: true, values: {} })), signature: "x" } as never);
    return new FeatureFlagsService(prisma(edition) as never, { resolve: async () => ({ entitlements: {} }) } as never, snaps);
  };
  it("a CLINIC org never gets nurse.* even with every gate satisfied; a NURSE org does", async () => {
    for (const k of ["nurse.care_plans", "nurse.mar", "nurse.private_duty_shifts"]) {
      assert.equal((await flags("CLINIC").evaluate("t1", k)).effective, false, `${k} for CLINIC`);
      assert.equal((await flags("NURSE").evaluate("t1", k)).effective, true, `${k} for NURSE`);
    }
    assert.equal((await flags("CLINIC").evaluate("t1", "clinic.home_visits")).effective, true, "shared home-visit flag is not edition-gated");
  });
  it("launch-locked nurse keys stay OFF until gate evidence arrives (GKN1 is a human gate, never recorded by code)", async () => {
    const snaps = new KiorexFlagSnapshotService(prisma("NURSE") as never, {} as never);
    snaps.setSnapshotForTests({ product: "kiorly-clinic", version: 1, generatedAt: new Date().toISOString(), flags: [{ key: "nurse.mar", class: "Launch-locked", scopes: ["global", "market", "org"], dependsOn: [], launchLocked: true, gateSatisfied: false, values: {} }], signature: "x" } as never);
    const f = new FeatureFlagsService(prisma("NURSE") as never, { resolve: async () => ({ entitlements: {} }) } as never, snaps);
    assert.deepEqual([(await f.evaluate("t1", "nurse.mar")).effective, (await f.evaluate("t1", "nurse.mar")).source], [false, "gate"]);
  });
});

describe("scope-of-practice contract: nurse controllers", () => {
  const reflector = new Reflector();
  it("every MAR write requires mar.administer and vitals/records require their scopes (assistants cannot administer)", () => {
    const mar = NurseMarController.prototype;
    for (const m of ["photoOrder", "sharedOrder", "revoke", "administer"] as const) {
      assert.equal(reflector.get(REQUIRES_SCOPE_KEY, mar[m]), "mar.administer", m);
    }
    const c = NurseClinicalController.prototype;
    assert.equal(reflector.get(REQUIRES_SCOPE_KEY, c.sign), "encounter.sign");
    assert.equal(reflector.get(REQUIRES_SCOPE_KEY, c.vitals), "vitals.record");
    assert.equal(reflector.get(REQUIRES_SCOPE_KEY, c.record), "encounter.template.nursing");
  });
});

describe("BR55/BR56 commission seam: narrowed rates", () => {
  const base = { marketId: "m", benchmarkFlat: null, benchmarkPercent: null, benchmarkSource: null, benchmarkCheckedAt: null, percent: null, minAmount: null, maxAmount: null, validFrom: new Date("2026-01-01"), validTo: null, feeType: "FLAT", amount: { toString: () => "100" } } as unknown as RateRow;
  const row = (id: string, over: Partial<RateRow>): RateRow => ({ ...base, id, specialty: null, ...over }) as RateRow;
  it("legacy rows (no profession/location) resolve exactly as before", () => {
    assert.equal(resolveKiorexCommissionRate([row("default", {})], null, NOW)?.id, "default");
  });
  it("a home-visit / profession rate applies only to matching bookings, most specific first", () => {
    const rows = [row("default", {}), row("home", { serviceLocation: "HOME" }), row("nurse-home", { profession: "NURSE", serviceLocation: "HOME" }), row("physio", { profession: "PHYSIOTHERAPIST" })];
    assert.equal(resolveKiorexCommissionRate(rows, null, NOW, { profession: "NURSE", serviceLocation: "HOME" })?.id, "nurse-home");
    assert.equal(resolveKiorexCommissionRate(rows, null, NOW, { profession: "PHYSICIAN", serviceLocation: "HOME" })?.id, "home");
    assert.equal(resolveKiorexCommissionRate(rows, null, NOW, { profession: "PHYSIOTHERAPIST", serviceLocation: "IN_CLINIC" })?.id, "physio");
    assert.equal(resolveKiorexCommissionRate(rows, null, NOW, { profession: "PHYSICIAN", serviceLocation: "IN_CLINIC" })?.id, "default");
    assert.equal(resolveKiorexCommissionRate([row("home", { serviceLocation: "HOME" })], null, NOW, { serviceLocation: "IN_CLINIC" }), null);
  });
});

describe("KNFAM01 family update link", () => {
  it("is an expiring HMAC token carrying only the visit record id", () => {
    process.env.FAMILY_UPDATE_LINK_SECRET = "test-secret-family";
    const t = signFamilyToken("rec_1", Date.now() + 60_000);
    assert.equal(verifyFamilyToken(t), "rec_1");
    assert.equal(verifyFamilyToken(t, Date.now() + 120_000), null, "expired");
    assert.equal(verifyFamilyToken(t.slice(0, -2) + "xx"), null, "tampered");
    assert.equal(verifyFamilyToken("garbage"), null);
    assert.ok(!Buffer.from(t.split(".")[0]!, "base64url").toString().includes("patient"));
  });
});
