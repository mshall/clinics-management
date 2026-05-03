import type { DemoRole } from "@/lib/roles";

/** Roles that must not see revenue / financial ledger in the demo RBAC model. */
const NO_REVENUE: ReadonlySet<DemoRole> = new Set(["nurse", "receptionist", "hr_officer"]);

export function canViewRevenue(role: DemoRole | undefined): boolean {
  if (!role) return false;
  return !NO_REVENUE.has(role);
}

/** Global reporting range: dashboard KPIs and reports only. */
export function showReportingPeriodBar(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/reports" || pathname.startsWith("/reports/")) return true;
  return false;
}
