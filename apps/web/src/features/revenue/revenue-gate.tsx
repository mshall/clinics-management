import { Navigate } from "react-router-dom";
import { showNavItem } from "@/lib/nav-policy";
import { canViewRevenue } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth-store";
import { RevenuePage } from "./revenue-page";

export function RevenueGate() {
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  if (!canViewRevenue(role) || !showNavItem(role, "revenue", navTabKeys, roleNavTabKeys)) return <Navigate to="/" replace />;
  return <RevenuePage />;
}
