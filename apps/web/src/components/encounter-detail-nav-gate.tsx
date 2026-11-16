import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { canAccessEncounterDetail, defaultHomeForRole } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";

/** Detail route only — appointments/front-desk may open check-in drafts without the Encounters list tab. */
export function EncounterDetailNavGate({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  const employeePrivilegeGrants = useAuthStore((s) => s.user?.employeePrivilegeGrants);
  if (!canAccessEncounterDetail(role, navTabKeys, roleNavTabKeys, employeePrivilegeGrants)) {
    return (
      <Navigate
        to={defaultHomeForRole(role, navTabKeys, roleNavTabKeys, employeePrivilegeGrants)}
        replace
      />
    );
  }
  return <>{children}</>;
}