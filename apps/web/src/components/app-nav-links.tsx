import {
  Activity,
  Building2,
  CalendarDays,
  ClipboardList,
  CircleDollarSign,
  Globe2,
  Hospital,
  LayoutDashboard,
  Receipt,
  Scissors,
  Settings,
  Stethoscope,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { showNavItem } from "@/lib/nav-policy";
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
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  const employeePrivilegeGrants = useAuthStore((s) => s.user?.employeePrivilegeGrants);
  const showTab = (key: Parameters<typeof showNavItem>[1]) =>
    showNavItem(role, key, navTabKeys, roleNavTabKeys, employeePrivilegeGrants);
  const isPhysician = role === "physician";
  const showRevenue = canViewRevenue(role) && showTab("revenue");
  const showPlatformNav =
    showTab("platform") ||
    showTab("platform_organizations") ||
    showTab("platform_users") ||
    showTab("platform_clinics");

  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {showPlatformNav ? (
        <>
          {showTab("platform") ? (
            <NavLink to="/platform" end className={navClass} onClick={() => onNavigate?.()}>
              <Globe2 className="size-4 shrink-0" />
              {t("nav.platformOverview")}
            </NavLink>
          ) : null}
          {showTab("platform_organizations") ? (
            <NavLink to="/platform/organizations" className={navClass} onClick={() => onNavigate?.()}>
              <Building2 className="size-4 shrink-0" />
              {t("nav.platformOrganizations")}
            </NavLink>
          ) : null}
          {showTab("platform_users") ? (
            <NavLink to="/platform/users" className={navClass} onClick={() => onNavigate?.()}>
              <Users className="size-4 shrink-0" />
              {t("nav.platformUsers")}
            </NavLink>
          ) : null}
          {showTab("platform_clinics") ? (
            <NavLink to="/platform/clinics" className={navClass} onClick={() => onNavigate?.()}>
              <Hospital className="size-4 shrink-0" />
              {t("nav.platformClinics")}
            </NavLink>
          ) : null}
        </>
      ) : null}
      {showTab("dashboard") ? (
        <NavLink to="/" end className={navClass} onClick={() => onNavigate?.()}>
          <LayoutDashboard className="size-4 shrink-0" />
          {t("nav.dashboard")}
        </NavLink>
      ) : null}
      {showTab("patients") ? (
        <NavLink to="/patients" className={navClass} onClick={() => onNavigate?.()}>
          <Users className="size-4 shrink-0" />
          {t("nav.patients")}
        </NavLink>
      ) : null}
      {showTab("encounters") ? (
        <NavLink to="/encounters" className={navClass} onClick={() => onNavigate?.()}>
          <Stethoscope className="size-4 shrink-0" />
          {t("nav.encounters")}
        </NavLink>
      ) : null}
      {showTab("appointments") ? (
        <NavLink to="/appointments" className={navClass} onClick={() => onNavigate?.()}>
          <CalendarDays className="size-4 shrink-0" />
          {isPhysician ? t("appointments.myNav", "My appointments") : t("nav.appointments")}
        </NavLink>
      ) : null}
      {showTab("operations") ? (
        <NavLink to="/operations" className={navClass} onClick={() => onNavigate?.()}>
          <Scissors className="size-4 shrink-0" />
          {t("nav.operations")}
        </NavLink>
      ) : null}
      {showTab("clinics") ? (
        <NavLink to="/clinics" className={navClass} onClick={() => onNavigate?.()}>
          <Building2 className="size-4 shrink-0" />
          {t("nav.clinics")}
        </NavLink>
      ) : null}
      {showTab("expenses") ? (
        <NavLink to="/expenses" className={navClass} onClick={() => onNavigate?.()}>
          <Wallet className="size-4 shrink-0" />
          {t("nav.expenses")}
        </NavLink>
      ) : null}
      {showRevenue ? (
        <NavLink to="/revenue" className={navClass} onClick={() => onNavigate?.()}>
          <Receipt className="size-4 shrink-0" />
          {t("nav.revenue")}
        </NavLink>
      ) : null}
      {showTab("hr") ? (
        <NavLink
          to="/hr"
          className={({ isActive }) => navClass({ isActive: isActive || pathname === "/hr" || pathname.startsWith("/hr/") })}
          onClick={() => onNavigate?.()}
        >
          <ClipboardList className="size-4 shrink-0" />
          {t("nav.hr")}
        </NavLink>
      ) : null}
      {showTab("doctor_revenue") ? (
        <NavLink to="/doctor-revenue" className={navClass} onClick={() => onNavigate?.()}>
          <CircleDollarSign className="size-4 shrink-0" />
          {t("nav.doctorRevenue")}
        </NavLink>
      ) : null}
      {showTab("reports") ? (
        <NavLink to="/reports" className={navClass} onClick={() => onNavigate?.()}>
          <Activity className="size-4 shrink-0" />
          {t("nav.reports")}
        </NavLink>
      ) : null}
      {showTab("profile") ? (
        <NavLink to="/profile" className={navClass} onClick={() => onNavigate?.()}>
          <User className="size-4 shrink-0" />
          {t("nav.profile")}
        </NavLink>
      ) : null}
      {showTab("admin") ? (
        <NavLink to="/admin" className={navClass} onClick={() => onNavigate?.()}>
          <Settings className="size-4 shrink-0" />
          {t("nav.admin")}
        </NavLink>
      ) : null}
    </nav>
  );
}
