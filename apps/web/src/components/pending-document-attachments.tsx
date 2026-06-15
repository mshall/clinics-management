import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PendingDocumentRow = {
  id: string;
  file: File | null;
  description: string;
};

export function emptyPendingDocumentRow(): PendingDocumentRow {
  return { id: crypto.randomUUID(), file: null, description: "" };
}

export function validatePendingDocuments(rows: PendingDocumentRow[]): string | null {
  for (const row of rows) {
    if (row.file && !row.description.trim()) {
      return "doc_description_required";
    }
    if (row.description.trim() && !row.file) {
      return "doc_file_required";
    }
  }
  return null;
}

type PendingDocumentAttachmentsProps = {
  rows: PendingDocumentRow[];
  onChange: (rows: PendingDocumentRow[]) => void;
  className?: string;
};

export function PendingDocumentAttachments({ rows, onChange, className }: PendingDocumentAttachmentsProps) {
  const { t } = useTranslation();

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <Label>{t("patients.attachDocuments", "Documents")}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1 text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
          onClick={() => onChange([...rows, emptyPendingDocumentRow()])}
        >
          <Plus className="h-4 w-4 text-emerald-600" />
          {t("patients.addDocument", "Add a document")}
        </Button>
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
                  onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <Label required>{t("patients.documentDescription", "Description")}</Label>
                <Input
                  value={row.description}
                  onChange={(e) =>
                    onChange(rows.map((r) => (r.id === row.id ? { ...r, description: e.target.value } : r)))
                  }
                  placeholder={t("patients.documentDescriptionPh", "What is this document?")}
                />
              </div>
              <div className="space-y-2">
                <Label required>{t("patients.documentFile", "File")}</Label>
                <Input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,text/plain"
                  onChange={(e) =>
                    onChange(
                      rows.map((r) => (r.id === row.id ? { ...r, file: e.target.files?.[0] ?? null } : r)),
                    )
                  }
                />
                {row.file ? <p className="text-xs text-muted-foreground ltr-nums">{row.file.name}</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function pendingDocumentValidationMessage(code: string | null, t: (key: string, fallback: string) => string): string | null {
  if (code === "doc_description_required") {
    return t("patients.errorDocDescriptionRequired", "Each attached document needs a description.");
  }
  if (code === "doc_file_required") {
    return t("patients.errorDocFileRequired", "Choose a file for each document description.");
  }
  return null;
}
