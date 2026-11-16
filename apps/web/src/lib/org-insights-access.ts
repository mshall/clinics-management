import { canManageEmployees, type EmployeePrivilegeGrantSummary } from "@/lib/employee-manage-policy";
import { mapApiRole } from "@/lib/roles";

/** Mirrors API `assertInsightsAccess` roles (plus finance on HR module). */
const ORG_INSIGHTS_ROLES = new Set([
  "group_admin",
  "group_supervisor",
  "branch_manager",
  "clinic_admin",
  "hr_officer",
  "finance_officer",
]);

export function canViewOrgInsights(role: string | undefined): boolean {
  if (!role) return false;
  return ORG_INSIGHTS_ROLES.has(mapApiRole(role));
}

/** HR → Insights sub-tab: org insight roles + delegated employee managers using the HR module. */
export function canViewHrInsightsTab(
  role: string | undefined,
  grants?: EmployeePrivilegeGrantSummary[] | null,
): boolean {
  if (canViewOrgInsights(role)) return true;
  return canManageEmployees(role, grants);
}