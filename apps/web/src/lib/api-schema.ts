import type { components } from "@/lib/openapi-types.gen";

export type { components, paths, webhooks } from "@/lib/openapi-types.gen";

export type PatientDto = components["schemas"]["PatientDto"] & {
  dob?: string | null;
  homeBranchId?: string | null;
  nationalId?: string | null;
  hasNationalIdDoc?: boolean;
  acquisitionChannel?: string | null;
  acquisitionReferralName?: string | null;
  acquisitionOtherDetail?: string | null;
  documents?: PatientDocumentDto[];
};

export type PatientDocumentDto = {
  id: string;
  description: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};
export type ClinicDto = components["schemas"]["ClinicDto"] & {
  parentNameEn?: string | null;
};
/** OpenAPI snapshot + fields added in API after last codegen */
export type GroupOverviewKpisDto = components["schemas"]["GroupOverviewKpisDto"] & {
  netProfitMonth?: number;
  employeeCount?: number;
  periodFrom?: string;
  periodTo?: string;
  encountersPeriodTotal?: number;
  appointmentsPeriodTotal?: number;
};
export type LoginResponseDto = components["schemas"]["LoginResponseDto"];
export type AuthUserDto = components["schemas"]["AuthUserDto"] & {
  navTabKeys?: string[] | null;
  roleNavTabKeys?: string[] | null;
  platformSuperAdmin?: boolean;
  hasAvatar?: boolean;
};
