import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClinicalSpecialty } from "@prisma/client";
import { getFlagDefinition } from "../feature-flags/feature-flag-keys";
import { defaultFormTemplateMeta } from "./clinical-default-form-templates";
import { GATED_TEMPLATE_SPECIALTY_CODES, PHYSIO_TEMPLATE_REVIEW, isGatedTemplateSpecialty, specialtyTemplateCode } from "./launch-specialty-templates";
import { baselinePoints, buildTrend, directAccessAllowed, validateAssessment, validateExercises, validateOutcomePoints } from "./physio-pack";

describe("CL07-PT physio pack rules", () => {
  it("template is launch-locked behind clinic.specialty_templates.physio (GPR2) and never self-signed", () => {
    assert.equal(specialtyTemplateCode(ClinicalSpecialty.PHYSIO_THERAPY), "physio");
    assert.equal(specialtyTemplateCode(ClinicalSpecialty.DERMATOLOGY), "dermatology");
    assert.ok(isGatedTemplateSpecialty(ClinicalSpecialty.PHYSIO_THERAPY));
    assert.equal(GATED_TEMPLATE_SPECIALTY_CODES.PHYSIO_THERAPY, "physio");
    const def = getFlagDefinition("clinic.specialty_templates.physio")!;
    assert.equal(def.launchLocked, true);
    assert.match(def.gate ?? "", /GPR2/);
    assert.equal(PHYSIO_TEMPLATE_REVIEW.boardSignOff, null, "GPR2 sign-off is a human gate");
  });

  it("PT01-PT03 template carries its required elements, bilingual, with the legacy ids kept", () => {
    const sections = defaultFormTemplateMeta(ClinicalSpecialty.PHYSIO_THERAPY).sectionsJson;
    const fields = sections.flatMap((s) => s.fields);
    const ids = new Set(fields.map((f) => f.id));
    for (const el of PHYSIO_TEMPLATE_REVIEW.requiredElements) assert.ok(ids.has(el), el);
    for (const legacy of ["chief_region", "posture_gait", "rom_strength", "goals", "exercises", "sessions"]) assert.ok(ids.has(legacy), legacy);
    for (const f of fields) assert.ok(f.labelEn.trim() && f.labelAr.trim());
  });

  it("PT01 assessment validation: pain 0-10, strength 0-5, ROM degrees, goal required", () => {
    const ok = { complaint: "Knee pain", painNrs: 6, rom: [{ joint: "knee", movement: "flexion", degrees: 110 }], strength: [{ muscleGroup: "quadriceps", grade: 4 }], functionalGoals: [{ text: "Climb stairs" }] };
    assert.equal(validateAssessment(ok), 6);
    for (const bad of [{ ...ok, painNrs: 11 }, { ...ok, painNrs: -1 }, { ...ok, painNrs: 2.5 }, { ...ok, strength: [{ muscleGroup: "q", grade: 6 }] }, { ...ok, rom: [{ joint: "knee", movement: "flexion", degrees: 400 }] }, { ...ok, functionalGoals: [] }, { ...ok, complaint: " " }]) {
      assert.throws(() => validateAssessment(bad as never));
    }
    assert.deepEqual(baselinePoints(ok).map((p) => [p.kind, p.label]), [["PAIN_NRS", "pain"], ["ROM", "knee_flexion"], ["STRENGTH", "quadriceps"]]);
  });

  it("PT03 outcome trend", () => {
    const t = buildTrend([{ measuredAt: new Date("2026-02-01"), value: "4" }, { measuredAt: new Date("2026-01-01"), value: "8" }, { measuredAt: new Date("2026-03-01"), value: 2 }]);
    assert.deepEqual([t.first, t.latest, t.change], [8, 2, -6]);
    assert.deepEqual(buildTrend([]), { points: [], first: null, latest: null, change: null });
    assert.throws(() => validateOutcomePoints([{ kind: "PAIN_NRS", label: "pain", value: 12, unit: "0-10" }]));
    assert.throws(() => validateOutcomePoints([{ kind: "X" as never, label: "a", value: 1, unit: "u" }]));
  });

  it("PT05 exercises need AR + EN names", () => {
    assert.throws(() => validateExercises([]));
    assert.throws(() => validateExercises([{ nameEn: "Squat", nameAr: "" }]));
    assert.equal(validateExercises([{ nameEn: "Squat", nameAr: "قرفصاء", sets: 3, reps: 10 }]).length, 1);
  });

  it("PT04 direct access is off unless the market pack allows it (Q9)", () => {
    assert.equal(directAccessAllowed({}), false);
    assert.equal(directAccessAllowed(null), false);
    assert.equal(directAccessAllowed({ physioDirectAccess: true }), true);
  });
});
