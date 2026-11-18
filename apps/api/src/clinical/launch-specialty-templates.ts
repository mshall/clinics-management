import { ClinicalSpecialty } from "@prisma/client";
import { SYSTEM_TEMPLATE_VERSION } from "./clinical-default-form-templates";

/** CL-04 launch specialties: each must ship a reviewed built-in template and its own appointment types. */
export const LAUNCH_SPECIALTIES = [
  ClinicalSpecialty.DERMATOLOGY,
  ClinicalSpecialty.PEDIATRICS,
  ClinicalSpecialty.OBSTETRICS_GYNECOLOGY,
  ClinicalSpecialty.ORTHOPEDICS,
  ClinicalSpecialty.ENT,
  ClinicalSpecialty.INTERNAL_MEDICINE,
  ClinicalSpecialty.CARDIOLOGY,
  ClinicalSpecialty.PSYCHIATRY,
  ClinicalSpecialty.OPHTHALMOLOGY,
  ClinicalSpecialty.UROLOGY,
  ClinicalSpecialty.DENTISTRY,
] as const;

export type LaunchSpecialty = (typeof LAUNCH_SPECIALTIES)[number];

export type TemplateReview = {
  version: number;
  /** Kiorly clinical-content review against the required elements below (automated check in CI). */
  contentReviewedAt: string;
  /** Field ids a doctor in this specialty expects on the first visit. */
  requiredElements: string[];
  /** CMO-led advisory board sign-off; null until a named clinician signs (Docs/KIORLY_NEEDS_HUMAN.md NH-010). */
  boardSignOff: { by: string; at: string } | null;
};

const REVIEWED_AT = "2026-11-19";

function review(requiredElements: string[]): TemplateReview {
  return { version: SYSTEM_TEMPLATE_VERSION, contentReviewedAt: REVIEWED_AT, requiredElements, boardSignOff: null };
}

export const LAUNCH_TEMPLATE_REVIEWS: Record<LaunchSpecialty, TemplateReview> = {
  DERMATOLOGY: review(["lesion_desc", "morphology", "distribution", "bsa_pct", "fitzpatrick", "dermoscopy", "photo_consent"]),
  PEDIATRICS: review(["weight_kg", "height_cm", "head_circ_cm", "percentiles", "milestones", "immunization", "guardian"]),
  OBSTETRICS_GYNECOLOGY: review(["lmp_date", "edd", "ga", "gravida", "para", "fhr", "fundal_height_cm", "pelvic"]),
  ORTHOPEDICS: review(["joint", "side", "rom", "special_tests", "neurovascular", "mechanism", "imaging_review"]),
  ENT: review(["otoscopy_right", "otoscopy_left", "hearing", "tuning_fork", "nose", "throat", "neck"]),
  INTERNAL_MEDICINE: review(["systems", "chest", "abdomen", "hba1c", "bp_control", "renal", "lipids"]),
  CARDIOLOGY: review(["cvs", "murmurs", "edema", "ecg_echo", "lvef_pct", "chest_pain", "nyha", "risk_factors"]),
  PSYCHIATRY: review(["appearance", "mood", "thought", "perception", "insight", "suicide_risk", "phq9", "gad7"]),
  OPHTHALMOLOGY: review(["va_right", "va_left", "iop_right", "iop_left", "pupils", "slit_lamp", "refraction"]),
  UROLOGY: review(["ipss", "hematuria", "luts", "dre", "urinalysis", "psa", "us_kub"]),
  DENTISTRY: review(["tooth_number", "pain_type", "caries", "periodontal", "oral_hygiene", "radiographs", "procedures"]),
};

export function isLaunchSpecialty(s: ClinicalSpecialty): s is LaunchSpecialty {
  return (LAUNCH_SPECIALTIES as readonly ClinicalSpecialty[]).includes(s);
}
