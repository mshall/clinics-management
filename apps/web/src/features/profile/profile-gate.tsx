import { Navigate } from "react-router-dom";
import { showNavItem } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";
import { ProfilePage } from "./profile-page";

export function ProfileGate() {
  const role = useAuthStore((s) => s.user?.role);
  if (!showNavItem(role, "profile")) return <Navigate to="/" replace />;
  return <ProfilePage />;
}
