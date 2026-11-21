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

export function validatePendingDocuments(rows: PendingDocumentRow[]): string | null {
  return collectPendingDocumentFieldErrors(rows).code;
}

export function collectPendingDocumentFieldErrors(rows: PendingDocumentRow[]): {
  code: string | null;
  invalidRowIds: Set<string>;
} {
  const invalidRowIds = new Set<string>();
  for (const row of rows) {
    const hasFiles = row.files.length > 0;
    const hasCategory = Boolean(row.category);
    const hasOther = row.category === "OTHER" ? Boolean(row.otherDetail.trim()) : true;
    if (!hasFiles && !hasCategory && !row.otherDetail.trim()) continue;
    if (hasFiles && !hasCategory) {
      invalidRowIds.add(`${row.id}:category`);
      invalidRowIds.add(`${row.id}:file`);
      return { code: "doc_category_required", invalidRowIds };
    }
    if (hasCategory && row.category === "OTHER" && !hasOther) {
      invalidRowIds.add(`${row.id}:other`);
      return { code: "doc_other_required", invalidRowIds };
    }
    if (hasCategory && !hasFiles) {
      invalidRowIds.add(`${row.id}:file`);
      return { code: "doc_file_required", invalidRowIds };
    }
  }
  return { code: null, invalidRowIds };
}

export function pendingDocumentValidationMessage(
  code: string | null,
  t: (key: string, fallback: string) => string,
): string | null {
  if (code === "doc_category_required") {
    return t("patients.errorDocCategoryRequired", "Each attached document needs a type.");
  }
  if (code === "doc_other_required") {
    return t("patients.errorDocOtherRequired", "Explain what the document is when you choose Other.");
  }
  if (code === "doc_file_required") {
    return t("patients.errorDocFileRequired", "Choose a file for each document description.");
  }
  return null;
}
