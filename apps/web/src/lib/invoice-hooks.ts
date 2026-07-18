import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InvoiceDto, InvoiceListItemDto } from "@/lib/api-types";
import { apiGet, apiPatch, apiPost, apiPostFormData } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";

function useHasAuthToken(): boolean {
  return useAuthStore((s) => Boolean(s.accessToken));
}

export function useInvoicesQuery(opts?: {
  patientId?: string;
  encounterId?: string;
  operationId?: string;
  enabled?: boolean;
}) {
  const hasAuth = useHasAuthToken();
  const enabled = (opts?.enabled ?? true) && hasAuth;
  return useQuery({
    queryKey: ["invoices", opts?.patientId ?? null, opts?.encounterId ?? null, opts?.operationId ?? null],
    enabled,
    queryFn: async () => {
      const q = new URLSearchParams();
      if (opts?.patientId) q.set("patientId", opts.patientId);
      if (opts?.encounterId) q.set("encounterId", opts.encounterId);
      if (opts?.operationId) q.set("operationId", opts.operationId);
      const qs = q.toString();
      return apiGet<InvoiceListItemDto[]>(`/api/v1/invoices${qs ? `?${qs}` : ""}`);
    },
  });
}

export function useInvoiceQuery(id: string | undefined) {
  const hasAuth = useHasAuthToken();
  return useQuery({
    queryKey: ["invoice", id],
    enabled: Boolean(id) && hasAuth,
    queryFn: () => apiGet<InvoiceDto>(`/api/v1/invoices/${id!}`),
  });
}

export function usePatchClinicInvoiceSettingsMutation(clinicId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { invoiceBackgroundColor?: string; invoiceSections?: string[] }) =>
      apiPatch(`/api/v1/clinics/${clinicId}/invoice-settings`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinic", clinicId] });
      void qc.invalidateQueries({ queryKey: ["clinics"] });
    },
  });
}

export function useUploadClinicInvoiceLogoMutation(clinicId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiPostFormData(`/api/v1/clinics/${clinicId}/invoice-logo`, fd, { enhance: false });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinic", clinicId] });
      void qc.invalidateQueries({ queryKey: ["clinics"] });
    },
  });
}

export function useCreateInvoiceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      encounterId?: string;
      operationId?: string;
      lines: Array<{ purpose: string; amountPaid: number }>;
    }) => apiPost<InvoiceDto>("/api/v1/invoices", body),
    onSuccess: (inv) => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["invoice", inv.id] });
    },
  });
}

export function clinicInvoiceLogoUrl(clinicId: string): string {
  return `/api/v1/clinics/${clinicId}/invoice-logo`;
}
