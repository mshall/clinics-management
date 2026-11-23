import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/http";
import type { EncounterDetailDto } from "@/lib/api-types";
import { ClinicalLetterDialog } from "@/features/clinical/clinical-letter-dialog";
import { Link } from "react-router-dom";
import { RxSafetyAlerts } from "@/features/clinical/rx-safety-alerts";
import { type RxSafetyAlert } from "@/features/clinical/rx-safety-utils";

type IcdRow = { icd10Code: string; descriptionEn: string; descriptionAr: string };
type Shortcut = { id: string; label: string; type: string; payload: unknown };

type Props = {
  encounter: EncounterDetailDto;
  onApplySoap: (partial: Partial<Pick<EncounterDetailDto, "subjective" | "objective" | "assessment" | "plan">>) => void;
  pendingDrugName?: string;
  pendingDrugProductId?: string | null;
};

export function EncounterClinicalTools({ encounter, onApplySoap, pendingDrugName, pendingDrugProductId }: Props) {
  const { t, i18n } = useTranslation();
  const [icdQ, setIcdQ] = useState("");
  const isAr = i18n.language.startsWith("ar");

  const icdQuery = useQuery({
    queryKey: ["clinical", "icd10", icdQ],
    queryFn: () => apiGet<IcdRow[]>(`/api/v1/clinical/icd10/search?q=${encodeURIComponent(icdQ)}`),
    enabled: icdQ.trim().length >= 2,
  });

  const shortcutsQuery = useQuery({
    queryKey: ["clinical", "shortcuts"],
    queryFn: () => apiGet<Shortcut[]>("/api/v1/clinical/shortcuts"),
  });

  const rxItems = [
    ...encounter.medications.map((m) => ({
      drugName: m.drugName,
      drugProductId: m.drugProductId ?? undefined,
    })),
    ...(pendingDrugName?.trim()
      ? [{ drugName: pendingDrugName, drugProductId: pendingDrugProductId ?? undefined }]
      : []),
  ];

  const safetyQuery = useQuery({
    queryKey: ["clinical", "rx-check", encounter.patientId, rxItems],
    queryFn: () =>
      apiPost<{ alerts: RxSafetyAlert[] }>("/api/v1/clinical/rx/check", {
        patientId: encounter.patientId,
        items: rxItems,
      }).then((r) => r.alerts ?? []),
    enabled: rxItems.length > 0 && Boolean(pendingDrugName?.trim()),
  });

  const copyLast = useMutation({
    mutationFn: () =>
      apiGet<{
        subjective?: string | null;
        objective?: string | null;
        assessment?: string | null;
        plan?: string | null;
      } | null>(`/api/v1/clinical/patients/${encounter.patientId}/last-visit?excludeEncounterId=${encounter.id}`),
    onSuccess: (snap) => {
      if (!snap) {
        toast.message(t("encounters.noPriorVisit", "No prior finalized visit to copy."));
        return;
      }
      onApplySoap({
        subjective: snap.subjective ?? undefined,
        objective: snap.objective ?? undefined,
        assessment: snap.assessment ?? undefined,
        plan: snap.plan ?? undefined,
      });
      toast.success(t("encounters.copiedLastVisit", "Copied last visit notes."));
    },
  });

  const alerts = safetyQuery.data ?? [];

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("encounters.clinicalTools", "Clinical tools")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={copyLast.isPending} onClick={() => copyLast.mutate()}>
          {t("encounters.copyLastVisit", "Copy last visit")}
        </Button>
        <ClinicalLetterDialog patientId={encounter.patientId} encounterId={encounter.id} />
        <Link to={`/clinics/${encounter.clinicId}?tab=settings`} className="text-xs text-primary hover:underline">
          {t("clinical.templateBuilderLink", "Manage templates in clinic settings")}
        </Link>
        {shortcutsQuery.data?.map((s) => (
          <Button
            key={s.id}
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              if (s.type === "TEXT_EXPAND" && s.payload && typeof s.payload === "object" && "text" in (s.payload as object)) {
                const text = String((s.payload as { text: string }).text);
                onApplySoap({ plan: `${encounter.plan ?? ""}\n${text}`.trim() });
              }
            }}
          >
            {s.label}
          </Button>
        ))}
      </div>
      <div className="space-y-2">
        <Label optional>{t("encounters.icdSearch", "Diagnosis search (EN/AR)")}</Label>
        <Input value={icdQ} onChange={(e) => setIcdQ(e.target.value)} placeholder={t("encounters.icdSearchPh", "Code or description")} />
        <ul className="max-h-32 space-y-1 overflow-y-auto text-sm">
          {(icdQuery.data ?? []).slice(0, 8).map((row) => (
            <li key={row.icd10Code} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1">
              <span>
                <strong className="ltr-nums">{row.icd10Code}</strong> — {isAr && row.descriptionAr ? row.descriptionAr : row.descriptionEn}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => void apiPost("/api/v1/clinical/icd10/favorites", { icd10Code: row.icd10Code })}
              >
                ★
              </Button>
            </li>
          ))}
        </ul>
      </div>
      {pendingDrugName && pendingDrugName.trim().length > 1 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("clinical.safetyWarnings")}</p>
          {safetyQuery.isPending ? (
            <p className="text-xs text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : alerts.length ? (
            <RxSafetyAlerts alerts={alerts} />
          ) : safetyQuery.isSuccess ? (
            <p className="text-xs text-muted-foreground">{t("clinical.safetyNoIssues")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}