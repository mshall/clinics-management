import { Navigate } from "react-router-dom";
import { showNavItem } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";
import { ProfilePage } from "./profile-page";

export function ProfileGate() {
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  if (!showNavItem(role, "profile", navTabKeys, roleNavTabKeys)) return <Navigate to="/" replace />;
  return <ProfilePage />;
}
