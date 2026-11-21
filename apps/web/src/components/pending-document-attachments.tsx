import { Camera, Plus, Trash2, X } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { DocumentCameraCaptureDialog } from "@/components/document-camera-capture-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PATIENT_DOCUMENT_CATEGORIES,
  emptyPendingDocumentRow,
  patientDocumentCategoryLabel,
  type DocumentCategoryOption,
  type PendingDocumentRow,
} from "@/components/pending-document-utils";

type PendingDocumentAttachmentsProps = {
  rows: PendingDocumentRow[];
  onChange: Dispatch<SetStateAction<PendingDocumentRow[]>>;
  className?: string;
  /** Highlight specific row fields after validation */
  invalidRowIds?: Set<string>;
  /** Override category options (e.g. operations include Consent + Operation Report). */
  categories?: readonly DocumentCategoryOption[];
  categoryLabel?: (category: string, t: (key: string, fallback: string) => string) => string;
  optionalHint?: string;
};

export function PendingDocumentAttachments({
  rows,
  onChange,
  className,
  invalidRowIds,
  categories = PATIENT_DOCUMENT_CATEGORIES,
  categoryLabel,
  optionalHint,
}: PendingDocumentAttachmentsProps) {
  const { t } = useTranslation();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraRowId, setCameraRowId] = useState<string | null>(null);

  const labelFor = (category: string) => {
    if (categoryLabel) return categoryLabel(category, t);
    if (
      category === "LAB_RESULTS" ||
      category === "RADIOLOGY" ||
      category === "PRESCRIPTION" ||
      category === "OTHER"
    ) {
      return patientDocumentCategoryLabel(category, t);
    }
    return category;
  };

  const handleCameraOpenChange = (open: boolean) => {
    if (!open) setCameraRowId(null);
    setCameraOpen(open);
  };

  const handleCapture = (file: File) => {
    if (!cameraRowId) return;
    const rowId = cameraRowId;
    onChange((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, files: [...r.files, file] } : r)),
    );
  };

  const removeFile = (rowId: string, fileIndex: number) => {
    onChange((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, files: r.files.filter((_, i) => i !== fileIndex) } : r,
      ),
    );
  };

  const invalidClass = (rowId: string, field: "category" | "other" | "file") =>
    invalidRowIds?.has(`${rowId}:${field}`) ? "border-destructive ring-1 ring-destructive" : "";

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <Label>{t("patients.attachDocuments", "Documents")}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1 text-[hsl(var(--success))] hover:text-[hsl(var(--success))] "
          onClick={() => onChange((prev) => [...prev, emptyPendingDocumentRow()])}
        >
          <Plus className="h-4 w-4 text-[hsl(var(--success))]" />
          {t("patients.addDocument", "Add a document")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {optionalHint ??
            t("patients.documentsOptionalHint", "Optional — attach files with a description for each.")}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {rows.map((row, index) => (
            <div key={row.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("patients.documentN", "Document {{n}}", { n: index + 1 })}
                  {row.files.length > 1
                    ? ` · ${t("patients.documentFileCount", "{{count}} files", { count: row.files.length })}`
                    : null}
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
                    const category = e.target.value;
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
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {labelFor(cat)}
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
                <Label required>{t("patients.documentFiles", "Files")}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className={cn("cursor-pointer text-sm flex-1 min-w-48", invalidClass(row.id, "file"))}
                    type="file"
                    multiple
                    accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,text/plain"
                    onChange={(e) => {
                      const picked = [...(e.target.files ?? [])];
                      if (picked.length === 0) return;
                      onChange((prev) =>
                        prev.map((r) =>
                          r.id === row.id ? { ...r, files: [...r.files, ...picked] } : r,
                        ),
                      );
                      e.target.value = "";
                    }}
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
                {row.files.length > 0 ? (
                  <ul className="space-y-1">
                    {row.files.map((file, fileIndex) => (
                      <li
                        key={`${file.name}-${file.lastModified}-${fileIndex}`}
                        className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs"
                      >
                        <span className="min-w-0 truncate ltr-nums text-muted-foreground">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          aria-label={t("common.remove", "Remove")}
                          onClick={() => removeFile(row.id, fileIndex)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
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
