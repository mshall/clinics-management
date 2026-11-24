import { CalendarDays, Stethoscope, UserRound, Sparkles, MoreHorizontal, MapPinned, ClipboardList, ShieldAlert, Pill } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { showNavItem } from "@/lib/nav-policy";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

const itemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors duration-150 [html[data-edition=nurse]_&]:min-h-16 [html[data-edition=nurse]_&]:text-[11px] [html[data-edition=nurse]_&_svg]:size-6",
    isActive ? "text-primary" : "text-muted-foreground",
  );

/**
 * UX-02 — phone bottom nav for Lite/physician primary tasks (Today, patients, encounters, Kiorex, more).
 */
export function MobileBottomNav() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  const employeePrivilegeGrants = useAuthStore((s) => s.user?.employeePrivilegeGrants);
  const allRoles = useAuthStore((s) => s.user?.roles);
  const planEntitlements = useAuthStore((s) => s.user?.entitlements);
  const planKey = useAuthStore((s) => s.user?.plan?.key ?? null);
  const showTab = (key: Parameters<typeof showNavItem>[1]) =>
    showNavItem(role, key, navTabKeys, roleNavTabKeys, employeePrivilegeGrants, allRoles, planEntitlements, planKey);

  // Kiorly Nurse edition: field-first bottom bar (Today route, care plans, MAR, safety, more). Same cached query EditionBoot uses.
  const hasToken = useAuthStore((s) => Boolean(s.accessToken));
  const ctx = useQuery({ queryKey: ["nurse", "context"], queryFn: () => apiGet<{ edition?: "CLINIC" | "NURSE" }>("/api/v1/nurse/context"), enabled: hasToken, staleTime: 5 * 60_000, retry: false });

  if (!role) return null;
  const nurse = ctx.data?.edition === "NURSE";

  const items: Array<{ to: string; label: string; icon: typeof CalendarDays; show: boolean; end?: boolean }> = nurse
    ? [
        { to: "/home-visits/today", label: t("nurse.nav.today"), icon: MapPinned, show: true },
        { to: "/nurse/care-plans", label: t("nurse.nav.carePlans"), icon: ClipboardList, show: true },
        { to: "/nurse/mar", label: t("nurse.nav.mar"), icon: Pill, show: true },
        { to: "/nurse/safety", label: t("nurse.nav.safety"), icon: ShieldAlert, show: true },
        { to: "/profile", label: t("nav.mobileMore", t("nav.profile")), icon: MoreHorizontal, show: true },
      ]
    : [
    { to: "/", label: t("nav.mobileToday", t("nav.dashboard")), icon: CalendarDays, show: showTab("dashboard"), end: true },
    { to: "/patients", label: t("nav.patients"), icon: UserRound, show: showTab("patients") },
    { to: "/encounters", label: t("nav.encounters"), icon: Stethoscope, show: showTab("encounters") },
    { to: "/kiorex", label: t("nav.kiorex", "Kiorex"), icon: Sparkles, show: showTab("clinics") || showTab("admin") },
    { to: "/profile", label: t("nav.mobileMore", t("nav.profile")), icon: MoreHorizontal, show: true },
  ];

  const visible = items.filter((i) => i.show).slice(0, 5);
  if (visible.length < 2) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      aria-label={t("nav.mobileBottom", "Primary")}
      data-testid="mobile-bottom-nav"
    >
      {visible.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={itemClass}>
          <item.icon className="size-5 shrink-0" aria-hidden />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
