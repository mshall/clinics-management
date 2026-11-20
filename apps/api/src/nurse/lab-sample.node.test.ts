import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { labOrderPlacedNurseData } from "./lab-sample-events";
import { LabSampleRuleError, checkTemperature, checkTubes, parseCollectedAt, parseHandedOverAt, verifyIdentifiers, type PatientForCheck } from "./lab-sample-safety";

const patient: PatientForCheck = { mrn: "MRN-7", firstNameEn: "Amira", lastNameEn: "Samy", firstNameAr: "أميرة", lastNameAr: "سامي", dob: new Date("1990-04-12T00:00:00Z"), phone: "+201000000001" };
const code = (fn: () => unknown) => {
  try {
    fn();
    return "OK";
  } catch (e) {
    return e instanceof LabSampleRuleError ? e.code : "OTHER";
  }
};

describe("KNLAB01 collection safety checks (pure, never flagged)", () => {
  it("needs at least two DISTINCT identifier kinds that match the record", () => {
    assert.deepEqual(verifyIdentifiers(patient, [{ kind: "full_name", value: " amira  SAMY " }, { kind: "DATE_OF_BIRTH", value: "1990-04-12" }]), ["FULL_NAME", "DATE_OF_BIRTH"]);
    assert.deepEqual(verifyIdentifiers(patient, [{ kind: "FULL_NAME", value: "أميرة سامي" }, { kind: "PHONE", value: "01000000001" }]), ["FULL_NAME", "PHONE"]);
    assert.equal(code(() => verifyIdentifiers(patient, [{ kind: "FULL_NAME", value: "Amira Samy" }])), "TWO_IDENTIFIERS_REQUIRED");
    assert.equal(code(() => verifyIdentifiers(patient, [{ kind: "FULL_NAME", value: "Amira Samy" }, { kind: "FULL_NAME", value: "Amira Samy" }])), "TWO_IDENTIFIERS_REQUIRED");
    assert.equal(code(() => verifyIdentifiers(patient, [{ kind: "FULL_NAME", value: "Amira Samy" }, { kind: "SHOE_SIZE", value: "41" }])), "TWO_IDENTIFIERS_REQUIRED");
    assert.equal(code(() => verifyIdentifiers(patient, undefined)), "TWO_IDENTIFIERS_REQUIRED");
  });
  it("a mismatch refuses and names only the KIND, never a value", () => {
    assert.equal(code(() => verifyIdentifiers(patient, [{ kind: "FULL_NAME", value: "Amira Samy" }, { kind: "DATE_OF_BIRTH", value: "1991-04-12" }])), "IDENTIFIER_MISMATCH");
    assert.equal(code(() => verifyIdentifiers(patient, [{ kind: "FULL_NAME", value: "Amira Samy" }, { kind: "PHONE", value: "01099999999" }])), "IDENTIFIER_MISMATCH");
    try {
      verifyIdentifiers(patient, [{ kind: "FULL_NAME", value: "Someone Else" }, { kind: "MRN", value: "MRN-7" }]);
    } catch (e) {
      assert.equal((e as LabSampleRuleError).kind, "FULL_NAME");
      assert.ok(!(e as Error).message.includes("Someone"));
    }
    assert.equal(code(() => verifyIdentifiers({ ...patient, dob: null }, [{ kind: "FULL_NAME", value: "Amira Samy" }, { kind: "DATE_OF_BIRTH", value: "1990-04-12" }])), "IDENTIFIER_UNVERIFIABLE");
  });
  it("refuses a future collection time (with a small clock-skew tolerance) and a hand-over outside collection..now", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    assert.equal(parseCollectedAt(undefined, now).getTime(), now.getTime());
    assert.equal(code(() => parseCollectedAt("2026-11-20T10:30:00Z", now)), "COLLECTED_IN_FUTURE");
    assert.equal(code(() => parseCollectedAt("2026-11-20T10:00:30Z", now)), "OK");
    assert.equal(code(() => parseCollectedAt("not-a-date", now)), "COLLECTED_TIME_INVALID");
    const c = new Date("2026-11-20T09:30:00Z");
    assert.equal(parseHandedOverAt(undefined, c, now), null);
    assert.equal(code(() => parseHandedOverAt("2026-11-20T09:00:00Z", c, now)), "HANDOVER_TIME_INVALID");
    assert.equal(code(() => parseHandedOverAt("2026-11-20T11:00:00Z", c, now)), "HANDOVER_TIME_INVALID");
    assert.ok(parseHandedOverAt("2026-11-20T09:45:00Z", c, now));
  });
  it("tube labels follow the contract pattern and are unique; temperature is bounded", () => {
    assert.equal(code(() => checkTubes([])), "TUBE_REQUIRED");
    assert.equal(code(() => checkTubes([{ label: "A B C", specimenType: "BLOOD" }])), "TUBE_LABEL_INVALID");
    assert.equal(code(() => checkTubes([{ label: "ab", specimenType: "BLOOD" }])), "TUBE_LABEL_INVALID");
    assert.equal(code(() => checkTubes([{ label: "NRS-1", specimenType: "BLOOD" }, { label: "nrs-1", specimenType: "BLOOD" }])), "TUBE_LABEL_DUPLICATE");
    assert.equal(code(() => checkTubes([{ label: "NRS-1", specimenType: "" }])), "SPECIMEN_TYPE_REQUIRED");
    assert.deepEqual(checkTubes([{ label: " NRS-1 ", specimenType: "BLOOD", container: " EDTA " }]), [{ label: "NRS-1", specimenType: "BLOOD", container: "EDTA" }]);
    assert.equal(checkTemperature(undefined), null);
    assert.equal(checkTemperature(4.26), 4.3);
    assert.equal(code(() => checkTemperature(80)), "TEMPERATURE_INVALID");
  });
  it("ADR-025: the safety checks and the event builder never reference feature flags", () => {
    for (const f of ["lab-sample-safety.ts", "lab-sample-events.ts"]) {
      const src = readFileSync(join(__dirname, f), "utf8");
      assert.ok(!/feature-flags|requireFeature|RequiresFeature|isEnabled/.test(src), `${f} must stay flag-free`);
    }
  });
});

describe("Nurse LabOrderPlaced validates against the kiorex-contracts 1.6.0 schema (vendored)", () => {
  const dir = join(process.cwd(), "openapi", "events");
  const load = (n: string) => JSON.parse(readFileSync(join(dir, `${n}.schema.json`), "utf8"));
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(load("envelope"));
  const validate = ajv.compile(load("LabOrderPlaced"));
  const data = labOrderPlacedNurseData({
    orderId: "ord_1", clinicId: "cl_1", patientRef: "pat_1", orderingClinicianId: "u1", consentToken: "rsc_abcdefabcdefabcd", orderedAt: new Date("2026-11-20T09:00:00Z"),
    items: [{ code: "CBC", nameEn: "Complete blood count" }], prescriberName: "Dr Hesham", identifiersChecked: ["FULL_NAME", "DATE_OF_BIRTH"],
    patient: { fullName: "Amira Samy", dateOfBirth: new Date("1990-04-12T00:00:00Z"), sex: "F", phone: "+201000000001" }, visitRef: "apt_1", collectorRef: "u1", collectorName: "Nurse Mona",
    collectedAt: new Date("2026-11-20T09:30:00Z"), handedOverAt: new Date("2026-11-20T09:45:00Z"), temperatureC: 5, samples: [{ label: "NRS-0001-A", specimenType: "BLOOD", container: "EDTA" }],
  });
  const env = (d: Record<string, unknown>) => ({ eventId: "e1", type: "LabOrderPlaced", aggregateType: "LabOrder", aggregateId: "ord_1", target: "KIOREX", occurredAt: new Date().toISOString(), data: { ...d, aggregateType: "LabOrder", aggregateId: "ord_1" } });
  it("is valid and carries no national id, address or clinical notes", () => {
    assert.ok(validate(env(data)), JSON.stringify(validate.errors));
    const text = JSON.stringify(data);
    for (const k of ["nationalId", "address", "notes", "lat", "lng"]) assert.ok(!text.includes(`"${k}"`), k);
    assert.equal(data.originEdition, "NURSE");
  });
  it("a single identifier or a bad tube label would be rejected by the contract too", () => {
    assert.ok(!validate(env({ ...data, identifiersChecked: ["FULL_NAME"] })));
    assert.ok(!validate(env({ ...data, nurseCollection: { ...data.nurseCollection, samples: [{ label: "a b", specimenType: "BLOOD" }] } })));
  });
});
