import { LogOut, Menu } from "lucide-react";
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

export function AppShell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [mobileOpen, setMobileOpen] = useState(false);

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
      <aside className="hidden w-60 shrink-0 border-e border-border bg-card md:flex md:flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <img src="/logo.svg" alt="" className="h-9 w-9 object-contain" width={36} height={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{t("app.name")}</p>
            <p className="truncate text-xs text-muted-foreground">{t("app.tagline")}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          <AppNavLinks />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:ps-6">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Menu">
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
          <div className="ms-auto flex items-center gap-2">
            {user ? (
              <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground sm:inline">
                {user.displayName} · {user.role.replace("_", " ")}
              </span>
            ) : null}
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
        {showReportingPeriodBar(pathname) ? <DateRangeBar /> : null}
        <main className="mx-auto w-full max-w-[min(96rem,calc(100vw-1.5rem))] flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
