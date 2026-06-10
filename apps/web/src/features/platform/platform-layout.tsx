import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { apiGet } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";

type PlatformOverview = {
  tenantCount: number;
  userCount: number;
  clinicCount: number;
  patientCount: number;
  encounterCount: number;
};

export function PlatformLayout() {
  const { t } = useTranslation();
  const authUser = useAuthStore((s) => s.user);
  const refreshSessionFromServer = useAuthStore((s) => s.refreshSessionFromServer);
  const isPlatform = authUser?.role === "platform_super_admin";
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void refreshSessionFromServer().finally(() => {
      if (!cancelled) setSessionReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshSessionFromServer]);

  const overviewQuery = useQuery({
    queryKey: ["platform", "overview"],
    queryFn: () => apiGet<PlatformOverview>("/api/v1/admin/platform/overview"),
    enabled: isPlatform && sessionReady,
  });

  if (!sessionReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (authUser && !isPlatform) {
    return <Navigate to="/" replace />;
  }

  const ov = overviewQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("platform.title")}</h1>
        <p className="text-muted-foreground">{t("platform.subtitle")}</p>
      </div>

      {ov ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: t("platform.kpi.orgs"), value: ov.tenantCount },
            { label: t("platform.kpi.users"), value: ov.userCount },
            { label: t("platform.kpi.clinics"), value: ov.clinicCount },
            { label: t("platform.kpi.patients"), value: ov.patientCount },
            { label: t("platform.kpi.encounters"), value: ov.encounterCount },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-semibold ltr-nums">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Outlet />
    </div>
  );
}
