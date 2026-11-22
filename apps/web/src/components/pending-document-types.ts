export type PatientDocumentCategory = "LAB_RESULTS" | "RADIOLOGY" | "PRESCRIPTION" | "OTHER";

/** Categories used by patients + operations (operations may pass a wider list). */
export type DocumentCategoryOption = string;

export type PendingDocumentRow = {
  id: string;
  files: File[];
  category: DocumentCategoryOption | "";
  otherDetail: string;
};

export const PATIENT_DOCUMENT_CATEGORIES: PatientDocumentCategory[] = [
  "LAB_RESULTS",
  "RADIOLOGY",
  "PRESCRIPTION",
  "OTHER",
];

export function emptyPendingDocumentRow(): PendingDocumentRow {
  return { id: crypto.randomUUID(), files: [], category: "", otherDetail: "" };
}

export function patientDocumentCategoryLabel(
  category: PatientDocumentCategory,
  t: (key: string, fallback: string) => string,
): string {
  switch (category) {
    case "LAB_RESULTS":
      return t("patients.docCategoryLabResults", "Lab results");
    case "RADIOLOGY":
      return t("patients.docCategoryRadiology", "Radiology");
    case "PRESCRIPTION":
      return t("patients.docCategoryPrescription", "Prescription");
    case "OTHER":
      return t("patients.docCategoryOther", "Other");
  }
}

export function pendingDocumentDescription(
  row: PendingDocumentRow,
  t: (key: string, fallback: string) => string,
  categoryLabel?: (category: string, t: (key: string, fallback: string) => string) => string,
): string {
  if (!row.category) return "";
  if (row.category === "OTHER") return row.otherDetail.trim();
  if (categoryLabel) return categoryLabel(row.category, t);
  if (
    row.category === "LAB_RESULTS" ||
    row.category === "RADIOLOGY" ||
    row.category === "PRESCRIPTION" ||
    row.category === "OTHER"
  ) {
    return patientDocumentCategoryLabel(row.category, t);
  }
  return row.category;
}
