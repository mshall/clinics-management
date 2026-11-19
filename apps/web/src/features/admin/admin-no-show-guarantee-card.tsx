import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/http";

type GuaranteeDto = {
  enabled: boolean;
  eligible?: boolean;
  ineligibilityReasons?: string[];
  dayIndex?: number | null;
  baseline?: { appointments: number; noShows: number; rate: number };
  evaluation?: { appointments: number; noShows: number; rate: number };
  reductionPercent?: number | null;
  targetReductionPercent?: number;
  creditMonths?: number;
  met?: boolean | null;
  granted?: boolean;
  evaluationComplete?: boolean;
  reason?: string;
};

export function AdminNoShowGuaranteeCard() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["billing", "guarantee"],
    queryFn: () => apiGet<GuaranteeDto>("/api/v1/billing/guarantee"),
  });

  if (query.isPending) return null;
  if (query.isError || !query.data?.enabled) return null;

  const g = query.data;

  return (
    <Card data-testid="no-show-guarantee-card">
      <CardHeader>
        <CardTitle className="text-base">{t("admin.billing.guarantee.title")}</CardTitle>
        <CardDescription>{t("admin.billing.guarantee.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {g.granted ? (
            <Badge variant="default">{t("admin.billing.guarantee.granted")}</Badge>
          ) : g.met ? (
            <Badge variant="default">{t("admin.billing.guarantee.met")}</Badge>
          ) : g.eligible === false ? (
            <Badge variant="outline">{t("admin.billing.guarantee.ineligible")}</Badge>
          ) : (
            <Badge variant="secondary">{t("admin.billing.guarantee.tracking")}</Badge>
          )}
          {typeof g.dayIndex === "number" ? (
            <span className="text-muted-foreground">
              {t("admin.billing.guarantee.dayIndex", { day: g.dayIndex })}
            </span>
          ) : null}
        </div>
        {g.baseline ? (
          <p>
            {t("admin.billing.guarantee.baseline", {
              rate: g.baseline.rate,
              appointments: g.baseline.appointments,
              noShows: g.baseline.noShows,
            })}
          </p>
        ) : null}
        {g.evaluation && g.evaluationComplete ? (
          <p>
            {t("admin.billing.guarantee.evaluation", {
              rate: g.evaluation.rate,
              reduction: g.reductionPercent ?? 0,
              target: g.targetReductionPercent ?? 30,
            })}
          </p>
        ) : (
          <p className="text-muted-foreground">{t("admin.billing.guarantee.waitingEval")}</p>
        )}
        <p className="text-muted-foreground">
          {t("admin.billing.guarantee.reward", { months: g.creditMonths ?? 3 })}
        </p>
      </CardContent>
    </Card>
  );
}
