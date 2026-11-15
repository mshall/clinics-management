import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveTable } from "@/components/responsive-table";
import { apiGet } from "@/lib/http";
import { Badge } from "@/components/ui/badge";

type OrgInsights = {
  period: { from: string; to: string };
  organizations: Array<{
    id: string;
    name: string;
    marketCode: string | null;
    marketOperability: string | null;
    baseCurrency: string;
    deploymentCell: string;
    counts: { users: number; clinics: number; patients: number; encounters: number; appointments: number };
    auditEventsInPeriod: number;
  }>;
};

type PlatformInsights = {
  period: { from: string; to: string };
  totals: {
    organizations: number;
    users: number;
    clinics: number;
    patients: number;
    encountersInPeriod: number;
    auditEventsInPeriod: number;
  };
  markets: Array<{
    code: string;
    nameEn: string;
    launchStatus: string;
    operationalStatus: string;
    operability: string;
    dataRegion: string;
    tenantCount: number;
    pausedUntil: string | null;
  }>;
  topOrganizationsByActivity: Array<{ tenantId: string | null; name: string; auditEvents: number }>;
  liveMarkets: number;
};

export function PlatformInsightsTab() {
  const { t } = useTranslation();
  const orgQ = useQuery({
    queryKey: ["platform", "insights", "organizations"],
    queryFn: () => apiGet<OrgInsights>("/api/v1/admin/platform/insights/organizations"),
  });
  const platQ = useQuery({
    queryKey: ["platform", "insights", "platform"],
    queryFn: () => apiGet<PlatformInsights>("/api/v1/admin/platform/insights/platform"),
  });

  return (
    <Tabs defaultValue="organizations" className="space-y-4">
      <TabsList>
        <TabsTrigger value="organizations">{t("platform.insightsOrgs", "Organizations 360°")}</TabsTrigger>
        <TabsTrigger value="platform">{t("platform.insightsPlatform", "Platform performance")}</TabsTrigger>
      </TabsList>

      <TabsContent value="organizations">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("platform.insightsOrgsTitle", "All organizations")}</CardTitle>
            <CardDescription>
              {t("platform.insightsOrgsHint", "Cross-tenant counts and audit activity for the default insights window.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {orgQ.isPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : (
              <ResponsiveTable>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-3 py-2">{t("admin.name", "Name")}</th>
                      <th className="px-3 py-2">{t("platform.marketPack", "Market")}</th>
                      <th className="px-3 py-2">{t("nav.clinics")}</th>
                      <th className="px-3 py-2">{t("admin.patients", "Patients")}</th>
                      <th className="px-3 py-2">{t("platform.insightsAudit", "Audit events")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orgQ.data?.organizations ?? []).map((o) => (
                      <tr key={o.id} className="border-b border-border/60">
                        <td className="px-3 py-2 font-medium">{o.name}</td>
                        <td className="px-3 py-2">
                          {o.marketCode ?? "—"}
                          {o.marketOperability && o.marketOperability !== "active" ? (
                            <Badge variant="outline" className="ms-1">
                              {o.marketOperability}
                            </Badge>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 ltr-nums">{o.counts.clinics}</td>
                        <td className="px-3 py-2 ltr-nums">{o.counts.patients}</td>
                        <td className="px-3 py-2 ltr-nums">{o.auditEventsInPeriod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="platform" className="space-y-4">
        {platQ.data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [t("platform.kpi.orgs", "Organizations"), platQ.data.totals.organizations],
              [t("platform.kpi.users", "Users"), platQ.data.totals.users],
              [t("platform.kpi.clinics", "Clinics"), platQ.data.totals.clinics],
              [t("platform.kpi.patients", "Patients"), platQ.data.totals.patients],
              [t("platform.insightsEncounters", "Encounters (period)"), platQ.data.totals.encountersInPeriod],
              [t("platform.insightsAudit", "Audit events"), platQ.data.totals.auditEventsInPeriod],
            ].map(([label, val]) => (
              <Card key={String(label)}>
                <CardHeader className="pb-2">
                  <CardDescription>{label}</CardDescription>
                  <CardTitle className="text-2xl ltr-nums">{val}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("platform.insightsMarkets", "Markets")}</CardTitle>
          </CardHeader>
          <CardContent>
            {platQ.isPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(platQ.data?.markets ?? []).map((m) => (
                  <li key={m.code} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <span>
                      <span className="font-medium">{m.code}</span> — {m.nameEn}
                    </span>
                    <span className="text-muted-foreground ltr-nums">
                      {m.dataRegion} · {m.tenantCount} {t("platform.insightsTenants", "orgs")}
                    </span>
                    <Badge variant={m.operability === "active" ? "default" : "secondary"}>{m.operability}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}