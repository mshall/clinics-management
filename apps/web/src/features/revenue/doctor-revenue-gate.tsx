import { Navigate } from "react-router-dom";
import { showNavItem } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";
import { DoctorRevenuePage } from "./doctor-revenue-page";

export function DoctorRevenueGate() {
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  if (!showNavItem(role, "doctor_revenue", navTabKeys, roleNavTabKeys)) return <Navigate to="/" replace />;
  return <DoctorRevenuePage />;
}
