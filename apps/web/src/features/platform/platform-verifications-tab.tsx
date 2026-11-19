import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveTable } from "@/components/responsive-table";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiGet } from "@/lib/http";
import {
  PlatformVerificationReviewDialog,
  type PlatformVerificationRow,
} from "./platform-verification-review-dialog";

const PROFESSIONS = ["PHYSICIAN", "DENTIST", "PHYSIOTHERAPIST", "NURSE"] as const;

type List = { items: PlatformVerificationRow[]; total: number };

type Metrics = {
  pendingCount: number;
  medianReviewMs: number | null;
  reviewsCounted: number;
  slaTargetHours: number;
};

type ReviewConfig = {
  slaTargetHours: number;
  checklistKeys: string[];
  checklistLabels?: Record<string, { en: string; ar: string }>;
  rejectTemplates: { code: string; labelEn: string; labelAr: string }[];
};

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 48) {
    const d = Math.floor(h / 24);
    return `${d}d`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function PlatformVerificationsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [reviewRow, setReviewRow] = useState<PlatformVerificationRow | null>(null);
  const [profession, setProfession] = useState("");

  const configQ = useQuery({
    queryKey: ["platform", "verifications", "config"],
    queryFn: () => apiGet<ReviewConfig>("/api/v1/admin/platform/verifications/review-config"),
  });

  const metricsQ = useQuery({
    queryKey: ["platform", "verifications", "metrics"],
    queryFn: () => apiGet<Metrics>("/api/v1/admin/platform/verifications/metrics"),
  });

  const q = useQuery({
    queryKey: ["platform", "verifications", "PENDING", profession],
    queryFn: () =>
      apiGet<List>(`/api/v1/admin/platform/verifications?status=PENDING&pageSize=50${profession ? `&profession=${profession}` : ""}`),
  });

  const medianLabel = useMemo(() => {
    const ms = metricsQ.data?.medianReviewMs;
    if (ms == null) return t("verification.medianUnknown", "—");
    return formatDuration(ms);
  }, [metricsQ.data?.medianReviewMs, t]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("verification.metricsPending", "Pending in queue")}</CardDescription>
            <CardTitle className="text-2xl ltr-nums">{metricsQ.data?.pendingCount ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("verification.medianReviewTime", "Median review time (90d)")}</CardDescription>
            <CardTitle className="text-2xl">{medianLabel}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("verification.slaTarget", "SLA {{hours}}h", { hours: metricsQ.data?.slaTargetHours ?? 48 })}</CardDescription>
            <CardTitle className="text-base font-medium">
              {t("verification.slaHelp", "Oldest pending listed first; breached rows highlighted.")}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("verification.platformQueue", "Doctor verification queue")}</CardTitle>
          <CardDescription>{t("verification.queueHint", "Open a row to view documents, complete the checklist, and approve or reject.")}</CardDescription>
          <div className="pt-2">
            <select
              aria-label={t("verification.filterProfession", "Filter by profession")}
              className={nativeSelectClassName}
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              data-testid="verification-profession-filter"
            >
              <option value="">{t("verification.allProfessions", "All professions")}</option>
              {PROFESSIONS.map((p) => (
                <option key={p} value={p}>
                  {t(`verification.profession.${p}`, p)}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveTable>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-2 py-2 text-start">{t("verification.clinician", "Clinician")}</th>
                  <th className="px-2 py-2 text-start">{t("verification.organization", "Organization")}</th>
                  <th className="px-2 py-2 text-start">{t("verification.professionLabel", "Profession")}</th>
                  <th className="px-2 py-2 text-start">{t("verification.specialty", "Specialty")}</th>
                  <th className="px-2 py-2 text-start">{t("verification.slaWaiting", "Waiting")}</th>
                  <th className="px-2 py-2 text-start">{t("common.action", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.items ?? []).map((row) => (
                  <tr
                    key={row.id}
                    className={
                      row.slaBreached
                        ? "border-t bg-destructive/5"
                        : "border-t"
                    }
                  >
                    <td className="px-2 py-2">
                      <div className="font-medium">{row.clinicianName}</div>
                      <div className="text-xs text-muted-foreground">{row.clinicianEmail}</div>
                    </td>
                    <td className="px-2 py-2">{row.tenantName}</td>
                    <td className="px-2 py-2">
                      {row.profession ? (
                        <Badge variant="secondary" data-testid="verification-row-profession">
                          {t(`verification.profession.${row.profession}`, row.profession)}
                        </Badge>
                      ) : (
                        "—"
                      )}
                      {row.isSolo ? <Badge variant="outline" className="ms-1">{t("verification.soloTag", "solo practitioner")}</Badge> : null}
                      {row.reverifyReason ? (
                        <div className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                          {t(`verification.reverify.${row.reverifyReason}`, row.reverifyReason)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      {row.specialty ? t(`clinicalSpecialty.${row.specialty}`, row.specialty) : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <span className={row.slaBreached ? "font-medium text-destructive" : "ltr-nums"}>
                        {formatDuration(row.waitingMs)}
                      </span>
                      {row.slaBreached ? (
                        <Badge variant="secondary" className="ms-2 bg-destructive/15 text-destructive">
                          {t("verification.slaBreached", "SLA breached")}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <Button type="button" size="sm" onClick={() => setReviewRow(row)}>
                        {t("verification.review", "Review")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
          {q.data?.items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("verification.queueEmpty", "No pending verifications.")}</p>
          ) : null}
        </CardContent>
      </Card>

      <PlatformVerificationReviewDialog
        row={reviewRow}
        config={configQ.data}
        open={reviewRow != null}
        onOpenChange={(open) => !open && setReviewRow(null)}
        onDecided={() => {
          void qc.invalidateQueries({ queryKey: ["platform", "verifications"] });
        }}
      />
    </div>
  );
}