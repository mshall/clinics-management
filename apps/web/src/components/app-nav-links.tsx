import {
  Activity,
  Building2,
  CalendarDays,
  ClipboardList,
  CircleDollarSign,
  Database,
  Globe2,
  Headphones,
  Hospital,
  LayoutDashboard,
  Receipt,
  Scissors,
  Settings,
  Shield,
  Sparkles,
  Stethoscope,
  BookOpen,
  Compass,
  Megaphone,
  Monitor,
  User,
  Users,
  UserPlus,
  Wallet,
  MapPinned,
  BarChart3,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Children, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { apiGet } from "@/lib/http";
import { showNavItem } from "@/lib/nav-policy";
import { canViewRevenue } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { tourGroupForRole } from "@/features/help/help-content";
import { NurseNavLinks } from "@/features/nurse/nurse-nav";
import { useAuthStore } from "@/stores/auth-store";
import { useHelpStore } from "@/stores/help-store";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
    isActive
      ? "bg-accent text-accent-foreground before:absolute before:inset-y-2 before:inset-s-0 before:w-[3px] before:rounded-full before:bg-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

const nestedNavClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative flex min-h-9 items-center gap-2.5 rounded-md py-1.5 pe-3 ps-9 text-sm font-medium transition-colors",
    isActive
      ? "bg-primary/12 text-foreground before:absolute before:inset-y-1.5 before:inset-s-3 before:w-[2px] before:rounded-full before:bg-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

function NavGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className={cn("space-y-0.5", className)}>
      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 first:pt-0">
        {label}
      </p>
      <div className="space-y-0.5">{items}</div>
    </div>
  );
}

type AdminSectionLink = {
  id: string;
  labelKey: string;
  fallback: string;
  icon: typeof Settings;
  visible: boolean;
};

export function AppNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  const employeePrivilegeGrants = useAuthStore((s) => s.user?.employeePrivilegeGrants);
  const allRoles = useAuthStore((s) => s.user?.roles);
  const planEntitlements = useAuthStore((s) => s.user?.entitlements);
  const planKey = useAuthStore((s) => s.user?.plan?.key ?? null);
  const showTab = (key: Parameters<typeof showNavItem>[1]) =>
    showNavItem(role, key, navTabKeys, roleNavTabKeys, employeePrivilegeGrants, allRoles, planEntitlements, planKey);
  const isPhysician = role === "physician";
  const isGroupAdmin = role === "group_admin";
  const isClinicAdmin = role === "clinic_admin";
  const isBranchManager = role === "branch_manager";
  const isGroupSupervisor = role === "group_supervisor";
  const isPlatformSuperAdmin = Boolean(useAuthStore((s) => s.user?.platformSuperAdmin));
  const isLitePlan = planKey?.toUpperCase() === "LITE";
  const canViewInsights =
    isGroupAdmin ||
    isClinicAdmin ||
    isBranchManager ||
    isGroupSupervisor ||
    role === "hr_officer" ||
    role === "finance_officer";
  const clinicScopedAdmin = isClinicAdmin || isBranchManager;

  const hasToken = useAuthStore((s) => Boolean(s.accessToken));
  const orgCtx = useQuery({
    queryKey: ["nurse", "context"],
    queryFn: () =>
      apiGet<{ edition?: "CLINIC" | "NURSE"; kind?: "SOLO" | "AGENCY" | null; features: Record<string, boolean> }>(
        "/api/v1/nurse/context",
      ),
    enabled: hasToken,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const homeVisitsOn = orgCtx.data?.features?.["clinic.home_visits"] === true;
  const showRevenue = canViewRevenue(role) && showTab("revenue");
  const showPlatformNav =
    showTab("platform") ||
    showTab("platform_organizations") ||
    showTab("platform_insights") ||
    showTab("platform_markets") ||
    showTab("platform_users") ||
    showTab("platform_clinics");

  const signedIn = Boolean(role);
  const adminSection = useMemo(() => new URLSearchParams(search).get("section") ?? "", [search]);
  const adminActive = pathname === "/admin" || pathname.startsWith("/admin/");

  const adminSectionLinks: AdminSectionLink[] = useMemo(() => {
    if (!showTab("admin") || isLitePlan) return [];
    if (clinicScopedAdmin) {
      return [
        {
          id: "staff",
          labelKey: "admin.tabStaffOnboarding",
          fallback: "Staff onboarding",
          icon: UserPlus,
          visible: true,
        },
        {
          id: "organization",
          labelKey: "admin.tabOrganization",
          fallback: "Organization & settings",
          icon: Building2,
          visible: isClinicAdmin,
        },
        {
          id: "governance",
          labelKey: "admin.tabGovernance",
          fallback: "Governance",
          icon: Shield,
          visible: true,
        },
        {
          id: "insights",
          labelKey: "admin.tabInsights",
          fallback: "Insights & performance",
          icon: BarChart3,
          visible: canViewInsights,
        },
      ];
    }
    return [
      {
        id: "clinics",
        labelKey: "admin.tabClinics",
        fallback: "Clinics & tenants",
        icon: Hospital,
        visible: true,
      },
      {
        id: "users",
        labelKey: "admin.tabOrgUsers",
        fallback: "Organization users",
        icon: Users,
        visible: isGroupAdmin,
      },
      {
        id: "patients",
        labelKey: "admin.tabOrgPatients",
        fallback: "Organization patients",
        icon: Users,
        visible: isGroupAdmin,
      },
      {
        id: "organization",
        labelKey: "admin.tabOrganization",
        fallback: "Organization & settings",
        icon: Building2,
        visible: true,
      },
      {
        id: "data",
        labelKey: "admin.tabDataExplorer",
        fallback: "Data explorer",
        icon: Database,
        visible: isGroupAdmin || isPlatformSuperAdmin,
      },
      {
        id: "governance",
        labelKey: "admin.tabGovernance",
        fallback: "Governance",
        icon: Shield,
        visible: true,
      },
      {
        id: "insights",
        labelKey: "admin.tabInsights",
        fallback: "Insights & performance",
        icon: BarChart3,
        visible: canViewInsights,
      },
    ];
  }, [
    canViewInsights,
    clinicScopedAdmin,
    isClinicAdmin,
    isGroupAdmin,
    isLitePlan,
    isPlatformSuperAdmin,
    showTab,
  ]);

  const go = () => onNavigate?.();
  const showNetwork = showTab("clinics") || showTab("admin");
  const setTourOpen = useHelpStore((s) => s.setTourOpen);
  const canTour = Boolean(tourGroupForRole(role));
  const visibleAdminLinks = adminSectionLinks.filter((l) => l.visible);
  const hasAdminChildren = visibleAdminLinks.length > 0;
  const defaultAdminSection = clinicScopedAdmin ? "staff" : "clinics";
  const resolvedAdminSection = adminSection || defaultAdminSection;

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-0.5 p-3" aria-label={t("nav.menu")}>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {showPlatformNav ? (
          <NavGroup label={t("nav.groupPlatform", "Platform")}>
            {showTab("platform") ? (
              <NavLink to="/platform" end className={navClass} onClick={go}>
                <Globe2 className="size-4 shrink-0" />
                {t("nav.platformOverview")}
              </NavLink>
            ) : null}
            {showTab("platform_insights") ? (
              <NavLink to="/platform/insights" className={navClass} onClick={go}>
                <LayoutDashboard className="size-4 shrink-0" />
                {t("nav.platformInsights", "Insights")}
              </NavLink>
            ) : null}
            {showTab("platform_markets") ? (
              <NavLink to="/platform/markets" className={navClass} onClick={go}>
                <Globe2 className="size-4 shrink-0" />
                {t("nav.platformMarkets", "Market launch")}
              </NavLink>
            ) : null}
            {showTab("platform_markets") ? (
              <NavLink to="/platform/drug-datasets" className={navClass} onClick={go}>
                <Globe2 className="size-4 shrink-0" />
                {t("nav.platformDrugDatasets", "Drug datasets")}
              </NavLink>
            ) : null}
            {showTab("platform_markets") ? (
              <NavLink to="/platform/plans" className={navClass} onClick={go}>
                <Globe2 className="size-4 shrink-0" />
                {t("nav.platformPlans", "Plans & pricing")}
              </NavLink>
            ) : null}
            {showTab("platform_markets") ? (
              <NavLink to="/platform/kiorex-rates" className={navClass} onClick={go}>
                <Globe2 className="size-4 shrink-0" />
                {t("nav.platformKiorex", "Kiorex fees")}
              </NavLink>
            ) : null}
            {showTab("platform_markets") ? (
              <NavLink to="/platform/verifications" className={navClass} onClick={go}>
                <Globe2 className="size-4 shrink-0" />
                {t("nav.platformVerifications", "Doctor verification")}
              </NavLink>
            ) : null}
            {showTab("platform_markets") ? (
              <NavLink to="/platform/disputes" className={navClass} onClick={go}>
                <Globe2 className="size-4 shrink-0" />
                {t("nav.platformDisputes", "Commission disputes")}
              </NavLink>
            ) : null}
            {showTab("platform_organizations") ? (
              <NavLink to="/platform/organizations" className={navClass} onClick={go}>
                <Building2 className="size-4 shrink-0" />
                {t("nav.platformOrganizations")}
              </NavLink>
            ) : null}
            {showTab("platform_users") ? (
              <NavLink to="/platform/users" className={navClass} onClick={go}>
                <Users className="size-4 shrink-0" />
                {t("nav.platformUsers")}
              </NavLink>
            ) : null}
            {showTab("platform_clinics") ? (
              <NavLink to="/platform/clinics" className={navClass} onClick={go}>
                <Hospital className="size-4 shrink-0" />
                {t("nav.platformClinics")}
              </NavLink>
            ) : null}
          </NavGroup>
        ) : null}

        {orgCtx.data?.edition === "NURSE" && signedIn && !showPlatformNav ? (
          <NavGroup label={t("nav.groupClinical", "Clinical care")}>
            <NurseNavLinks agency={orgCtx.data.kind === "AGENCY"} navClass={navClass} onNavigate={onNavigate} />
          </NavGroup>
        ) : null}

        {!showPlatformNav && orgCtx.data?.edition !== "NURSE" ? (
          <>
            <NavGroup label={t("nav.groupOverview", "Overview")}>
              {showTab("dashboard") ? (
                <NavLink to="/" end className={navClass} onClick={go}>
                  <LayoutDashboard className="size-4 shrink-0" />
                  {t("nav.dashboard")}
                </NavLink>
              ) : null}
            </NavGroup>

            <NavGroup label={t("nav.groupClinical", "Clinical care")}>
              {showTab("patients") ? (
                <NavLink to="/patients" className={navClass} onClick={go}>
                  <Users className="size-4 shrink-0" />
                  {t("nav.patients")}
                </NavLink>
              ) : null}
              {showTab("encounters") ? (
                <NavLink to="/encounters" className={navClass} onClick={go}>
                  <Stethoscope className="size-4 shrink-0" />
                  {t("nav.encounters")}
                </NavLink>
              ) : null}
              {showTab("appointments") ? (
                <>
                  <NavLink to="/appointments" className={navClass} onClick={go}>
                    <CalendarDays className="size-4 shrink-0" />
                    {isPhysician ? t("appointments.myNav", "My appointments") : t("nav.appointments")}
                  </NavLink>
                  {homeVisitsOn && isPhysician ? (
                    <NavLink to="/home-visits/today" className={navClass} onClick={go}>
                      <MapPinned className="size-4 shrink-0" />
                      {t("homeVisits.today")}
                    </NavLink>
                  ) : null}
                  {!isPhysician ? (
                    <NavLink
                      to="/front-desk/board"
                      className={({ isActive }) =>
                        nestedNavClass({
                          isActive: isActive || pathname.startsWith("/front-desk/"),
                        })
                      }
                      onClick={go}
                    >
                      <Monitor className="size-4 shrink-0" />
                      {t("nav.frontDeskBoard", "Front desk board")}
                    </NavLink>
                  ) : null}
                </>
              ) : null}
              {showTab("operations") ? (
                <NavLink to="/operations" className={navClass} onClick={go}>
                  <Scissors className="size-4 shrink-0" />
                  {t("nav.operations")}
                </NavLink>
              ) : null}
            </NavGroup>

            <NavGroup label={t("nav.groupNetwork", "Network")}>
              {showTab("clinics") ? (
                <NavLink to="/clinics" className={navClass} onClick={go}>
                  <Building2 className="size-4 shrink-0" />
                  {t("nav.clinics")}
                </NavLink>
              ) : null}
              {showNetwork ? (
                <NavLink
                  to="/kiorex"
                  className={({ isActive }) =>
                    navClass({ isActive: isActive && !pathname.startsWith("/kiorex/growth") })
                  }
                  onClick={go}
                >
                  <Sparkles className="size-4 shrink-0" />
                  {t("nav.kiorex", "Kiorex")}
                </NavLink>
              ) : null}
              {showNetwork ? (
                <NavLink to="/kiorex/growth" className={navClass} onClick={go} data-testid="nav-growth">
                  <Megaphone className="size-4 shrink-0" />
                  {t("nav.growth", "Growth & Marketing")}
                </NavLink>
              ) : null}
            </NavGroup>

            <NavGroup label={t("nav.groupFinance", "Finance")}>
              {showTab("expenses") ? (
                <NavLink to="/expenses" className={navClass} onClick={go}>
                  <Wallet className="size-4 shrink-0" />
                  {t("nav.expenses")}
                </NavLink>
              ) : null}
              {showRevenue ? (
                <NavLink to="/revenue" className={navClass} onClick={go}>
                  <Receipt className="size-4 shrink-0" />
                  {t("nav.revenue")}
                </NavLink>
              ) : null}
              {showTab("doctor_revenue") ? (
                <NavLink to="/doctor-revenue" className={navClass} onClick={go}>
                  <CircleDollarSign className="size-4 shrink-0" />
                  {t("nav.doctorRevenue")}
                </NavLink>
              ) : null}
            </NavGroup>

            <NavGroup label={t("nav.groupWorkforce", "Workforce & insights")}>
              {showTab("hr") ? (
                <NavLink
                  to="/hr"
                  className={({ isActive }) =>
                    navClass({ isActive: isActive || pathname === "/hr" || pathname.startsWith("/hr/") })
                  }
                  onClick={go}
                >
                  <ClipboardList className="size-4 shrink-0" />
                  {t("nav.hr")}
                </NavLink>
              ) : null}
              {showTab("reports") ? (
                <NavLink to="/reports" className={navClass} onClick={go}>
                  <Activity className="size-4 shrink-0" />
                  {t("nav.reports")}
                </NavLink>
              ) : null}
              {showTab("customer_support") ? (
                <NavLink to="/customer-support" className={navClass} onClick={go}>
                  <Headphones className="size-4 shrink-0" />
                  {t("nav.customerSupport", "Customer support")}
                </NavLink>
              ) : null}
            </NavGroup>

            <NavGroup label={t("nav.groupAdministration", "Administration")}>
              {showTab("admin") ? (
                <>
                  <NavLink
                    to={hasAdminChildren ? `/admin?section=${defaultAdminSection}` : "/admin"}
                    end
                    className={() =>
                      navClass({
                        isActive: adminActive && !hasAdminChildren,
                      })
                    }
                    onClick={go}
                  >
                    <Settings className="size-4 shrink-0" />
                    {t("nav.admin")}
                  </NavLink>
                  {visibleAdminLinks.map((l) => {
                    const Icon = l.icon;
                    const to = `/admin?section=${l.id}`;
                    const isActive = adminActive && resolvedAdminSection === l.id;
                    return (
                      <NavLink
                        key={l.id}
                        to={to}
                        className={() => nestedNavClass({ isActive })}
                        onClick={go}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        {t(l.labelKey, l.fallback)}
                      </NavLink>
                    );
                  })}
                </>
              ) : null}
            </NavGroup>

            <NavGroup label={t("nav.groupAccount", "Account")}>
              {showTab("profile") ? (
                <NavLink to="/profile" className={navClass} onClick={go}>
                  <User className="size-4 shrink-0" />
                  {t("nav.profile")}
                </NavLink>
              ) : null}
            </NavGroup>
          </>
        ) : null}

        {/* Clinic edition can still show dashboard/profile when platform nav is also present */}
        {showPlatformNav ? (
          <NavGroup label={t("nav.groupAccount", "Account")}>
            {showTab("profile") ? (
              <NavLink to="/profile" className={navClass} onClick={go}>
                <User className="size-4 shrink-0" />
                {t("nav.profile")}
              </NavLink>
            ) : null}
          </NavGroup>
        ) : null}
      </div>

      {signedIn ? (
        <div className="mt-auto shrink-0 space-y-1.5 border-t border-border pt-3">
          {canTour ? (
            <button
              type="button"
              className={cn(navClass({ isActive: false }), "w-full border border-border/80 bg-muted/30 hover:bg-muted/60")}
              data-testid="nav-quick-tour"
              onClick={() => {
                setTourOpen(true);
                go();
              }}
            >
              <Compass className="size-4 shrink-0" />
              {t("nav.quickTour", "Quick tour")}
            </button>
          ) : null}
          <NavLink
            to="/guide"
            className={({ isActive }) =>
              cn(navClass({ isActive }), "border border-primary/20 bg-primary/5 hover:bg-primary/10")
            }
            onClick={go}
          >
            <BookOpen className="size-4 shrink-0" />
            {t("nav.guideBook")}
          </NavLink>
        </div>
      ) : null}
    </nav>
  );
}
