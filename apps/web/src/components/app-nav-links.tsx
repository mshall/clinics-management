import {
  Activity,
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Receipt,
  Settings,
  Stethoscope,
  Users,
  Wallet,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { canViewRevenue } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  );

export function AppNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const role = useAuthStore((s) => s.user?.role);
  const showRevenue = canViewRevenue(role);

  return (
    <nav className="flex flex-col gap-0.5 p-3">
      <NavLink to="/" end className={navClass} onClick={() => onNavigate?.()}>
        <LayoutDashboard className="size-4 shrink-0" />
        {t("nav.dashboard")}
      </NavLink>
      <NavLink to="/patients" className={navClass} onClick={() => onNavigate?.()}>
        <Users className="size-4 shrink-0" />
        {t("nav.patients")}
      </NavLink>
      <NavLink to="/encounters" className={navClass} onClick={() => onNavigate?.()}>
        <Stethoscope className="size-4 shrink-0" />
        {t("nav.encounters")}
      </NavLink>
      <NavLink to="/appointments" className={navClass} onClick={() => onNavigate?.()}>
        <CalendarDays className="size-4 shrink-0" />
        {t("nav.appointments")}
      </NavLink>
      <NavLink to="/clinics" className={navClass} onClick={() => onNavigate?.()}>
        <Building2 className="size-4 shrink-0" />
        {t("nav.clinics")}
      </NavLink>
      <NavLink to="/expenses" className={navClass} onClick={() => onNavigate?.()}>
        <Wallet className="size-4 shrink-0" />
        {t("nav.expenses")}
      </NavLink>
      {showRevenue ? (
        <NavLink to="/revenue" className={navClass} onClick={() => onNavigate?.()}>
          <Receipt className="size-4 shrink-0" />
          {t("nav.revenue")}
        </NavLink>
      ) : null}
      <NavLink
        to="/hr"
        className={({ isActive }) =>
          navClass({ isActive: isActive || pathname === "/hr" || pathname.startsWith("/hr/") })
        }
        onClick={() => onNavigate?.()}
      >
        <ClipboardList className="size-4 shrink-0" />
        {t("nav.hr")}
      </NavLink>
      <NavLink to="/reports" className={navClass} onClick={() => onNavigate?.()}>
        <Activity className="size-4 shrink-0" />
        {t("nav.reports")}
      </NavLink>
      <NavLink to="/admin" className={navClass} onClick={() => onNavigate?.()}>
        <Settings className="size-4 shrink-0" />
        {t("nav.admin")}
      </NavLink>
    </nav>
  );
}
