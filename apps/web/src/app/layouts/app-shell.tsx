import { CircleHelp, LogOut, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { showReportingPeriodBar } from "@/lib/permissions";
import { AppNavLinks } from "@/components/app-nav-links";
import { DateRangeBar } from "@/components/date-range-bar";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuthStore } from "@/stores/auth-store";
import { formatUserRole } from "@/lib/locale-display";
import { RoleAssistantWidget } from "@/features/assistant/role-assistant-widget";
import { GlobalPatientSearch } from "@/components/global-patient-search";
import { DeployVersionBanner } from "@/components/deploy-version-banner";
import { LegalAcceptanceBanner } from "@/components/legal-acceptance-banner";
import { TrialBanner } from "@/components/trial-banner";
import { DunningBanner } from "@/components/dunning-banner";
import { UpgradePaywallModal } from "@/components/upgrade-paywall-modal";
import { FirstRunTour } from "@/features/help/first-run-tour";
import { HelpDrawer } from "@/features/help/help-drawer";
import { useHelpStore } from "@/stores/help-store";
import { PwaInstallPrompt } from "@/features/pwa/pwa-install-prompt";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

function orgPlanLabel(planKey: string, t: (key: string, fallback: string) => string): string {
  const keys: Record<string, [string, string]> = {
    LITE: ["plans.names.LITE", "Lite"],
    PRO: ["plans.names.PRO", "Pro"],
    CLINIC: ["plans.names.CLINIC", "Clinic"],
    ENTERPRISE: ["plans.names.ENTERPRISE", "Enterprise"],
  };
  const pair = keys[planKey];
  return pair ? t(pair[0], pair[1]) : planKey;
}

export function AppShell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openHelp = useHelpStore((s) => s.setDrawerOpen);
  const orgPlanKey = user?.tenantId && user.plan?.key ? user.plan.key : null;

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
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <img src="/logo.svg" alt="" className="h-9 w-9 object-contain" width={36} height={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{t("app.name")}</p>
            <p className="truncate text-xs text-muted-foreground">{t("app.tagline")}</p>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <AppNavLinks />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <header className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:gap-3 sm:px-4 md:h-14 md:flex-nowrap md:py-0 md:ps-6">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label={t("common.menu")}>
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent className="p-0" aria-describedby={undefined}>
                <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
                <SheetHeader className="flex h-14 shrink-0 flex-row items-center gap-3 border-b border-border px-4">
                  <img src="/logo.svg" alt="" className="h-9 w-9 object-contain" width={36} height={36} />
                  <div className="min-w-0 text-start">
                    <p className="truncate text-sm font-semibold leading-tight">{t("app.name")}</p>
                    <p className="truncate text-xs text-muted-foreground">{t("app.tagline")}</p>
                  </div>
                </SheetHeader>
                <AppNavLinks onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="truncate text-sm font-semibold">{t("app.name")}</span>
          </div>
          <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <GlobalPatientSearch />
            {orgPlanKey ? (
              <Badge
                variant="outline"
                className="max-w-[9rem] shrink-0 gap-1 border-sky-500/30 bg-sky-500/10 font-semibold text-sky-800 dark:text-sky-300 sm:max-w-[10rem]"
                data-testid="header-org-plan"
                title={t("app.orgPlanHint", "Your organization's current Kiorly plan")}
              >
                <span className="hidden text-[10px] font-medium uppercase tracking-wide text-sky-700/70 dark:text-sky-300/70 sm:inline">
                  {t("app.orgPlan", "Plan")}
                </span>
                <span className="truncate">{orgPlanLabel(orgPlanKey, t)}</span>
              </Badge>
            ) : null}
            {user ? (
              <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground lg:inline">
                {user.displayName} · {formatUserRole(user.role, t)}
              </span>
            ) : null}
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => openHelp(true)} data-testid="help-open">
              <CircleHelp className="size-4" />
              <span className="hidden sm:inline">{t("help.button")}</span>
            </Button>
            <ThemeSwitcher />
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => {
                signOut();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">{t("auth.signOut")}</span>
            </Button>
          </div>
        </header>
        <DeployVersionBanner />
        <TrialBanner />
        <DunningBanner />
        <LegalAcceptanceBanner />
        {showReportingPeriodBar(pathname) ? <DateRangeBar /> : null}
        <main className="mx-auto w-full min-w-0 max-w-[min(96rem,calc(100vw-1rem))] flex-1 p-3 pb-20 sm:p-4 md:p-6 md:pb-6">
          <Outlet />
        </main>
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
