import { Navigate } from "react-router-dom";
import { canViewRevenue } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth-store";
import { RevenuePage } from "./revenue-page";

export function RevenueGate() {
  const role = useAuthStore((s) => s.user?.role);
  if (!canViewRevenue(role)) return <Navigate to="/" replace />;
  return <RevenuePage />;
}
