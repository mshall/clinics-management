import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PlanKey, UserRole } from "@prisma/client";
import { MODULE_ENTITLEMENT_KEYS, ENTITLEMENT_MIN_PLAN, PLAN_MATRIX } from "../entitlements/plans-matrix";
import { PLAN_OF_KEY } from "./mobile-entitlement.service";
import { MOBILE_TEMPLATES } from "./mobile-push.service";
import { isMobileExempt } from "./mobile.interceptor";
import { modulesFor } from "./mobile-roles";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const u = (role: UserRole, extra: Partial<{ isTenantOwner: boolean; additionalRoles: UserRole[] }> = {}) => ({ userId: "u", tenantId: "t", email: "e", role, ...extra });
const on = (role: UserRole, edition = "CLINIC", extra = {}) => modulesFor(u(role, extra), edition).filter((m) => m.enabled).map((m) => m.key);

describe("Kiorly Team: entitlement matrix", () => {
  it("mobile_staff_app is on for PRO and above only", () => {
    assert.ok((MODULE_ENTITLEMENT_KEYS as readonly string[]).includes("mobile_staff_app"));
    assert.equal(ENTITLEMENT_MIN_PLAN.mobile_staff_app, PlanKey.PRO);
    const on = (p: PlanKey) => (PLAN_MATRIX[p] as Record<string, unknown>).mobile_staff_app;
    assert.deepEqual([PlanKey.LITE, PlanKey.NURSE_LITE].map(on), [false, false]);
    assert.deepEqual([PlanKey.PRO, PlanKey.CLINIC, PlanKey.ENTERPRISE, PlanKey.NURSE_PRO, PlanKey.NURSE_AGENCY].map(on), [true, true, true, true, true]);
  });
  it("normalises plan keys onto BASIC / PRO / ENTERPRISE", () => {
    assert.equal(PLAN_OF_KEY.LITE, "BASIC");
    assert.equal(PLAN_OF_KEY.CLINIC, "PRO");
    assert.equal(PLAN_OF_KEY.NURSE_AGENCY, "ENTERPRISE");
    for (const k of Object.values(PlanKey)) assert.ok(PLAN_OF_KEY[k], k);
  });
});

describe("Kiorly Team: modules per role", () => {
  it("physician: clinical modules, no revenue", () => {
    const m = on(UserRole.PHYSICIAN);
    for (const k of ["clinic.schedule", "clinic.patients", "clinic.visits", "clinic.prescriptions", "clinic.labs", "clinic.vitals"]) assert.ok(m.includes(k), k);
    assert.ok(!m.includes("clinic.revenue"));
    assert.ok(!m.includes("clinic.homevisits"));
  });
  it("nurse: vitals + home visits, cannot sign prescriptions, no lab-results review queue", () => {
    const m = on(UserRole.NURSE);
    assert.ok(m.includes("clinic.vitals") && m.includes("clinic.homevisits"));
    assert.ok(!m.includes("clinic.prescriptions") && !m.includes("clinic.visits") && !m.includes("clinic.labs"));
    // nurse-edition nurses carry role PHYSICIAN + profession NURSE: same rule
    assert.ok(!modulesFor({ userId: "u", tenantId: "t", role: UserRole.PHYSICIAN } as never, "NURSE", "NURSE").find((x) => x.key === "clinic.labs")!.enabled);
  });
  it("owner/finance get the revenue snapshot; receptionist does not", () => {
    assert.ok(on(UserRole.GROUP_ADMIN, "CLINIC", { isTenantOwner: true }).includes("clinic.revenue"));
    assert.ok(on(UserRole.FINANCE_OFFICER).includes("clinic.revenue"));
    assert.ok(!on(UserRole.RECEPTIONIST).includes("clinic.revenue"));
    assert.deepEqual(on(UserRole.RECEPTIONIST).sort(), ["clinic.patients", "clinic.schedule"]);
  });
  it("NURSE edition turns home visits on for clinicians", () => {
    assert.ok(on(UserRole.PHYSICIAN, "NURSE").includes("clinic.homevisits"));
    assert.ok(!on(UserRole.PHYSICIAN, "CLINIC").includes("clinic.homevisits"));
  });
  it("nurse/assistant profession never gets visit notes or prescription signing, even with the PHYSICIAN role (Nurse edition)", () => {
    const m = modulesFor(u(UserRole.PHYSICIAN), "NURSE", "NURSE").filter((x) => x.enabled).map((x) => x.key);
    assert.ok(m.includes("clinic.vitals") && m.includes("clinic.homevisits"));
    assert.ok(!m.includes("clinic.prescriptions") && !m.includes("clinic.visits"));
  });
  it("Nurse-edition dispatcher (RECEPTIONIST / CALL_CENTER) gets home visits, still no clinical-record or prescription modules; clinic front desk unchanged", () => {
    for (const r of [UserRole.RECEPTIONIST, UserRole.CALL_CENTER]) {
      assert.deepEqual(on(r, "NURSE").sort(), ["clinic.homevisits", "clinic.patients", "clinic.schedule"]);
      assert.deepEqual(on(r, "CLINIC").sort(), ["clinic.patients", "clinic.schedule"]);
    }
  });
  it("HR officer has no modules", () => assert.deepEqual(on(UserRole.HR_OFFICER), []));
});

describe("Kiorly Team: gating contract", () => {
  it("alerts, bootstrap, auth and remote sign-out stay open on every plan", () => {
    for (const [m, p] of [["GET", "/mobile/bootstrap"], ["GET", "/mobile/alerts"], ["POST", "/mobile/alerts/hv_1/ack"], ["POST", "/mobile/upgrade-request"], ["DELETE", "/mobile/devices/abc"], ["POST", "/auth/refresh"]] as const) assert.ok(isMobileExempt(m, p), `${m} ${p}`);
    for (const [m, p] of [["GET", "/mobile/inbox"], ["GET", "/mobile/upgrade-request"], ["POST", "/mobile/devices"], ["GET", "/mobile/schedule"], ["GET", "/patients"]] as const) assert.ok(!isMobileExempt(m, p), `${m} ${p}`);
  });
  it("alerts service never references the commercial entitlement (ADR-025)", () => {
    const src = readFileSync(join(process.cwd(), "src/mobile/mobile-alerts.service.ts"), "utf8");
    assert.ok(!/mobile_staff_app|MobileEntitlement|FeatureFlags|isEnabled/.test(src));
  });
  it("push templates are bilingual and free of raw clinical values", () => {
    for (const [k, t] of Object.entries(MOBILE_TEMPLATES)) {
      assert.ok(/[؀-ۿ]/.test(t.titleAr) && /[؀-ۿ]/.test(t.bodyAr), `${k} AR`);
      assert.ok(!/mmol|mg\/dl|g\/dl/i.test(t.body + t.title), k);
    }
  });
});

import { isMobilePlanGated } from "./mobile.interceptor";
describe("plan gate classification (MobilePlanGuard + interceptor share it)", () => {
  it("gates /mobile/* and app-identified requests except the exempt routes", () => {
    assert.equal(isMobilePlanGated("GET", "/mobile/summary", undefined), true);
    assert.equal(isMobilePlanGated("GET", "/patients", "kiorly-work/1.2"), true);
    assert.equal(isMobilePlanGated("GET", "/patients", undefined), false);
    assert.equal(isMobilePlanGated("GET", "/mobile/alerts", undefined), false);
    assert.equal(isMobilePlanGated("GET", "/mobile/bootstrap", "kiorly-work/1"), false);
  });
});

import { JwtService } from "@nestjs/jwt";
import { MobilePlanGuard } from "./mobile-plan.guard";
describe("MobilePlanGuard: FEATURE_DISABLED before any controller guard (role/scope/plan 403)", () => {
  const secret = "unit-test-secret-unit-test-secret-1234";
  const tok = new JwtService({ secret }).sign({ sub: "u1", tenantId: "t1" });
  const mkGuard = (enabled: boolean) => new MobilePlanGuard({ getOrThrow: () => secret } as never, { evaluate: async () => ({ enabled, reason: enabled ? null : "PLAN_BELOW_PRO" }) } as never);
  const ctx = (url: string, headers: Record<string, string>, method = "GET") => ({ getType: () => "http", switchToHttp: () => ({ getRequest: () => ({ method, originalUrl: url, headers }) }) }) as never;
  it("a non-entitled org gets FEATURE_DISABLED on /mobile/* and app-flagged routes", async () => {
    for (const [url, h] of [["/api/v1/mobile/prescriptions", {}], ["/api/v1/appointments", { "x-kiorly-client": "kiorly-work/1" }]] as const) {
      await assert.rejects(() => mkGuard(false).canActivate(ctx(url, { authorization: `Bearer ${tok}`, ...h })), (e: { getResponse(): { code: string; key: string } }) => e.getResponse().code === "FEATURE_DISABLED" && e.getResponse().key === "mobile_staff_app");
    }
  });
  it("passes entitled orgs, exempt routes, plain web traffic, and bad/missing tokens (JwtAuthGuard answers 401)", async () => {
    assert.equal(await mkGuard(true).canActivate(ctx("/api/v1/mobile/summary", { authorization: `Bearer ${tok}` })), true);
    assert.equal(await mkGuard(false).canActivate(ctx("/api/v1/mobile/alerts", { authorization: `Bearer ${tok}` })), true);
    assert.equal(await mkGuard(false).canActivate(ctx("/api/v1/patients", { authorization: `Bearer ${tok}` })), true);
    assert.equal(await mkGuard(false).canActivate(ctx("/api/v1/mobile/summary", { authorization: "Bearer garbage" })), true);
    assert.equal(await mkGuard(false).canActivate(ctx("/api/v1/mobile/summary", {})), true);
  });
});
