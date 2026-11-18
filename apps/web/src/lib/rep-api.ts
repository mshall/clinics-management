import { apiGet, apiPost, apiPostFormData } from "@/lib/http";
import type { ImportEntity, ImportJobDto } from "@/lib/imports-api";

export type RepClinicDto = {
  tenantId: string;
  name: string;
  nameAr: string;
  status: "ACTIVE" | "PENDING_OWNER";
  createdByRep: boolean;
  createdAt: string;
  ownerConfirmedAt: string | null;
  activatedAt: string | null;
  planKey: string | null;
  subscriptionStatus: string | null;
  paid: boolean;
};

export type RepPortfolioDto = {
  rep: { code: string; displayName: string };
  totals: { signups: number; pendingOwner: number; activated: number; paid: number };
  clinics: RepClinicDto[];
};

export type RepCommissionDto = {
  period: string;
  lines: {
    currency: string;
    marketCode: string;
    commissionPercent: number;
    retentionDays: number;
    invoiceCount: number;
    eligibleCount: number;
    eligibleTotal: number;
    commission: number;
  }[];
};

export type RepCreateTenantBody = {
  marketId: string;
  phone: string;
  specialty: string;
  planKey: "LITE" | "PRO";
  clinic: { nameEn: string; nameAr?: string; city: string };
  owner: { displayName: string; email: string };
};

export function fetchRepPortfolio() {
  return apiGet<RepPortfolioDto>("/api/v1/rep/portfolio");
}

export function fetchRepCommission(period?: string) {
  return apiGet<RepCommissionDto>(`/api/v1/rep/commission${period ? `?period=${encodeURIComponent(period)}` : ""}`);
}

export function repCreateTenant(body: RepCreateTenantBody) {
  return apiPost<{ tenantId: string; status: string; otp: { expiresAt: string; channel: string } }>("/api/v1/rep/tenants", body);
}

export function repConfirmOwner(tenantId: string, code: string, legalAcceptances: { document: string; version: string }[]) {
  return apiPost<{ tenantId: string; status: string }>(`/api/v1/rep/tenants/${tenantId}/confirm`, { code, legalAcceptances });
}

export function repResendOtp(tenantId: string) {
  return apiPost<{ expiresAt: string }>(`/api/v1/rep/tenants/${tenantId}/resend-otp`, {});
}

export function repUploadImport(tenantId: string, entity: ImportEntity, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("entity", entity);
  return apiPostFormData<ImportJobDto>(`/api/v1/rep/tenants/${tenantId}/imports`, fd, { enhance: false });
}

export function repCommitImport(tenantId: string, jobId: string) {
  return apiPost<ImportJobDto>(`/api/v1/rep/tenants/${tenantId}/imports/${jobId}/commit`, {});
}
