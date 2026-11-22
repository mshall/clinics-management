/** Patient document categories reused on operations (keep in sync with pending-document-attachments). */
export type PatientDocumentCategory = "LAB_RESULTS" | "RADIOLOGY" | "PRESCRIPTION" | "OTHER";

/** Extra operation document types (map to Prisma OperationDocumentKind). */
export type OperationExtraDocumentCategory = "CONSENT" | "OPERATION_REPORT";

export type OperationDocumentCategory = PatientDocumentCategory | OperationExtraDocumentCategory;

export const OPERATION_DOCUMENT_CATEGORIES: OperationDocumentCategory[] = [
  "LAB_RESULTS",
  "RADIOLOGY",
  "PRESCRIPTION",
  "CONSENT",
  "OPERATION_REPORT",
  "OTHER",
];

export function operationDocumentCategoryLabel(
  category: OperationDocumentCategory | string,
  t: (key: string, fallback: string) => string,
): string {
  switch (category) {
    case "CONSENT":
      return t("operations.docCategoryConsent", "Consent");
    case "OPERATION_REPORT":
      return t("operations.docCategoryOperationReport", "Operation Report");
    case "LAB_RESULTS":
      return t("patients.docCategoryLabResults", "Lab results");
    case "RADIOLOGY":
      return t("patients.docCategoryRadiology", "Radiology");
    case "PRESCRIPTION":
      return t("patients.docCategoryPrescription", "Prescription");
    case "OTHER":
      return t("patients.docCategoryOther", "Other");
    default:
      return category;
  }
}

export type OperationDocumentUploadKind = "ATTACHMENT" | "CONSENT" | "OPERATION_NOTE" | "POST_SURGERY";

/** Map UI category → API document kind for create/edit (pre) or post-surgery (post). */
export function operationDocumentUploadKind(
  category: OperationDocumentCategory,
  phase: "pre" | "post",
): OperationDocumentUploadKind {
  if (category === "CONSENT") return "CONSENT";
  if (category === "OPERATION_REPORT") return "OPERATION_NOTE";
  return phase === "post" ? "POST_SURGERY" : "ATTACHMENT";
}

export function operationDocumentKindLabel(
  kind: string,
  t: (key: string, fallback: string) => string,
): string {
  switch (kind) {
    case "CONSENT":
      return t("operations.docCategoryConsent", "Consent");
    case "OPERATION_NOTE":
      return t("operations.docCategoryOperationReport", "Operation Report");
    case "PRESCRIPTION":
      return t("patients.docCategoryPrescription", "Prescription");
    case "POST_SURGERY":
      return t("operations.docKindPostSurgery", "Post-surgery");
    case "ATTACHMENT":
    default:
      return t("operations.docKindAttachment", "Document");
  }
}

export function appendOperationDocumentFormData(
  fd: FormData,
  opts: {
    file: File;
    category: OperationDocumentCategory;
    description: string;
    phase: "pre" | "post";
  },
): void {
  fd.append("file", opts.file);
  fd.append("kind", operationDocumentUploadKind(opts.category, opts.phase));
  fd.append("description", opts.description);
}

/** Pre-surgery / clinical-prep docs (excludes pure post-surgery blobs). */
export function isOperationClinicalDocumentKind(kind: string): boolean {
  return (
    kind === "ATTACHMENT" ||
    kind === "CONSENT" ||
    kind === "OPERATION_NOTE" ||
    kind === "PRESCRIPTION"
  );
}

/** Map stored API kind → UI category when unambiguous. */
export function operationDocumentCategoryFromKind(kind: string): OperationDocumentCategory | null {
  switch (kind) {
    case "CONSENT":
      return "CONSENT";
    case "OPERATION_NOTE":
      return "OPERATION_REPORT";
    case "PRESCRIPTION":
      return "PRESCRIPTION";
    default:
      return null;
  }
}

/** Categories already used by saved operation documents (kind + description label match). */
export function reservedOperationDocumentCategories(
  documents: readonly { kind: string; description?: string | null }[],
  t: (key: string, fallback: string) => string,
): string[] {
  const reserved = new Set<string>();
  for (const doc of documents) {
    const fromKind = operationDocumentCategoryFromKind(doc.kind);
    if (fromKind) {
      reserved.add(fromKind);
      continue;
    }
    const desc = doc.description?.trim();
    if (!desc) continue;
    for (const cat of OPERATION_DOCUMENT_CATEGORIES) {
      if (cat === "OTHER") continue;
      if (operationDocumentCategoryLabel(cat, t) === desc) {
        reserved.add(cat);
      }
    }
  }
  return [...reserved];
}
