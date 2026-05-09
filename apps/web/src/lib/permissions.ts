import type { DemoRole } from "@/lib/roles";

/** Roles that must not see the global revenue ledger (encounter-linked fees live here). */
const NO_REVENUE: ReadonlySet<DemoRole> = new Set([
  "nurse",
  "receptionist",
  "hr_officer",
  "clinic_assistant",
  "clinic_admin",
]);

export function canViewRevenue(role: DemoRole | undefined): boolean {
  if (!role) return false;
  return !NO_REVENUE.has(role);
}

export function canViewClinicRevenue(role: DemoRole | undefined): boolean {
  if (!role) return false;
  return role === "clinic_admin" || role === "group_admin";
}

/** Global reporting range: dashboard KPIs and reports only. */
export function showReportingPeriodBar(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/reports" || pathname.startsWith("/reports/")) return true;
  return false;
}
