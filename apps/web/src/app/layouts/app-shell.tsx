import { CircleHelp, LogOut, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { showReportingPeriodBar } from "@/lib/permissions";
import { AppNavLinks } from "@/components/app-nav-links";
import { DateRangeBar } from "@/components/date-range-bar";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
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
import { BrandLockup } from "@/components/brand-lockup";

export function AppShell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openHelp = useHelpStore((s) => s.setDrawerOpen);

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
        <div className="flex min-h-[4.5rem] shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <BrandLockup />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <AppNavLinks />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <header className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:gap-3 sm:px-4 md:h-14 md:flex-nowrap md:py-0 md:ps-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label={t("common.menu")}>
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent className="p-0" aria-describedby={undefined}>
                <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
                <SheetHeader className="flex min-h-[4.5rem] shrink-0 flex-row items-center gap-3 border-b border-border px-4">
                  <BrandLockup />
                </SheetHeader>
                <AppNavLinks onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <BrandLockup height={26} tagline={false} />
          </div>
          <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:gap-2">
            <GlobalPatientSearch />
            {user ? (
              <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground sm:inline">
                {user.displayName} · {formatUserRole(user.role, t)}
              </span>
            ) : null}
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => openHelp(true)} data-testid="help-open" aria-label={t("help.button")}>
              <CircleHelp className="size-4" />
              <span className="hidden sm:inline">{t("help.button")}</span>
            </Button>
            <ThemeSwitcher />
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              aria-label={t("auth.signOut")}
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
