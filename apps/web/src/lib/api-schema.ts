import type { components } from "@/lib/openapi-types.gen";

export type { components, paths, webhooks } from "@/lib/openapi-types.gen";

export type PatientDto = components["schemas"]["PatientDto"] & {
  homeBranchId?: string | null;
  nationalId?: string | null;
};
export type ClinicDto = components["schemas"]["ClinicDto"];
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
export type AuthUserDto = components["schemas"]["AuthUserDto"];
