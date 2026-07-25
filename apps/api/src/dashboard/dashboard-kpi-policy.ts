import { UserRole } from "@prisma/client";

export function canViewDashboardFinancialKpis(role: UserRole): boolean {
  return role === UserRole.GROUP_ADMIN || role === UserRole.CLINIC_ASSISTANT;
}

export function canViewDashboardHrKpis(role: UserRole): boolean {
  return role === UserRole.GROUP_ADMIN || role === UserRole.HR_OFFICER;
}
