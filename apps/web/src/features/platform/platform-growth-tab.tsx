import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveTable } from "@/components/responsive-table";
import { apiGet } from "@/lib/http";

type GrowthDto = {
  funnel: { signup: number; onboardingStarted: number; activated: number; trialEnd: number; paid: number };
  mrr: { amount: number; currency: string };
  arr: { amount: number; currency: string };
  kiorex: { liveListings: number; tenantsWithLiveListing: number; attachRatePct: number };
  paywallConversions: number;
  byRep: Array<{ salesRepCode: string; signups: number }>;
  cohorts: Array<{ cohortKey: string; subscriptions: number }>;
  retention: Array<{
    month: string;
    signups: number;
    activated: number;
    paid: number;
    activationRate: number;
    paidRate: number;
  }>;
};

export function PlatformGrowthTab() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["platform", "growth"],
    queryFn: () => apiGet<GrowthDto>("/api/v1/admin/platform/growth"),
  });

  if (q.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (q.isError || !q.data) {
    return <p className="text-sm text-destructive">{t("common.error")}</p>;
  }
  const d = q.data;
  const funnelSteps = [
    { key: "signup", label: t("platform.growth.signup", "Signups"), value: d.funnel.signup },
    { key: "onboarding", label: t("platform.growth.onboarding", "Onboarding started"), value: d.funnel.onboardingStarted },
    { key: "activated", label: t("platform.growth.activated", "Activated"), value: d.funnel.activated },
    { key: "trialEnd", label: t("platform.growth.trialEnd", "Past trial"), value: d.funnel.trialEnd },
    { key: "paid", label: t("platform.growth.paid", "Paid"), value: d.funnel.paid },
  ];

  return (
    <div className="space-y-4" data-testid="platform-growth">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.growth.title", "Activation funnel")}</CardTitle>
          <CardDescription>
            {t("platform.growth.hint", "Signup → onboarding → activated → trial end → paid. Counts come from tenant and subscription tables.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {funnelSteps.map((s) => (
              <div key={s.key} className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-semibold ltr-nums">{s.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">MRR</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold ltr-nums">
            {d.mrr.amount} {d.mrr.currency}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ARR</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold ltr-nums">
            {d.arr.amount} {d.arr.currency}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("platform.growth.kiorexAttach", "Kiorex attach")}</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold ltr-nums">
            {d.kiorex.attachRatePct}% · {d.kiorex.tenantsWithLiveListing}/{d.funnel.signup}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.growth.retention", "Cohort retention")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1">{t("platform.growth.month", "Month")}</th>
                  <th className="px-2 py-1">{t("platform.growth.signup", "Signups")}</th>
                  <th className="px-2 py-1">{t("platform.growth.activated", "Activated")}</th>
                  <th className="px-2 py-1">{t("platform.growth.paid", "Paid")}</th>
                  <th className="px-2 py-1">%</th>
                </tr>
              </thead>
              <tbody>
                {d.retention.map((r) => (
                  <tr key={r.month} className="border-t">
                    <td className="px-2 py-1 ltr-nums">{r.month}</td>
                    <td className="px-2 py-1 ltr-nums">{r.signups}</td>
                    <td className="px-2 py-1 ltr-nums">{r.activated}</td>
                    <td className="px-2 py-1 ltr-nums">{r.paid}</td>
                    <td className="px-2 py-1 ltr-nums">
                      {r.activationRate}% / {r.paidRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("platform.growth.byRep", "By sales rep")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {d.byRep.map((r) => (
                <li key={r.salesRepCode} className="flex justify-between py-2">
                  <span>{r.salesRepCode}</span>
                  <span className="ltr-nums">{r.signups}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("platform.growth.cohorts", "Cohorts")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {d.cohorts.map((c) => (
                <li key={c.cohortKey} className="flex justify-between py-2">
                  <span>{c.cohortKey}</span>
                  <span className="ltr-nums">{c.subscriptions}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("platform.growth.paywall", "Paywall events")}: <span className="ltr-nums">{d.paywallConversions}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
