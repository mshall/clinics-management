import { Navigate } from "react-router-dom";
import { canViewClinicRevenue } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth-store";
import { ClinicRevenuePage } from "./clinic-revenue-page";

export function ClinicRevenueGate() {
  const role = useAuthStore((s) => s.user?.role);
  if (!canViewClinicRevenue(role)) return <Navigate to="/" replace />;
  return <ClinicRevenuePage />;
}
