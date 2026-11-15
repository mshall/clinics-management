/** Mirrors API `assertInsightsAccess` roles (plus HR on HR tab). */
const ORG_INSIGHTS_ROLES = new Set([
  "group_admin",
  "group_supervisor",
  "branch_manager",
  "clinic_admin",
  "hr_officer",
]);

export function canViewOrgInsights(role: string | undefined): boolean {
  return Boolean(role && ORG_INSIGHTS_ROLES.has(role));
}