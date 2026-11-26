import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/http";

export type LiteKiorexFeesDto = {
  periodKey: string;
  currency: string;
  isLite: boolean;
  patientsAttended: number;
  feesThisMonth: string;
  carriedForward: string;
  projectedTotal: string;
  minInvoice: string;
  willInvoice: boolean;
  carryToNextMonth: string;
};

function defaultPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** SB-05: Lite plan shows Kiorex fees (commission only) instead of a subscription. */
export function AdminLiteKiorexFeesCard({ period = defaultPeriod() }: { period?: string }) {
  const { t } = useTranslation();
  const feesQuery = useQuery({
    queryKey: ["billing", "lite-fees", period],
    queryFn: () => apiGet<LiteKiorexFeesDto>(`/api/v1/billing/lite-fees?period=${encodeURIComponent(period)}`),
  });
  const data = feesQuery.data;

  return (
    <Card data-testid="lite-kiorex-fees-card">
      <CardHeader>
        <CardTitle className="text-base">{t("admin.billing.kiorex.liteFees.title")}</CardTitle>
        <CardDescription>{t("admin.billing.kiorex.liteFees.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {feesQuery.isPending ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : feesQuery.isError ? (
          <p className="text-destructive">{t("admin.billing.kiorex.liteFees.loadError")}</p>
        ) : data ? (
          <>
            <dl className="grid gap-2 sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">{t("admin.billing.kiorex.liteFees.fees")}</dt>
                <dd className="text-lg font-semibold ltr-nums" data-testid="lite-fees-this-month">
                  {data.feesThisMonth} {data.currency}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {t("admin.billing.kiorex.liteFees.patients", { count: data.patientsAttended })}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("admin.billing.kiorex.liteFees.carried")}</dt>
                <dd className="text-lg font-semibold ltr-nums" data-testid="lite-fees-carried">
                  {data.carriedForward} {data.currency}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("admin.billing.kiorex.liteFees.projected")}</dt>
                <dd className="text-lg font-semibold ltr-nums">
                  {data.projectedTotal} {data.currency}
                </dd>
              </div>
            </dl>
            <p className="text-muted-foreground">
              {t("admin.billing.kiorex.liteFees.minInvoice", { amount: data.minInvoice, currency: data.currency })}
            </p>
            <p className="font-medium">
              {data.willInvoice
                ? t("admin.billing.kiorex.liteFees.willInvoice")
                : t("admin.billing.kiorex.liteFees.willCarry", {
                    amount: data.carryToNextMonth,
                    currency: data.currency,
                  })}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
