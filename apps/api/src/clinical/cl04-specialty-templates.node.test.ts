import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClinicalSpecialty } from "@prisma/client";
import { CLINICAL_SPECIALTY_VALUES } from "../common/clinical-specialties";
import {
  defaultAppointmentTypesForSpecialty,
  hasSpecialtyAppointmentTypes,
  seedFeeAmount,
} from "../signup/signup-appointment-types";
import {
  SYSTEM_DEFAULT_FORM_SPECIALTIES,
  SYSTEM_TEMPLATE_VERSION,
  defaultFormTemplateMeta,
  ensureTenantDefaultClinicalFormTemplates,
} from "./clinical-default-form-templates";
import { LAUNCH_SPECIALTIES, LAUNCH_TEMPLATE_REVIEWS } from "./launch-specialty-templates";

function fieldIds(specialty: ClinicalSpecialty): string[] {
  return defaultFormTemplateMeta(specialty).sectionsJson.flatMap((s) => s.fields.map((f) => f.id));
}

describe("CL-04 launch specialty coverage", () => {
  it("each launch specialty has a reviewed built-in template with its required elements", () => {
    assert.equal(LAUNCH_SPECIALTIES.length, 11);
    for (const specialty of LAUNCH_SPECIALTIES) {
      assert.ok(SYSTEM_DEFAULT_FORM_SPECIALTIES.includes(specialty), `${specialty} has no built-in template`);
      assert.ok(CLINICAL_SPECIALTY_VALUES.includes(specialty), `${specialty} not selectable`);
      const review = LAUNCH_TEMPLATE_REVIEWS[specialty];
      assert.equal(review.version, SYSTEM_TEMPLATE_VERSION, `${specialty} review is for an older template`);
      assert.ok(review.contentReviewedAt);
      const ids = new Set(fieldIds(specialty));
      for (const el of review.requiredElements) assert.ok(ids.has(el), `${specialty} template is missing ${el}`);
    }
  });

  it("each launch specialty has its own default appointment types", () => {
    for (const specialty of LAUNCH_SPECIALTIES) {
      assert.ok(hasSpecialtyAppointmentTypes(specialty), `${specialty} falls back to generic appointment types`);
      const types = defaultAppointmentTypesForSpecialty(specialty);
      assert.ok(types.length >= 2);
      for (const t of types) {
        assert.ok(t.nameEn.trim() && t.nameAr.trim(), `${specialty} appointment type needs EN + AR names`);
        assert.ok(t.durationMinutes >= 10);
      }
    }
    const derm = defaultAppointmentTypesForSpecialty(ClinicalSpecialty.DERMATOLOGY);
    assert.deepEqual(
      derm.map((t) => seedFeeAmount(t, 400)),
      [400, 200, 600],
      "fees derive from the market default visit fee",
    );
  });

  it("every template field is bilingual and ids are unique within a section", () => {
    for (const specialty of SYSTEM_DEFAULT_FORM_SPECIALTIES) {
      for (const section of defaultFormTemplateMeta(specialty).sectionsJson) {
        assert.ok(section.titleEn && section.titleAr);
        const seen = new Set<string>();
        for (const field of section.fields) {
          assert.ok(field.labelEn.trim() && field.labelAr.trim(), `${specialty}.${field.id} label`);
          assert.ok(!seen.has(field.id), `${specialty}.${section.id}.${field.id} duplicated`);
          seen.add(field.id);
          if (field.type === "select") assert.ok(field.options?.length);
          if (field.type === "computed") {
            assert.ok(field.computed && field.source && section.fields.some((x) => x.id === field.source));
          }
        }
      }
    }
  });

  it("OB/GYN dates the pregnancy from LMP; pediatrics records growth", () => {
    const ob = defaultFormTemplateMeta(ClinicalSpecialty.OBSTETRICS_GYNECOLOGY).sectionsJson.flatMap((s) => s.fields);
    assert.equal(ob.find((x) => x.id === "lmp_date")?.type, "date");
    assert.equal(ob.find((x) => x.id === "edd")?.computed, "EDD_FROM_LMP");
    const peds = fieldIds(ClinicalSpecialty.PEDIATRICS);
    for (const id of ["weight_kg", "height_cm", "head_circ_cm"]) assert.ok(peds.includes(id));
  });

  it("existing field ids are kept so saved encounter responses still render", () => {
    const legacy: Partial<Record<ClinicalSpecialty, string[]>> = {
      DERMATOLOGY: ["lesion_desc", "dermoscopy"],
      PEDIATRICS: ["growth", "immunization", "guardian", "safeguarding"],
      OBSTETRICS_GYNECOLOGY: ["lmp", "ob_history", "pelvic", "pregnancy_risk"],
      ORTHOPEDICS: ["joint", "rom", "neurovascular"],
      ENT: ["ent_exam", "hearing"],
      CARDIOLOGY: ["cvs", "ecg_echo"],
      PSYCHIATRY: ["mood", "thought", "insight"],
      OPHTHALMOLOGY: ["visual_acuity", "slit_lamp"],
      DENTISTRY: ["tooth_chart", "periodontal", "occlusion", "procedures", "anesthesia"],
    };
    for (const [specialty, ids] of Object.entries(legacy)) {
      const have = new Set(fieldIds(specialty as ClinicalSpecialty));
      for (const id of ids!) assert.ok(have.has(id), `${specialty} dropped legacy field ${id}`);
    }
  });

  it("older built-in rows are upgraded in place; current ones are left alone", async () => {
    const updates: string[] = [];
    const creates: string[] = [];
    const prisma = {
      clinicalFormTemplate: {
        findFirst: async (args: unknown) => {
          const specialty = (args as { where: { specialty: ClinicalSpecialty } }).where.specialty;
          if (specialty === ClinicalSpecialty.UROLOGY) return null;
          return {
            id: specialty,
            systemTemplateVersion: specialty === ClinicalSpecialty.DERMATOLOGY ? SYSTEM_TEMPLATE_VERSION : null,
          };
        },
        create: async (args: unknown) => {
          creates.push((args as { data: { specialty: string } }).data.specialty);
        },
        update: async (args: unknown) => {
          updates.push((args as { where: { id: string } }).where.id);
        },
      },
    };
    await ensureTenantDefaultClinicalFormTemplates(prisma, "t1");
    assert.deepEqual(creates, ["UROLOGY"]);
    assert.ok(updates.includes("PEDIATRICS"));
    assert.ok(!updates.includes("DERMATOLOGY"));
  });
});
