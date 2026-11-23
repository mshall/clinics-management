import type { ClinicalSpecialty } from "@prisma/client";

export type TenantOrgIdentity = {
  tenantName: string | null;
  tenantNameAr: string | null;
  clinicalSpecialty: ClinicalSpecialty | null;
  tenantBaseCurrency: string | null;
  operationAcquisitionRequired: boolean;
};

/** Pick a single specialty for the org chrome: unanimous clinic specialty, else POLYCLINIC when mixed. */
export function resolveOrgClinicalSpecialty(
  clinicSpecialties: Array<ClinicalSpecialty | null | undefined>,
): ClinicalSpecialty | null {
  const values = clinicSpecialties.filter((s): s is ClinicalSpecialty => Boolean(s));
  if (values.length === 0) return null;
  const unique = new Set(values);
  if (unique.size === 1) return values[0]!;
  return "POLYCLINIC";
}
