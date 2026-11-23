import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SRC = join(import.meta.dirname, "..", "..");
const EN = JSON.parse(readFileSync(join(SRC, "locales/en.json"), "utf8")) as Record<string, unknown>;
const AR = JSON.parse(readFileSync(join(SRC, "locales/ar.json"), "utf8")) as Record<string, unknown>;

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function nurseFiles(): string[] {
  const dir = import.meta.dirname;
  return readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")).map((f) => join(dir, f));
}

/** Every static `t("nurse.x")` key used by the Nurse web exists in both languages (AR/EN parity), and every dynamic family is fully covered. */
describe("Kiorly Nurse web i18n", () => {
  const code = nurseFiles().map((f) => readFileSync(f, "utf8")).join("\n") + readFileSync(join(SRC, "components/mobile-bottom-nav.tsx"), "utf8");
  const staticKeys = [...new Set([...code.matchAll(/\bt\(\s*["'`](nurse\.[A-Za-z0-9_.]+)["'`]/g)].map((m) => m[1]!))];

  it("finds the keys it should", () => assert.ok(staticKeys.length > 150));

  it("every static key exists in en.json and ar.json", () => {
    const missing = staticKeys.filter((k) => typeof get(EN, k) !== "string" || typeof get(AR, k) !== "string");
    assert.deepEqual(missing, []);
  });

  it("nav labels, MAR blocks, statuses, vitals and safety families are complete in both languages", () => {
    const families: Record<string, string[]> = {
      "nurse.carePlans.status": ["ACTIVE", "PAUSED", "ENDED"],
      "nurse.carePlans.endReasons": ["COMPLETED", "CANCELLED_BY_PATIENT", "CANCELLED_BY_PROVIDER", "EXPIRED"],
      "nurse.carePlans.done": ["resume", "extend", "end"],
      "nurse.vitals.flags": ["LOW", "HIGH", "CRITICAL_LOW", "CRITICAL_HIGH"],
      "nurse.vitals.keys": ["systolic", "diastolic", "pulse", "temperatureC", "spo2", "respiratoryRate", "glucoseMgDl", "painScore"],
      "nurse.escalation.actions": ["CALLED_DOCTOR", "CALLED_123", "MONITORING", "OTHER"],
      "nurse.safety.categories": ["THREAT_OR_VIOLENCE", "UNSAFE_ENVIRONMENT", "PATIENT_IMPAIRED_OR_AGGRESSIVE", "OTHER"],
      "nurse.safety.alertKind": ["NO_ANSWER", "SOS", "UNSAFE_ABORT"],
      "nurse.inbox.status": ["RECEIVED", "ACCEPTED", "DECLINED"],
      "nurse.shifts.status": ["BOOKED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      "nurse.mar.orderStatus": ["ACTIVE", "EXPIRED", "REVOKED"],
      "nurse.mar.source": ["PHOTO_UPLOAD", "SHARED_KIORLY"],
      "nurse.availability.days": ["0", "1", "2", "3", "4", "5", "6"],
      "nurse.reports.tiles": ["visitsDone", "hours", "revenue", "surcharge", "travel", "planCompletion", "missed", "alerts"],
      "nurse.onboarding.steps": ["profession_verification", "coverage_zones", "services_offered", "prices", "availability", "safety_contact"].flatMap((s) => [`${s}.title`, `${s}.help`]),
      "nurse.visit.tasks": ["injection", "dressing", "vitals", "catheter", "education"],
      "nurse.visit": ["assessment", "intervention", "evaluation", "freeText"],
      "nurse.lab.status": ["HANDED_OFF", "ACCEPTED", "COLLECTED", "IN_LAB", "PARTIALLY_RESULTED", "AWAITING_VALIDATION", "VALIDATED", "RELEASED", "CANCELLED", "REJECTED_BY_LAB"],
      "nurse.lab.block": ["LAB_HANDOFF_NO_CONSENT", "CONSENT_REVOKED", "TWO_IDENTIFIERS_REQUIRED", "IDENTIFIER_MISMATCH", "IDENTIFIER_UNVERIFIABLE", "COLLECTED_IN_FUTURE", "COLLECTED_TIME_INVALID", "HANDOVER_TIME_INVALID", "TEMPERATURE_INVALID", "TUBE_REQUIRED", "TUBE_LABEL_INVALID", "TUBE_LABEL_DUPLICATE", "SPECIMEN_TYPE_REQUIRED", "DOCTOR_ORDER_REQUIRED", "PRESCRIBER_REQUIRED", "ITEM_CODE_REQUIRED", "REJECTED_BY_LAB"].flatMap((c) => [`${c}.title`, `${c}.help`]),
      "nurse.lab.identifierKinds": ["FULL_NAME", "DATE_OF_BIRTH", "PHONE"],
      "nurse.gate": ["nurse_care_plans", "nurse_mar", "nurse_family_updates", "nurse_private_duty_shifts", "clinic_home_dispatch", "clinic_lab_order_handoff", "generic", "title"],
      "nurse.dispatch.blockReason": ["CLINICIAN_NOT_VERIFIED", "AIDE_NEVER_SENT_ALONE", "NOT_A_CLINICIAN", "CLINICIAN_NOT_FOUND"],
      "nurse.mar.block": ["DOCTOR_ORDER_REQUIRED", "ORDER_PATIENT_MISMATCH", "ORDER_REVOKED", "ORDER_EXPIRED", "MEDICINE_NOT_IN_ORDER", "ALLERGY_CONFLICT", "DUPLICATE_ADMINISTRATION", "CONTROLLED_REQUIRES_CONTROLLED_ORDER", "CONTROLLED_REQUIRES_WITNESS"].flatMap((c) => [`${c}.title`, `${c}.help`]),
    };
    const navKeys = [...code.matchAll(/labelKey: "(nurse\.nav\.[A-Za-z]+)"/g)].map((m) => m[1]!);
    assert.ok(navKeys.length >= 10);
    const all = [...navKeys, ...Object.entries(families).flatMap(([base, ks]) => ks.map((k) => `${base}.${k}`))];
    const missing = all.filter((k) => typeof get(EN, k) !== "string" || typeof get(AR, k) !== "string");
    assert.deepEqual(missing, []);
  });

  it("Arabic strings are actually Arabic (no copy of the English text) except identifiers and numbers", () => {
    const en = EN.nurse as Record<string, unknown>;
    const ar = AR.nurse as Record<string, unknown>;
    const same: string[] = [];
    const walk = (a: unknown, b: unknown, path: string) => {
      if (typeof a === "string" && typeof b === "string") {
        if (a === b && /[A-Za-z]{4,}/.test(a.replace(/\{\{[^}]+\}\}/g, ""))) same.push(path);
      } else if (a && typeof a === "object" && b && typeof b === "object") for (const k of Object.keys(a)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    };
    walk(en, ar, "nurse");
    assert.deepEqual(same, []);
  });
});
