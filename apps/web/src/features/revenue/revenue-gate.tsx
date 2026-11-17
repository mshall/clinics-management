import { Navigate } from "react-router-dom";
import { defaultHomeForRole } from "@/lib/nav-policy";
import { canViewRevenue } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth-store";
import { NavGate } from "@/components/nav-gate";
import { RevenuePage } from "./revenue-page";

/** Revenue module — plan/entitlement via {@link NavGate}; role via `canViewRevenue`. */
export function RevenueGate() {
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  const employeePrivilegeGrants = useAuthStore((s) => s.user?.employeePrivilegeGrants);

  if (!canViewRevenue(role)) {
    return (
      <Navigate
        to={defaultHomeForRole(role, navTabKeys, roleNavTabKeys, employeePrivilegeGrants)}
        replace
      />
    );
  }

  return (
    <NavGate tab="revenue">
      <RevenuePage />
    </NavGate>
  );
}
