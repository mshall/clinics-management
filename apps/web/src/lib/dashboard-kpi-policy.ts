import type { DemoRole } from "@/lib/roles";

/** Revenue, expenses, and net profit cards on the dashboard overview. */
export function canViewDashboardFinancialKpis(role: DemoRole | undefined): boolean {
  return role === "group_admin" || role === "clinic_assistant";
}

/** HR employees and user-accounts cards on the dashboard overview. */
export function canViewDashboardHrKpis(role: DemoRole | undefined): boolean {
  return role === "group_admin" || role === "hr_officer";
}
