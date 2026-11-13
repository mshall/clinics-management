import { UserRole } from "@prisma/client";
import { canViewDashboardHrKpis } from "../dashboard/dashboard-kpi-policy";

/** Who may see organization employee headcount in the assistant. */
export function canAssistantQueryEmployeeCount(navKeys: string[], role: UserRole): boolean {
  if (navKeys.includes("hr") || navKeys.includes("admin")) return true;
  if (navKeys.includes("dashboard") && canViewDashboardHrKpis(role)) return true;
  return false;
}
