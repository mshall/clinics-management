import type { PendingDocumentRow } from "./pending-document-types";

export type PendingDocumentValidationOptions = {
  /** When true, each document type may appear only once across pending rows. */
  uniqueCategories?: boolean;
  /** Categories already used by saved documents (cannot be selected again). */
  reservedCategories?: readonly string[];
};

export function collectPendingDocumentFieldErrors(
  rows: PendingDocumentRow[],
  opts?: PendingDocumentValidationOptions,
): {
  code: string | null;
  invalidRowIds: Set<string>;
} {
  const invalidRowIds = new Set<string>();
  const reserved = new Set((opts?.reservedCategories ?? []).filter(Boolean));
  const seen = new Set<string>();

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
    if (opts?.uniqueCategories && row.category) {
      if (reserved.has(row.category) || seen.has(row.category)) {
        invalidRowIds.add(`${row.id}:category`);
        return { code: "doc_category_duplicate", invalidRowIds };
      }
      seen.add(row.category);
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
  if (code === "doc_category_duplicate") {
    return t(
      "patients.errorDocCategoryDuplicate",
      "Each document type can only be added once. Choose a different type or add more files to the existing row.",
    );
  }
  return null;
}
