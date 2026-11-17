import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  PendingDocumentAttachments,
  collectPendingDocumentFieldErrors,
  pendingDocumentDescription,
  type PendingDocumentRow,
} from "@/components/pending-document-attachments";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { OperationDocumentDto } from "@/lib/api-types";
import { apiFetchBlob, apiPostFormData } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";

type Props = {
  operationId: string;
  documents: OperationDocumentDto[];
  canUpload: boolean;
};

export function OperationPostSurgeryDocumentsSection({ operationId, documents, canUpload }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const postSurgeryDocs = useMemo(
    () => documents.filter((d) => d.kind === "POST_SURGERY"),
    [documents],
  );
  const [rows, setRows] = useState<PendingDocumentRow[]>([]);
  const [invalidRowIds, setInvalidRowIds] = useState<Set<string>>(new Set());

  const uploadMut = useMutation({
    mutationFn: async () => {
      const fieldErrors = collectPendingDocumentFieldErrors(rows);
      if (fieldErrors.code) {
        setInvalidRowIds(fieldErrors.invalidRowIds);
        throw new Error(fieldErrors.code);
      }
      const pending = rows.filter((r) => r.files.length > 0 && r.category);
      if (pending.length === 0) {
        throw new Error("nothing_to_upload");
      }
      for (const row of pending) {
        const desc = pendingDocumentDescription(row, t);
        if (!desc) continue;
        for (const file of row.files) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("kind", "POST_SURGERY");
          fd.append("description", desc);
          await apiPostFormData(`/api/v1/operations/${operationId}/documents`, fd);
        }
      }
    },
    onSuccess: async () => {
      setRows([]);
      setInvalidRowIds(new Set());
      await qc.invalidateQueries({ queryKey: ["operation", operationId] });
      toast.success(t("operations.postSurgeryUploadSuccess", "Post-surgery documents uploaded."));
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === "nothing_to_upload") {
        toast.error(t("operations.postSurgeryNothingToUpload", "Add at least one document to upload."));
        return;
      }
      toast.error(apiErrorMessage(e));
    },
  });

  const openDoc = async (doc: OperationDocumentDto) => {
    const { blob } = await apiFetchBlob(`/api/v1/operations/${operationId}/documents/${doc.id}/file`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.originalFileName || "document";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <UsageHeading />
      {postSurgeryDocs.length > 0 ? (
        <ul className="space-y-2">
          {postSurgeryDocs.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{doc.description?.trim() || doc.originalFileName}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(doc.createdAt).toLocaleString(localeForLanguage(i18n.language))}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => void openDoc(doc)}>
                {t("common.view", "View")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("operations.postSurgeryEmpty", "No post-surgery documents yet.")}
        </p>
      )}
      {canUpload ? (
        <div className="space-y-3 border-t border-border pt-3">
          <PendingDocumentAttachments
            rows={rows}
            onChange={(next) => {
              setRows(next);
              if (invalidRowIds.size > 0) setInvalidRowIds(new Set());
            }}
            invalidRowIds={invalidRowIds.size > 0 ? invalidRowIds : undefined}
          />
          <Button
            type="button"
            size="sm"
            disabled={uploadMut.isPending}
            onClick={() => uploadMut.mutate()}
          >
            {uploadMut.isPending
              ? t("common.saving", "Saving…")
              : t("operations.postSurgeryUpload", "Upload post-surgery documents")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function UsageHeading() {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="text-sm font-semibold">{t("operations.postSurgeryTitle", "Post-surgery documents")}</h3>
      <p className="text-xs text-muted-foreground">
        {t(
          "operations.postSurgeryHint",
          "Add reports, pathology, or imaging after the operation is discharged.",
        )}
      </p>
    </div>
  );
}