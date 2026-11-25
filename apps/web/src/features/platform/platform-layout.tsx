import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { PageHeader, Skeleton, StatCard } from "@/brand/ui-kit";
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

  const sections: { to: string; label: string; end?: boolean }[] = [
    { to: "/platform", label: t("nav.platformOverview"), end: true },
    { to: "/platform/organizations", label: t("platform.kpi.orgs") },
    { to: "/platform/users", label: t("platform.kpi.users") },
    { to: "/platform/clinics", label: t("platform.kpi.clinics") },
    { to: "/platform/insights", label: t("nav.platformInsights", "Insights") },
    { to: "/platform/markets", label: t("nav.platformMarkets", "Market launch") },
    { to: "/platform/plans", label: t("nav.platformPlans", "Plans & pricing") },
    { to: "/platform/subscriptions", label: t("nav.platformSubscriptions", "Subscriptions") },
    { to: "/platform/kiorex-rates", label: t("nav.platformKiorex", "Kiorex fees") },
    { to: "/platform/verifications", label: t("nav.platformVerifications", "Doctor verification") },
    { to: "/platform/disputes", label: t("nav.platformDisputes", "Commission disputes") },
    { to: "/platform/drug-datasets", label: t("nav.platformDrugDatasets", "Drug datasets") },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={t("platform.title")} description={t("platform.subtitle")} className="mb-0" />

      {ov ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: t("platform.kpi.orgs"), value: ov.tenantCount, tone: "brand" as const },
            { label: t("platform.kpi.users"), value: ov.userCount, tone: "info" as const },
            { label: t("platform.kpi.clinics"), value: ov.clinicCount, tone: "neutral" as const },
            { label: t("platform.kpi.patients"), value: ov.patientCount, tone: "good" as const },
            { label: t("platform.kpi.encounters"), value: ov.encounterCount, tone: "neutral" as const },
          ].map((k) => (
            <StatCard key={k.label} label={k.label} value={<span className="ltr-nums">{k.value.toLocaleString()}</span>} tone={k.tone} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-18 rounded-xl" />)}
        </div>
      )}

      <nav aria-label={t("platform.title")} className="kx-secnav">
        {sections.map((x) => (
          <NavLink key={x.to} to={x.to} end={x.end} className="inline-flex items-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">{x.label}</NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
