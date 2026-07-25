import { isOrgWideUserRole } from "@/features/platform/platform-shared";

const CLINIC_ADMIN_FORBIDDEN_RBAC_ROLES = new Set(["GROUP_ADMIN", "CLINIC_ADMIN"]);

/** Whether a clinic admin may edit sidebar permissions for this user (clinic-scoped staff only). */
export function canClinicAdminManageUserRbac(
  user: { role: string; clinicIds?: string[] | null },
  viewerClinicIds: string[],
): boolean {
  if (CLINIC_ADMIN_FORBIDDEN_RBAC_ROLES.has(user.role)) return false;
  if (isOrgWideUserRole(user.role)) return false;
  const targetClinics = user.clinicIds ?? [];
  if (!targetClinics.length || !viewerClinicIds.length) return false;
  return targetClinics.some((id) => viewerClinicIds.includes(id));
}
