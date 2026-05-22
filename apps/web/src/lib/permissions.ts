import type { DemoRole } from "@/lib/roles";

/** Roles that must not see the revenue ledger (group / finance / branch / clinic admin / physician). */
const NO_REVENUE: ReadonlySet<DemoRole> = new Set(["nurse", "receptionist", "hr_officer"]);

export function canViewRevenue(role: DemoRole | undefined): boolean {
  if (!role) return false;
  return !NO_REVENUE.has(role);
}

/** Global reporting range: dashboard, reports, and any screen that reads `useDateRangeStore` for API queries. */
export function showReportingPeriodBar(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/reports" || pathname.startsWith("/reports/")) return true;
  if (
    pathname === "/revenue" ||
    pathname === "/doctor-revenue" ||
    pathname === "/expenses" ||
    pathname === "/hr" ||
    pathname.startsWith("/hr/")
  ) {
    return true;
  }
  return false;
}
