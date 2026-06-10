import { ApiError } from "@/lib/http";

export type TenantRow = {
  id: string;
  name: string;
  nameAr: string;
  baseCurrency: string;
  defaultLocale: string;
  createdAt: string;
  counts: { users: number; clinics: number; patients: number };
};

export type TenantDetail = TenantRow & { defaultVisitFee: number };

export type PlatformUserRow = {
  id: string;
  tenantId: string | null;
  tenantName: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
  clinicIds: string[];
  clinics: { id: string; nameEn: string }[];
};

export type PlatformClinicRow = {
  id: string;
  tenantId: string;
  tenantName: string;
  parentClinicId: string | null;
  parentNameEn: string | null;
  nameEn: string;
  nameAr: string;
  city: string;
  country: string;
  kind: "parent" | "branch" | "standalone";
  phone?: string;
  email?: string;
};

export const ORG_USER_ROLES = [
  "GROUP_ADMIN",
  "CLINIC_ADMIN",
  "BRANCH_MANAGER",
  "PHYSICIAN",
  "NURSE",
  "RECEPTIONIST",
  "HR_OFFICER",
  "FINANCE_OFFICER",
  "CLINIC_ASSISTANT",
] as const;

export function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}
