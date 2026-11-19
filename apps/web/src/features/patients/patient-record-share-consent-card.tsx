import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/lib/http";
import { canEditPatientDetails } from "@/lib/patient-edit-policy";
import { useAuthStore } from "@/stores/auth-store";

type Scope = "VISIT_SUMMARY" | "PRESCRIPTIONS" | "LAB_RESULTS" | "SHARE_WITH_OTHER_CLINICS";

type ConsentRow = {
  scope: Scope;
  granted: boolean;
  source: string | null;
  updatedAt: string | null;
};

type Props = { patientId: string };

const SCOPE_KEYS: Record<Scope, string> = {
  VISIT_SUMMARY: "recordShareConsent.scopeVisitSummary",
  PRESCRIPTIONS: "recordShareConsent.scopePrescriptions",
  LAB_RESULTS: "recordShareConsent.scopeLabResults",
  SHARE_WITH_OTHER_CLINICS: "recordShareConsent.scopeOtherClinics",
};

export function PatientRecordShareConsentCard({ patientId }: Props) {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const navTabAccessModes = useAuthStore((s) => s.user?.navTabAccessModes);
  const canEdit = canEditPatientDetails(role, navTabKeys, navTabAccessModes);
  const qc = useQueryClient();

  const { data: consents = [], isPending } = useQuery({
    queryKey: ["patient-record-share-consent", patientId],
    queryFn: () => apiGet<ConsentRow[]>(`/api/v1/patients/${patientId}/record-share-consent`),
  });

  const save = useMutation({
    mutationFn: (next: ConsentRow[]) =>
      apiPut<ConsentRow[]>(`/api/v1/patients/${patientId}/record-share-consent`, {
        consents: next.map((c) => ({ scope: c.scope, granted: c.granted })),
      }),
    onSuccess: (rows) => {
      qc.setQueryData(["patient-record-share-consent", patientId], rows);
    },
  });

  const toggle = (scope: Scope, granted: boolean) => {
    if (!canEdit || save.isPending) return;
    const next = consents.map((c) => (c.scope === scope ? { ...c, granted } : c));
    save.mutate(next);
  };

  return (
    <Card data-testid="record-share-consent-card">
      <CardHeader>
        <CardTitle className="text-base">{t("recordShareConsent.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("recordShareConsent.hint")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          consents.map((row) => (
            <div key={row.scope} className="flex items-center justify-between gap-4">
              <Label htmlFor={`record-share-${row.scope}`} className="font-normal">
                {t(SCOPE_KEYS[row.scope])}
              </Label>
              <input
                id={`record-share-${row.scope}`}
                type="checkbox"
                className="h-4 w-4 rounded border border-input"
                checked={row.granted}
                disabled={!canEdit || save.isPending}
                onChange={(e) => toggle(row.scope, e.target.checked)}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
