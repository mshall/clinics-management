import { Navigate } from "react-router-dom";
import { showNavItem } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";
import { DoctorRevenuePage } from "./doctor-revenue-page";

export function DoctorRevenueGate() {
  const role = useAuthStore((s) => s.user?.role);
  if (!showNavItem(role, "doctor_revenue")) return <Navigate to="/" replace />;
  return <DoctorRevenuePage />;
}
