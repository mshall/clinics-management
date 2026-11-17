/** Mirrors API `ClinicalSpecialty` (excludes CUSTOM for system defaults). */
export const CLINICAL_SPECIALTY_OPTIONS = [
  "POLYCLINIC",
  "GENERAL_MEDICINE",
  "PAIN_MANAGEMENT",
  "ORTHOPEDICS",
  "PEDIATRICS",
  "DERMATOLOGY",
  "DENTISTRY",
  "PHYSIO_THERAPY",
  "AESTHETICS",
  "CARDIOLOGY",
  "OBSTETRICS_GYNECOLOGY",
  "ENT",
  "OPHTHALMOLOGY",
  "PSYCHIATRY",
  "RADIOLOGY",
  "LABORATORY",
  "INTERNAL_MEDICINE",
  "FAMILY_MEDICINE",
  "CUSTOM",
] as const;

export type ClinicalSpecialtySlug = (typeof CLINICAL_SPECIALTY_OPTIONS)[number];

/** Org/clinic/hr pickers — excludes CUSTOM (templates only). */
export const CLINICAL_SPECIALTY_VALUES = CLINICAL_SPECIALTY_OPTIONS.filter(
  (s): s is Exclude<ClinicalSpecialtySlug, "CUSTOM"> => s !== "CUSTOM",
);

/** Alias for signup wizard */
export const CLINICAL_SPECIALTY_KEYS = CLINICAL_SPECIALTY_VALUES;

export function formatClinicalSpecialty(slug: string, t: (key: string, fallback: string) => string): string {
  if (slug === "CUSTOM") return t("clinical.specialtyCustom", "Custom specialty");
  const key = `clinical.specialty_${slug}`;
  return t(key, slug.replace(/_/g, " "));
}