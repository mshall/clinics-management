import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPatch, apiPostFormData } from "@/lib/http";

export function clinicPrescriptionLogoUrl(clinicId: string): string {
  return `/api/v1/clinics/${clinicId}/prescription-logo`;
}

export function usePatchClinicPrescriptionSettingsMutation(clinicId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { prescriptionHeaderDescriptionEn?: string; prescriptionHeaderDescriptionAr?: string }) =>
      apiPatch(`/api/v1/clinics/${clinicId}/prescription-settings`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinic", clinicId] });
      void qc.invalidateQueries({ queryKey: ["clinics"] });
    },
  });
}

export function useUploadClinicPrescriptionLogoMutation(clinicId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiPostFormData(`/api/v1/clinics/${clinicId}/prescription-logo`, fd, { enhance: false });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinic", clinicId] });
      void qc.invalidateQueries({ queryKey: ["clinics"] });
    },
  });
}
