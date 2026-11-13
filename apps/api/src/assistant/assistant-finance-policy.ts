import { UserRole } from "@prisma/client";

const LEDGER_REVENUE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.BRANCH_MANAGER,
  UserRole.FINANCE_OFFICER,
  UserRole.CLINIC_ADMIN,
  UserRole.CLINIC_ASSISTANT,
  UserRole.PHYSICIAN,
]);

export function canAssistantQueryOrgRevenue(navKeys: string[], role: UserRole): boolean {
  if (!LEDGER_REVENUE_ROLES.has(role)) return false;
  return navKeys.includes("revenue") || navKeys.includes("reports") || navKeys.includes("dashboard");
}

export function canAssistantQueryPersonalRevenue(navKeys: string[], role: UserRole): boolean {
  return role === UserRole.PHYSICIAN && navKeys.includes("doctor_revenue");
}

export function canAssistantQueryExpenses(navKeys: string[], role: UserRole): boolean {
  if (!LEDGER_REVENUE_ROLES.has(role)) return false;
  return navKeys.includes("expenses") || navKeys.includes("reports") || navKeys.includes("dashboard");
}
