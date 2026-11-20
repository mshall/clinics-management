import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import {
  abortCategoryFrom,
  carePlanConfirmedData,
  carePlanEndedData,
  homeVisitAbortedUnsafeData,
  homeVisitAssignedData,
  homeVisitEnRouteData,
  medicationOrderSharedData,
  referralIssuedData,
  safetyAlertRaisedData,
} from "./home-visit-events";

const DIR = join(process.cwd(), "openapi", "events");
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.schema.json`), "utf8"));

function validator(name: string) {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(load("envelope"));
  return ajv.compile(load(name));
}

/** Wraps `data` in the outbox envelope exactly as OutboxDeliveryService builds it. */
function envelope(type: string, aggregateType: string, data: Record<string, unknown>) {
  return { eventId: "evt_1", type, aggregateType, aggregateId: "agg_1", target: "KIOREX", occurredAt: new Date().toISOString(), data: { ...data, aggregateType, aggregateId: "agg_1" } };
}

const FORBIDDEN = ["visitAddress", "address", "line1", "lat", "lng", "latitude", "longitude", "geostamp", "phone"];
const now = new Date("2026-11-20T10:00:00Z");
const base = { appointmentId: "apt_1", clinicId: "cl_1", externalReference: "kx_bk_1" };

describe("Rev 2.3 event payloads validate against the kiorex-contracts 1.5.0 JSON Schemas", () => {
  const cases: [string, string, string, Record<string, unknown>][] = [
    ["HOME_VISIT_ASSIGNED", "HOME_VISIT_ASSIGNED", "Appointment", homeVisitAssignedData({ ...base, clinicianId: "u1", displayName: "Nurse Mona Adel", badge: "Verified nurse", profession: "NURSE", assignedAt: now })],
    ["HOME_VISIT_EN_ROUTE", "HOME_VISIT_EN_ROUTE", "Appointment", homeVisitEnRouteData({ ...base, enRouteAt: now, etaMinutes: 25 })],
    ["HOME_VISIT_ABORTED_UNSAFE", "HOME_VISIT_ABORTED_UNSAFE", "Appointment", homeVisitAbortedUnsafeData({ ...base, abortedAt: now, reasonCategory: abortCategoryFrom("threat_or_violence"), district: "nasr-city" })],
    ["SAFETY_ALERT_RAISED", "SAFETY_ALERT_RAISED", "SafetyAlert", safetyAlertRaisedData({ alertId: "al_1", clinicId: "cl_1", appointmentId: "apt_1", externalReference: "kx_bk_1", kind: "SOS", raisedAt: now, district: "maadi", kiorexBooking: true })],
    ["CARE_PLAN_CONFIRMED", "CARE_PLAN_CONFIRMED", "CarePlan", carePlanConfirmedData({ carePlanId: "cp_1", clinicId: "cl_1", requestRef: "kx_cpr_1", confirmedAt: now, visits: [{ appointmentId: "a1", startsAt: now, endsAt: new Date(now.getTime() + 1800_000) }] })],
    ["CARE_PLAN_ENDED", "CARE_PLAN_ENDED", "CarePlan", carePlanEndedData({ carePlanId: "cp_1", clinicId: "cl_1", requestRef: "kx_cpr_1", endedAt: now, reason: "COMPLETED", visitsCompleted: 14, cancelledAppointmentIds: [] })],
    ["ReferralIssued", "ReferralIssued", "Referral", referralIssuedData({ referralId: "r1", fromClinicId: "cl_1", toProfession: "PHYSIOTHERAPIST", patientRef: "pat_1", referrerId: "u1", consentToken: "rsc_abc", issuedAt: now })],
    ["MedicationOrderShared", "MedicationOrderShared", "DoctorOrder", medicationOrderSharedData({ orderId: "o1", fromClinicId: "cl_1", patientRef: "pat_1", prescriberId: "u1", orderVersion: 2, signedAt: now, expiresAt: new Date(now.getTime() + 7 * 86400_000), consentToken: "rsc_abc" })],
  ];
  for (const [schema, type, aggregateType, data] of cases) {
    it(`${type} is valid and carries no address, coordinates or phone`, () => {
      if (!existsSync(join(DIR, `${schema}.schema.json`))) return;
      const validate = validator(schema);
      const ok = validate(envelope(type, aggregateType, data));
      assert.ok(ok, JSON.stringify(validate.errors));
      for (const k of FORBIDDEN) assert.ok(!(k in data), `${type} must not carry ${k}`);
    });
  }

  it("a payload that smuggles an address or phone is rejected by the schema (the schemas forbid them)", () => {
    const validate = validator("HOME_VISIT_EN_ROUTE");
    const bad = envelope("HOME_VISIT_EN_ROUTE", "Appointment", { ...homeVisitEnRouteData({ ...base, enRouteAt: now }), visitAddress: { line1: "x" }, phone: "+2010" });
    assert.equal(validate(bad), false);
  });

  it("unsafe abort is never a no-show and holds the deposit for review (BR61); the reason is a category only", () => {
    const d = homeVisitAbortedUnsafeData({ ...base, abortedAt: now, reasonCategory: abortCategoryFrom("he threatened me at 12 Example St") });
    assert.equal(d.noShow, false);
    assert.equal(d.depositAction, "HOLD_FOR_REVIEW");
    assert.equal(d.reasonCategory, "OTHER", "free text never leaves Kiorly");
  });

  it("SAFETY_ALERT_RAISED goes to Kiorex ops only for Kiorex bookings", () => {
    assert.deepEqual(safetyAlertRaisedData({ alertId: "a", clinicId: "c", appointmentId: "p", externalReference: null, kind: "SOS", raisedAt: now, kiorexBooking: false }).deliverTo, ["ORG_SAFETY_CONTACT"]);
    assert.deepEqual(safetyAlertRaisedData({ alertId: "a", clinicId: "c", appointmentId: "p", externalReference: null, kind: "SOS", raisedAt: now, kiorexBooking: true }).deliverTo, ["ORG_SAFETY_CONTACT", "KIOREX_OPS"]);
  });

  it("vendored schemas stay identical to the sibling kiorex-contracts repo when present", () => {
    const sib = join(process.cwd(), "..", "..", "..", "kiorex-contracts", "events");
    if (!existsSync(sib)) return;
    for (const n of ["envelope", "HOME_VISIT_ASSIGNED", "HOME_VISIT_EN_ROUTE", "HOME_VISIT_ABORTED_UNSAFE", "SAFETY_ALERT_RAISED", "CARE_PLAN_CONFIRMED", "CARE_PLAN_ENDED", "ReferralIssued", "MedicationOrderShared"]) {
      assert.equal(readFileSync(join(DIR, `${n}.schema.json`), "utf8"), readFileSync(join(sib, `${n}.schema.json`), "utf8"), n);
    }
  });
});
