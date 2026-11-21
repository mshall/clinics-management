import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { apiPostFormData } from "@/lib/http";
import {
  OPERATION_DOCUMENT_CATEGORIES,
  appendOperationDocumentFormData,
  operationDocumentCategoryLabel,
  type OperationDocumentCategory,
} from "@/lib/operation-document-categories";

type Props = {
  operationId: string;
  canUpload: boolean;
};

export function OperationPreSurgeryProfileDocs({ operationId, canUpload }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
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
      if (pending.length === 0) throw new Error("nothing_to_upload");
      for (const row of pending) {
        if (!row.category) continue;
        const desc = pendingDocumentDescription(row, t, operationDocumentCategoryLabel);
        for (const file of row.files) {
          const fd = new FormData();
          appendOperationDocumentFormData(fd, {
            file,
            category: row.category as OperationDocumentCategory,
            description: desc,
            phase: "pre",
          });
          await apiPostFormData(`/api/v1/operations/${operationId}/documents`, fd);
        }
      }
    },
    onSuccess: async () => {
      setRows([]);
      setInvalidRowIds(new Set());
      await qc.invalidateQueries({ queryKey: ["operation", operationId] });
      await qc.invalidateQueries({ queryKey: ["operations"] });
      toast.success(t("patients.operationDocsUploaded", "Pre-surgery documents uploaded."));
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === "nothing_to_upload") {
        toast.error(t("operations.postSurgeryNothingToUpload", "Add at least one document to upload."));
        return;
      }
      toast.error(apiErrorMessage(e));
    },
  });

  if (!canUpload) return null;

  return (
    <section className="space-y-3 rounded-lg border border-dashed border-[hsl(var(--warning)/0.3)] bg-amber-500/5 p-3">
      <div>
        <p className="text-xs font-medium text-[hsl(var(--warning))] ">
          {t("patients.operationPreDocsTitle", "Add pre-surgery documents")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            "patients.operationPreDocsHint",
            "Consent forms, operation report, imaging, or plans while the operation is scheduled.",
          )}
        </p>
      </div>
      <PendingDocumentAttachments
        rows={rows}
        onChange={(next) => {
          setRows(next);
          if (invalidRowIds.size > 0) setInvalidRowIds(new Set());
        }}
        invalidRowIds={invalidRowIds.size > 0 ? invalidRowIds : undefined}
        categories={OPERATION_DOCUMENT_CATEGORIES}
        categoryLabel={operationDocumentCategoryLabel}
        optionalHint={t(
          "operations.documentsOptionalHint",
          "Optional — attach consent, operation report, labs, imaging, or other files.",
        )}
      />
      <Button type="button" size="sm" disabled={uploadMut.isPending} onClick={() => uploadMut.mutate()}>
        {uploadMut.isPending ? t("common.saving", "Saving…") : t("common.upload", "Upload")}
      </Button>
    </section>
  );
}
