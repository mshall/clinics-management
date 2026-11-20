import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, FlaskConical, Pill, ScanLine } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { EncounterDocumentDto } from "@/lib/api-types";
import { apiPostFormData } from "@/lib/http";

type DocKind = "LAB" | "RADIOLOGY" | "PRESCRIPTION";

type Props = {
  encounterId: string;
  status: string;
  canUpload: boolean;
};

export function EncounterProfileDocuments({ encounterId, status, canUpload }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const labRef = useRef<HTMLInputElement>(null);
  const radRef = useRef<HTMLInputElement>(null);
  const rxRef = useRef<HTMLInputElement>(null);
  const isFinalized = status === "FINALIZED";
  const isDraftLike = status === "DRAFT" || status === "AMENDED";

  const uploadMut = useMutation({
    mutationFn: async ({ files, kind }: { files: FileList | File[]; kind: DocKind }) => {
      const list = Array.from(files);
      for (const file of list) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("kind", kind);
        await apiPostFormData<EncounterDocumentDto>(`/api/v1/encounters/${encounterId}/documents`, fd);
      }
    },
    onSuccess: async (_d, vars) => {
      await qc.invalidateQueries({ queryKey: ["encounter", encounterId] });
      await qc.invalidateQueries({ queryKey: ["encounters"] });
      toast.success(
        t("patients.encounterDocsUploaded", "{{count}} document(s) uploaded.", { count: vars.files.length }),
      );
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  if (!canUpload || (!isDraftLike && !isFinalized)) return null;

  const bindPick = (kind: DocKind, ref: React.RefObject<HTMLInputElement | null>) => () => {
    const input = ref.current;
    if (!input) return;
    input.onchange = () => {
      const files = input.files;
      if (!files?.length) return;
      uploadMut.mutate({ files, kind });
      input.value = "";
    };
    input.click();
  };

  return (
    <section className="space-y-2 rounded-lg border border-dashed border-primary/25 bg-primary/5 p-3">
      <p className="text-xs font-medium text-primary">
        {isFinalized
          ? t("patients.postEncounterDocsTitle", "Upload post-visit results")
          : t("patients.encounterDocsTitle", "Add encounter documents")}
      </p>
      <p className="text-xs text-muted-foreground">
        {isFinalized
          ? t("patients.postEncounterDocsHint", "Lab and imaging after the visit is finalized.")
          : t("patients.encounterDocsHint", "Lab, radiology, or prescription files for this encounter.")}
      </p>
      <div className="flex flex-wrap gap-2">
        <input ref={labRef} type="file" className="hidden" accept="image/*,application/pdf" multiple />
        <input ref={radRef} type="file" className="hidden" accept="image/*,application/pdf" multiple />
        {isDraftLike ? <input ref={rxRef} type="file" className="hidden" accept="image/*,application/pdf" /> : null}
        <Button type="button" size="sm" variant="secondary" disabled={uploadMut.isPending} onClick={bindPick("LAB", labRef)}>
          <FlaskConical className="me-1.5 h-3.5 w-3.5 text-kx-ocean-700" aria-hidden />
          {t("encounters.uploadLab", "Lab")}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={uploadMut.isPending} onClick={bindPick("RADIOLOGY", radRef)}>
          <ScanLine className="me-1.5 h-3.5 w-3.5 text-kx-indigo-700" aria-hidden />
          {t("encounters.uploadRadiology", "Radiology")}
        </Button>
        {isDraftLike ? (
          <Button type="button" size="sm" variant="secondary" disabled={uploadMut.isPending} onClick={bindPick("PRESCRIPTION", rxRef)}>
            <Pill className="me-1.5 h-3.5 w-3.5 text-[hsl(var(--success))]" aria-hidden />
            {t("encounters.uploadPrescription", "Prescription")}
          </Button>
        ) : null}
        {uploadMut.isPending ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <FileUp className="h-3.5 w-3.5" aria-hidden />
            {t("common.saving", "Saving…")}
          </span>
        ) : null}
      </div>
    </section>
  );
}