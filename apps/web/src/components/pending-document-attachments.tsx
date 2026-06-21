import { Camera, Plus, Trash2 } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { DocumentCameraCaptureDialog } from "@/components/document-camera-capture-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type PatientDocumentCategory = "LAB_RESULTS" | "RADIOLOGY" | "PRESCRIPTION" | "OTHER";

export const PATIENT_DOCUMENT_CATEGORIES: PatientDocumentCategory[] = [
  "LAB_RESULTS",
  "RADIOLOGY",
  "PRESCRIPTION",
  "OTHER",
];

export type PendingDocumentRow = {
  id: string;
  file: File | null;
  category: PatientDocumentCategory | "";
  otherDetail: string;
};

export function emptyPendingDocumentRow(): PendingDocumentRow {
  return { id: crypto.randomUUID(), file: null, category: "", otherDetail: "" };
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
): string {
  if (!row.category) return "";
  if (row.category === "OTHER") return row.otherDetail.trim();
  return patientDocumentCategoryLabel(row.category, t);
}

export function validatePendingDocuments(rows: PendingDocumentRow[]): string | null {
  for (const row of rows) {
    const hasFile = Boolean(row.file);
    const hasCategory = Boolean(row.category);
    const hasOther = row.category === "OTHER" ? Boolean(row.otherDetail.trim()) : true;
    if (!hasFile && !hasCategory && !row.otherDetail.trim()) continue;
    if (hasFile && !hasCategory) return "doc_category_required";
    if (hasCategory && row.category === "OTHER" && !hasOther) return "doc_other_required";
    if (hasCategory && !hasFile) return "doc_file_required";
  }
  return null;
}

type PendingDocumentAttachmentsProps = {
  rows: PendingDocumentRow[];
  onChange: Dispatch<SetStateAction<PendingDocumentRow[]>>;
  className?: string;
  /** Highlight specific row fields after validation */
  invalidRowIds?: Set<string>;
};

export function PendingDocumentAttachments({
  rows,
  onChange,
  className,
  invalidRowIds,
}: PendingDocumentAttachmentsProps) {
  const { t } = useTranslation();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraRowId, setCameraRowId] = useState<string | null>(null);

  const openCameraForNewRow = () => {
    const row = emptyPendingDocumentRow();
    onChange((prev) => [...prev, row]);
    setCameraRowId(row.id);
    setCameraOpen(true);
  };

  const handleCameraOpenChange = (open: boolean) => {
    if (!open && cameraRowId) {
      const rowId = cameraRowId;
      onChange((prev) => {
        const row = prev.find((r) => r.id === rowId);
        if (row && !row.file && !row.category && !row.otherDetail.trim()) {
          return prev.filter((r) => r.id !== rowId);
        }
        return prev;
      });
      setCameraRowId(null);
    }
    setCameraOpen(open);
  };

  const handleCapture = (file: File) => {
    if (!cameraRowId) return;
    const rowId = cameraRowId;
    onChange((prev) => prev.map((r) => (r.id === rowId ? { ...r, file } : r)));
    setCameraRowId(null);
  };

  const invalidClass = (rowId: string, field: "category" | "other" | "file") =>
    invalidRowIds?.has(`${rowId}:${field}`) ? "border-destructive ring-1 ring-destructive" : "";

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <Label>{t("patients.attachDocuments", "Documents")}</Label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
            onClick={() => onChange((prev) => [...prev, emptyPendingDocumentRow()])}
          >
            <Plus className="h-4 w-4 text-emerald-600" />
            {t("patients.addDocument", "Add a document")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0 text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
            aria-label={t("patients.captureWithCamera", "Capture with camera")}
            title={t("patients.captureWithCamera", "Capture with camera")}
            onClick={openCameraForNewRow}
          >
            <Camera className="h-4 w-4 text-emerald-600" />
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("patients.documentsOptionalHint", "Optional — attach files with a description for each.")}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {rows.map((row, index) => (
            <div key={row.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("patients.documentN", "Document {{n}}", { n: index + 1 })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  aria-label={t("common.remove", "Remove")}
                  onClick={() => onChange((prev) => prev.filter((r) => r.id !== row.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <Label required>{t("patients.documentDescription", "Description")}</Label>
                <select
                  className={cn(
                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                    invalidClass(row.id, "category"),
                  )}
                  value={row.category}
                  onChange={(e) => {
                    const category = e.target.value as PatientDocumentCategory | "";
                    onChange((prev) =>
                      prev.map((r) =>
                        r.id === row.id
                          ? { ...r, category, otherDetail: category === "OTHER" ? r.otherDetail : "" }
                          : r,
                      ),
                    );
                  }}
                >
                  <option value="">{t("patients.docCategorySelect", "Select type…")}</option>
                  {PATIENT_DOCUMENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {patientDocumentCategoryLabel(cat, t)}
                    </option>
                  ))}
                </select>
              </div>
              {row.category === "OTHER" ? (
                <div className="space-y-2">
                  <Label required>{t("patients.explainMore", "Explain more")}</Label>
                  <Input
                    className={invalidClass(row.id, "other")}
                    value={row.otherDetail}
                    onChange={(e) =>
                      onChange((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, otherDetail: e.target.value } : r)),
                      )
                    }
                    placeholder={t("patients.documentOtherPh", "Describe this document…")}
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label required>{t("patients.documentFile", "File")}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className={cn("cursor-pointer text-sm flex-1 min-w-[12rem]", invalidClass(row.id, "file"))}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,text/plain"
                    onChange={(e) =>
                      onChange((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, file: e.target.files?.[0] ?? null } : r)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={() => {
                      setCameraRowId(row.id);
                      setCameraOpen(true);
                    }}
                  >
                    <Camera className="h-4 w-4" />
                    {t("patients.captureWithCamera", "Capture with camera")}
                  </Button>
                </div>
                {row.file ? <p className="text-xs text-muted-foreground ltr-nums">{row.file.name}</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <DocumentCameraCaptureDialog
        open={cameraOpen}
        onOpenChange={handleCameraOpenChange}
        onCapture={handleCapture}
      />
    </div>
  );
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
