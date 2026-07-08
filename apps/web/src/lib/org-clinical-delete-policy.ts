import { mapApiRole, type DemoRole } from "@/lib/roles";

/** Organization roles that may permanently delete appointments and encounters. */
export const ORG_CLINICAL_DELETE_DEMO_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "group_supervisor",
  "call_center",
]);

export function canOrgClinicalDelete(role: string | DemoRole | undefined | null): boolean {
  if (!role) return false;
  const raw = String(role).trim();
  if (ORG_CLINICAL_DELETE_DEMO_ROLES.has(raw as DemoRole)) return true;
  return ORG_CLINICAL_DELETE_DEMO_ROLES.has(mapApiRole(raw));
}
