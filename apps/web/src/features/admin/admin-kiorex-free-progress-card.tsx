import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/http";
import { cn } from "@/lib/utils";

type KiorexProgressDto = {
  periodKey: string;
  currency: string;
  patientsAttended: number;
  patientsTarget: number;
  patientsStillNeeded: number;
  progressPercent: number;
  isFreeThisMonth: boolean;
};

function defaultPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ProgressRing({ percent, className }: { percent: number; className?: string }) {
  const p = Math.min(100, Math.max(0, percent));
  const r = 44;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - p / 100);
  return (
    <svg viewBox="0 0 100 100" className={cn("h-24 w-24 shrink-0 -rotate-90", className)} aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-primary transition-[stroke-dashoffset]"
      />
    </svg>
  );
}

export function AdminKiorexFreeProgressCard({ period = defaultPeriod() }: { period?: string }) {
  const { t } = useTranslation();

  const progressQuery = useQuery({
    queryKey: ["billing", "kiorex-progress", period],
    queryFn: () => apiGet<KiorexProgressDto>(`/api/v1/billing/kiorex-progress?period=${encodeURIComponent(period)}`),
  });

  const data = progressQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          {t("admin.billing.kiorex.freeProgress.title", "Kiorex — Kiorly is free")}
          {data?.isFreeThisMonth ? (
            <Badge variant="default">{t("admin.billing.kiorex.freeProgress.freeBadge", "Free this month")}</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          {t(
            "admin.billing.kiorex.freeProgress.hint",
            "Kiorex commission from attended new patients offsets your Kiorly subscription this month.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {progressQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : progressQuery.isError ? (
          <p className="text-sm text-destructive">{t("admin.billing.kiorex.freeProgress.loadError")}</p>
        ) : data ? (
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative flex items-center justify-center">
              <ProgressRing percent={data.progressPercent} />
              <span className="absolute text-sm font-semibold ltr-nums rotate-90">{Math.round(data.progressPercent)}%</span>
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                {data.isFreeThisMonth
                  ? t("admin.billing.kiorex.freeProgress.freeCopy", "Kiorly is free this month — Kiorex covered your plan.")
                  : data.patientsTarget > 0
                    ? t("admin.billing.kiorex.freeProgress.ringCopy", {
                        defaultValue:
                          "{{attended}} of {{target}} Kiorex patients · {{still}} more and Kiorly is free this month",
                        attended: data.patientsAttended,
                        target: data.patientsTarget,
                        still: data.patientsStillNeeded,
                      })
                    : t(
                        "admin.billing.kiorex.freeProgress.noTarget",
                        "{{attended}} Kiorex patients attended · subscription covered by commission when fees add up.",
                        { attended: data.patientsAttended },
                      )}
              </p>
              <p className="text-muted-foreground">
                {t("admin.billing.kiorex.freeProgress.period", "Period {{period}}", { period: data.periodKey })}
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}