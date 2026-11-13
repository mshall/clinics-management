import { ClinicalSpecialty } from "@prisma/client";

/** Canonical clinical specialty values shared with the web app. */
export const CLINICAL_SPECIALTY_VALUES: ClinicalSpecialty[] = [
  ClinicalSpecialty.POLYCLINIC,
  ClinicalSpecialty.GENERAL_MEDICINE,
  ClinicalSpecialty.PAIN_MANAGEMENT,
  ClinicalSpecialty.ORTHOPEDICS,
  ClinicalSpecialty.PEDIATRICS,
  ClinicalSpecialty.DERMATOLOGY,
  ClinicalSpecialty.DENTISTRY,
  ClinicalSpecialty.PHYSIO_THERAPY,
  ClinicalSpecialty.AESTHETICS,
  ClinicalSpecialty.CARDIOLOGY,
  ClinicalSpecialty.OBSTETRICS_GYNECOLOGY,
  ClinicalSpecialty.ENT,
  ClinicalSpecialty.OPHTHALMOLOGY,
  ClinicalSpecialty.PSYCHIATRY,
  ClinicalSpecialty.RADIOLOGY,
  ClinicalSpecialty.LABORATORY,
  ClinicalSpecialty.INTERNAL_MEDICINE,
  ClinicalSpecialty.FAMILY_MEDICINE,
];

const SPECIALTY_SET = new Set<string>(CLINICAL_SPECIALTY_VALUES);

export function isClinicalSpecialty(value: string): value is ClinicalSpecialty {
  return SPECIALTY_SET.has(value);
}
