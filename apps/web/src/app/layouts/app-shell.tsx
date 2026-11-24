import { ArrowLeftRight, CircleHelp, LogOut, Menu, Rows3, Rows4 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { showReportingPeriodBar } from "@/lib/permissions";
import { AppNavLinks } from "@/components/app-nav-links";
import { DateRangeBar } from "@/components/date-range-bar";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { OrgIdentityBar } from "@/components/org-identity-bar";
import { useAuthStore } from "@/stores/auth-store";
import { formatUserRole } from "@/lib/locale-display";
import { homeUrlFromEnv, switchWorkspaceHref } from "@/lib/kiorly-home";
import { RoleAssistantWidget } from "@/features/assistant/role-assistant-widget";
import { GlobalPatientSearch } from "@/components/global-patient-search";
import { DeployVersionBanner } from "@/components/deploy-version-banner";
import { LegalAcceptanceBanner } from "@/components/legal-acceptance-banner";
import { TrialBanner } from "@/components/trial-banner";
import { DunningBanner } from "@/components/dunning-banner";
import { SetupContextBar } from "@/features/onboarding/setup-context-bar";
import { UpgradePaywallModal } from "@/components/upgrade-paywall-modal";
import { FirstRunTour } from "@/features/help/first-run-tour";
import { HelpDrawer } from "@/features/help/help-drawer";
import { useHelpStore } from "@/stores/help-store";
import { PwaInstallPrompt } from "@/features/pwa/pwa-install-prompt";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { KiorlyMark } from "@/brand/ui-kit";
import { BrandLockup } from "@/components/brand-lockup";
import { useNurseEditionDom } from "@/lib/use-nurse-edition-dom";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { useDensityStore } from "@/stores/density-store";
import { useA11yAutoFixes } from "@/lib/a11y-autofix";

function orgPlanLabel(planKey: string, t: (key: string, fallback: string) => string): string {
  const keys: Record<string, [string, string]> = {
    LITE: ["plans.names.LITE", "Lite"],
    PRO: ["plans.names.PRO", "Pro"],
    CLINIC: ["plans.names.CLINIC", "Clinic"],
    ENTERPRISE: ["plans.names.ENTERPRISE", "Enterprise"],
    NURSE_LITE: ["plans.names.NURSE_LITE", "Nurse Lite"],
    NURSE_PRO: ["plans.names.NURSE_PRO", "Nurse Pro"],
    NURSE_AGENCY: ["plans.names.NURSE_AGENCY", "Nurse Agency"],
  };
  const pair = keys[planKey];
  return pair ? t(pair[0], pair[1]) : planKey;
}

export function AppShell() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openHelp = useHelpStore((s) => s.setDrawerOpen);
  useA11yAutoFixes();
  const nurseEdition = useNurseEditionDom();
  const switchHref = switchWorkspaceHref(homeUrlFromEnv({ VITE_KIORLY_HOME_URL: import.meta.env.VITE_KIORLY_HOME_URL as string | undefined, DEV: import.meta.env.DEV }));
  const density = useDensityStore((s) => s.density);
  const toggleDensity = useDensityStore((s) => s.toggle);
  const orgPlanKey = user?.tenantId && user.plan?.key ? user.plan.key : null;
  const orgName = useMemo(() => {
    if (!user?.tenantId) return null;
    const ar = i18n.language?.startsWith("ar");
    const nameAr = user.tenantNameAr?.trim();
    const nameEn = user.tenantName?.trim();
    if (ar && nameAr) return nameAr;
    return nameEn || nameAr || null;
  }, [user?.tenantId, user?.tenantName, user?.tenantNameAr, i18n.language]);
  const orgSpecialtyLabel = useMemo(() => {
    const key = user?.clinicalSpecialty?.trim();
    if (!key) return null;
    return t(`clinicalSpecialties.${key}`, key.replaceAll("_", " ").toLowerCase());
  }, [user?.clinicalSpecialty, t]);

  useEffect(() => {
    const syncNav = () => {
      if (useAuthStore.getState().accessToken) {
        void useAuthStore.getState().refreshSessionFromServer();
      }
    };
    if (useAuthStore.persist.hasHydrated()) syncNav();
    return useAuthStore.persist.onFinishHydration(syncNav);
  }, []);

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="sticky top-0 hidden h-screen min-h-0 w-60 shrink-0 border-e border-border bg-card md:flex md:flex-col">
        <div className="flex min-h-18 shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <BrandLockup />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <AppNavLinks />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <header className="sticky top-0 z-10 flex min-h-14 flex-nowrap items-center gap-1 border-b border-border bg-card/95 px-3 py-2 backdrop-blur-sm supports-backdrop-filter:bg-card/80 sm:gap-3 sm:px-4 md:h-14 md:flex-nowrap md:ps-6">
          <div className="flex min-w-0 items-center gap-1.5 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="kx-hdr" aria-label={t("common.menu")}>
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent className="p-0" aria-describedby={undefined}>
                <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
                <SheetHeader className="flex min-h-18 shrink-0 flex-row items-center gap-3 border-b border-border px-4">
                  <BrandLockup />
                </SheetHeader>
                <AppNavLinks onNavigate={() => setMobileOpen(false)} />
                <div data-kx-controls className="mt-auto flex shrink-0 items-center gap-2 border-t border-border p-3"><ThemeSwitcher /><LanguageSwitcher drawer /></div>
              </SheetContent>
            </Sheet>
            <span className="shrink-0 sm:hidden"><KiorlyMark size={30} nurse={nurseEdition} /></span>
            {/* When org identity is shown, skip brand wordmark on narrow screens to free space */}
            {!orgName ? (
              <span className="hidden min-w-0 overflow-hidden sm:block">
                <BrandLockup height={24} tagline={false} />
              </span>
            ) : null}
          </div>
          {orgName ? (
            <div className="ms-1 min-w-0 flex-1 basis-0 md:ms-0 md:max-w-md lg:max-w-xl xl:max-w-2xl">
              <OrgIdentityBar
                name={orgName}
                specialtyLabel={orgSpecialtyLabel}
                planLabel={orgPlanKey ? orgPlanLabel(orgPlanKey, t) : null}
              />
            </div>
          ) : (
            <div className="min-w-0 flex-1" aria-hidden />
          )}
          <div className="ms-auto flex min-w-0 shrink-0 items-center justify-end gap-0.5 sm:gap-1.5">
            <GlobalPatientSearch />
            {user ? (
              <span className="hidden max-w-[16rem] items-center gap-2 truncate border-s border-border/70 ps-3 text-sm leading-tight lg:inline-flex">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground" aria-hidden>{user.displayName.trim().charAt(0).toUpperCase()}</span>
                <span className="flex min-w-0 flex-col"><span className="truncate font-medium">{user.displayName}</span><span className="truncate text-xs text-muted-foreground">{formatUserRole(user.role, t)}</span></span>
              </span>
            ) : null}
            <Button variant="ghost" size="icon" className="kx-hdr md:size-9 md:min-h-9 md:min-w-9" onClick={() => openHelp(true)} data-testid="help-open" aria-label={t("help.button")} title={t("help.button")}>
              <CircleHelp className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="kx-hdr hidden md:inline-flex md:size-9 md:min-h-9 md:min-w-9"
              onClick={toggleDensity}
              aria-pressed={density === "compact"}
              aria-label={t("kx2.density", "Compact density")}
              title={`${t("kx2.density", "Compact density")} (Shift+D)`}
              data-testid="density-toggle"
            >
              {density === "compact" ? <Rows4 className="size-4" /> : <Rows3 className="size-4" />}
            </Button>
            <ThemeSwitcher />
            <LanguageSwitcher />
            {switchHref ? (
              <Button asChild variant="ghost" size="icon" className="kx-hdr md:size-9 md:min-h-9 md:min-w-9">
                <a href={switchHref} data-testid="switch-workspace" title={t("auth.switchWorkspace")} aria-label={t("auth.switchWorkspace")}><ArrowLeftRight className="size-4 rtl-flip" /></a>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="kx-hdr md:size-9 md:min-h-9 md:min-w-9"
              title={t("auth.signOut")}
              aria-label={t("auth.signOut")}
              onClick={() => {
                signOut();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut className="size-4 rtl-flip" />
            </Button>
          </div>
        </header>
        <DeployVersionBanner />
        <TrialBanner />
        <DunningBanner />
        <LegalAcceptanceBanner />
        {showReportingPeriodBar(pathname) ? <DateRangeBar /> : null}
        <main className="mx-auto w-full min-w-0 max-w-[min(96rem,calc(100vw-1rem))] flex-1 p-3 pb-20 sm:p-4 md:p-6 md:pb-6">
          <SetupContextBar />
          <Outlet />
        </main>
        <KeyboardShortcuts />
        <RoleAssistantWidget />
        <UpgradePaywallModal />
        <HelpDrawer />
        <FirstRunTour />
        <PwaInstallPrompt />
        <MobileBottomNav />
      </div>
    </div>
  );
}
