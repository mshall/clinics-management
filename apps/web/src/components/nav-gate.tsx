import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { defaultHomeForRole, showNavItem, type NavItemKey } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";

export function NavGate({ tab, children }: { tab: NavItemKey; children: ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  if (!showNavItem(role, tab, navTabKeys, roleNavTabKeys)) {
    return <Navigate to={defaultHomeForRole(role, navTabKeys, roleNavTabKeys)} replace />;
  }
  return <>{children}</>;
}
