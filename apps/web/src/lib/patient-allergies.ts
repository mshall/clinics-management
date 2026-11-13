export const PATIENT_ALLERGY_CODES = [
  "PENICILLIN",
  "AMOXICILLIN",
  "SULFA",
  "ASPIRIN",
  "NSAIDS",
  "LATEX",
  "PEANUTS",
  "TREE_NUTS",
  "SHELLFISH",
  "EGGS",
  "MILK",
  "SOY",
  "WHEAT",
  "BEE_STING",
  "CONTRAST_IODINE",
  "CODEINE",
  "MORPHINE",
  "OTHER",
] as const;

export type PatientAllergyCode = (typeof PATIENT_ALLERGY_CODES)[number];

export type PatientAllergyFormItem = {
  code: PatientAllergyCode;
  otherComment?: string;
};

export function allergyLabel(code: PatientAllergyCode, t: (k: string, d: string) => string): string {
  return t(`patients.allergy.${code}`, code.replace(/_/g, " ").toLowerCase());
}

export function allergiesFormToApi(items: PatientAllergyFormItem[]): { code: string; otherComment?: string }[] {
  return items
    .filter((a) => a.code !== "OTHER" || (a.otherComment?.trim() ?? "").length > 0)
    .map((a) =>
      a.code === "OTHER"
        ? { code: a.code, otherComment: a.otherComment!.trim() }
        : { code: a.code },
    );
}
