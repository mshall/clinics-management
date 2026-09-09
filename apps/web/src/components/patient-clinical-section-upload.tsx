import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DocumentCameraCaptureDialog } from "@/components/document-camera-capture-dialog";
import {
  patientDocumentCategoryLabel,
  type PatientDocumentCategory,
} from "@/components/pending-document-attachments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/features/platform/platform-shared";
import { apiPostFormData } from "@/lib/http";
import { uploadFilesSequentially } from "@/lib/upload-files-sequentially";

type PatientClinicalSectionUploadProps = {
  patientId: string;
  category: PatientDocumentCategory | "OTHER";
};

function addButtonLabel(
  category: PatientDocumentCategory | "OTHER",
  t: (key: string, fallback: string) => string,
): string {
  switch (category) {
    case "LAB_RESULTS":
      return t("patients.addLabResult", "Add lab result");
    case "RADIOLOGY":
      return t("patients.addRadiology", "Add radiology");
    case "PRESCRIPTION":
      return t("patients.addPrescription", "Add prescription");
    case "OTHER":
      return t("patients.addOtherDocument", "Add other document");
  }
}

export function PatientClinicalSectionUpload({ patientId, category }: PatientClinicalSectionUploadProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [otherDescription, setOtherDescription] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  const description =
    category === "OTHER"
      ? otherDescription.trim()
      : patientDocumentCategoryLabel(category, t);

  const resetForm = () => {
    setFiles([]);
    if (category === "OTHER") setOtherDescription("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closePanel = () => {
    resetForm();
    setOpen(false);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadMutation = useMutation({
    mutationFn: async (uploadFiles: File[]) => {
      if (!description) {
        throw new Error(
          category === "OTHER"
            ? t("patients.errorDocOtherRequired", "Explain what the document is when you choose Other.")
            : t("patients.errorDocCategoryRequired", "Each attached document needs a type."),
        );
      }
      await uploadFilesSequentially(uploadFiles, async (uploadFile) => {
        const fd = new FormData();
        fd.append("file", uploadFile);
        fd.append("description", description);
        return apiPostFormData(`/api/v1/patients/${patientId}/documents`, fd);
      });
    },
    onSuccess: async (_data, uploaded) => {
      resetForm();
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["patient", patientId, "clinical-documents"] });
      toast.success(
        uploaded.length === 1
          ? t("patients.clinicalDocUploaded", "Document uploaded.")
          : t("patients.clinicalDocsUploaded", "{{count}} documents uploaded.", { count: uploaded.length }),
      );
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const submit = () => {
    if (files.length === 0) return;
    uploadMutation.mutate(files);
  };

  const canUpload =
    files.length > 0 && !uploadMutation.isPending && (category !== "OTHER" || Boolean(otherDescription.trim()));

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4 w-full gap-1 text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4 text-emerald-600" />
        {addButtonLabel(category, t)}
      </Button>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{addButtonLabel(category, t)}</p>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={closePanel}>
          <X className="h-4 w-4" />
          <span className="sr-only">{t("common.cancel", "Cancel")}</span>
        </Button>
      </div>

      {category === "OTHER" ? (
        <div className="space-y-1">
          <Label required className="text-xs">
            {t("patients.documentDescription", "Description")}
          </Label>
          <Input
            value={otherDescription}
            onChange={(e) => setOtherDescription(e.target.value)}
            placeholder={t("patients.documentOtherPh", "Describe this document…")}
            className="h-9 text-sm"
          />
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,text/plain"
        className="hidden"
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          if (picked.length > 0) setFiles((prev) => [...prev, ...picked]);
          e.target.value = "";
        }}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 gap-1"
          disabled={category === "OTHER" && !otherDescription.trim()}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {t("patients.uploadDocuments", "Upload document(s)")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 gap-1"
          disabled={category === "OTHER" && !otherDescription.trim()}
          onClick={() => setCameraOpen(true)}
        >
          <Camera className="h-4 w-4" />
          {t("patients.captureWithCamera", "Capture with camera")}
        </Button>
      </div>

      {files.length > 0 ? (
        <div className="space-y-2 rounded-md border border-border bg-background px-3 py-2">
          <ul className="space-y-1">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${file.lastModified}-${index}`}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0 truncate ltr-nums text-muted-foreground">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label={t("common.remove", "Remove")}
                  onClick={() => removeFile(index)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" className="w-full gap-1" disabled={!canUpload} onClick={submit}>
            <Upload className="h-4 w-4" />
            {uploadMutation.isPending
              ? t("common.loading")
              : files.length === 1
                ? t("patients.uploadDocument", "Upload")
                : t("patients.uploadDocumentsCount", "Upload {{count}} files", { count: files.length })}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t(
            "patients.clinicalUploadHintMulti",
            "Choose one or more files from your device, or capture with the camera.",
          )}
        </p>
      )}

      <DocumentCameraCaptureDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={(captured) => setFiles((prev) => [...prev, captured])}
      />
    </div>
  );
}
