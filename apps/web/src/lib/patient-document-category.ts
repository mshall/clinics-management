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

export function isClinicalCategoryDocument(description: string): boolean {
  return classifyPatientDocumentDescription(description) !== null;
}

export interface PatientClinicalDocumentItem {
  id: string;
  source: "patient" | "encounter";
  encounterId?: string;
  encounterVisitType?: string;
  description?: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface PatientClinicalDocumentsDto {
  labs: PatientClinicalDocumentItem[];
  radiology: PatientClinicalDocumentItem[];
  prescriptions: PatientClinicalDocumentItem[];
  other: PatientClinicalDocumentItem[];
}
