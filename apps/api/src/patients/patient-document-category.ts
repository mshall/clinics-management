export type PatientDocumentCategoryKind = "LAB_RESULTS" | "RADIOLOGY" | "PRESCRIPTION";

const CATEGORY_LABELS: Record<PatientDocumentCategoryKind, readonly string[]> = {
  LAB_RESULTS: ["Lab results", "نتائج تحاليل"],
  RADIOLOGY: ["Radiology", "أشعة"],
  PRESCRIPTION: ["Prescription", "وصفة طبية"],
};

export function classifyPatientDocumentDescription(description: string): PatientDocumentCategoryKind | null {
  const trimmed = description.trim();
  for (const kind of Object.keys(CATEGORY_LABELS) as PatientDocumentCategoryKind[]) {
    if (CATEGORY_LABELS[kind].some((label) => label === trimmed)) {
      return kind;
    }
  }
  return null;
}

export function patientCategoryToClinicalKind(
  category: PatientDocumentCategoryKind,
): "LAB" | "RADIOLOGY" | "PRESCRIPTION" {
  switch (category) {
    case "LAB_RESULTS":
      return "LAB";
    case "RADIOLOGY":
      return "RADIOLOGY";
    case "PRESCRIPTION":
      return "PRESCRIPTION";
  }
}
