import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost } from "@/lib/http";

type EtaHealthDto = {
  threshold: number;
  etaApiEnvironment: string;
  pilotProductionStartedAt: string | null;
  period: { from: string; to: string };
  summary: {
    submittedCount: number;
    validCount: number;
    invalidCount: number;
    pendingValidationCount: number;
    manualInterventionCount: number;
    successRate: number | null;
    meetsPilotCriterion: boolean;
  };
  daily: Array<{ date: string; submittedCount: number; validCount: number; successRate: number | null }>;
  topRejectionClasses: Array<{ key: string; count: number }>;
  alertActive: boolean;
};

function pct(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function EtaHealthCard({ enabled = true }: { enabled?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const health = useQuery({
    queryKey: ["admin", "eta-health"],
    queryFn: () => apiGet<EtaHealthDto>("/api/v1/admin/eta-health"),
    enabled,
  });

  const startPilot = useMutation({
    mutationFn: () => apiPost<{ startedAt: string }>("/api/v1/admin/eta-pilot/start", {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "eta-health"] });
    },
  });

  if (!enabled) return null;

  const data = health.data;
  const rate = data?.summary.successRate ?? null;
  const ok = data?.summary.meetsPilotCriterion;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" aria-hidden />
              {t("compliance.etaHealth.title", "ETA production health")}
            </CardTitle>
            <CardDescription>
              {t(
                "compliance.etaHealth.subtitle",
                "Pilot week 1 target: ≥ 95% of automatic submissions reach VALID on ETA without manual resubmit.",
              )}
            </CardDescription>
          </div>
          {data?.etaApiEnvironment ? (
            <Badge variant={data.etaApiEnvironment === "production" ? "default" : "secondary"}>
              {t(`compliance.etaHealth.env.${data.etaApiEnvironment}`, data.etaApiEnvironment)}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {health.isError ? (
          <p className="text-destructive">{health.error instanceof Error ? health.error.message : t("common.error")}</p>
        ) : health.isPending ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : data ? (
          <>
            {data.alertActive ? (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {t(
                  "compliance.etaHealth.alertBelowThreshold",
                  "Yesterday’s ETA success rate fell below 95%. Review failing operations and the runbook below.",
                )}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("compliance.etaHealth.successRate", "Success rate")}</p>
                <p className="text-lg font-semibold ltr-nums flex items-center gap-1">
                  {pct(rate)}
                  {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                </p>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("compliance.etaHealth.submitted", "Submitted")}</p>
                <p className="text-lg font-semibold ltr-nums">{data.summary.submittedCount}</p>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("compliance.etaHealth.valid", "VALID")}</p>
                <p className="text-lg font-semibold ltr-nums">{data.summary.validCount}</p>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {t("compliance.etaHealth.manual", "Manual resubmits")}
                </p>
                <p className="text-lg font-semibold ltr-nums">{data.summary.manualInterventionCount}</p>
              </div>
            </div>
            {data.topRejectionClasses.length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("compliance.etaHealth.topRejections", "Top rejection classes")}
                </p>
                <ul className="space-y-1">
                  {data.topRejectionClasses.map((r) => (
                    <li key={r.key} className="flex justify-between gap-2">
                      <span>{t(`compliance.etaRunbook.${r.key}.title`, r.key)}</span>
                      <span className="ltr-nums text-muted-foreground">{r.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!data.pilotProductionStartedAt ? (
              <Button
                type="button"
                size="sm"
                disabled={startPilot.isPending}
                onClick={() => startPilot.mutate()}
              >
                {t("compliance.etaHealth.startPilotClock", "Start production pilot week 1")}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("compliance.etaHealth.pilotStarted", "Pilot started {{at}}", {
                  at: new Date(data.pilotProductionStartedAt).toLocaleString(),
                })}
              </p>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}