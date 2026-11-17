import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/http";
import { cn } from "@/lib/utils";

type ConsentRow = {
  purpose: string;
  granted: boolean;
};

const PURPOSE_I18N: Record<string, string> = {
  DATA_PROCESSING: "patientConsent.data",
  AI_PROCESSING: "patientConsent.ai",
  MARKETPLACE_SHARING: "patientConsent.marketplace",
  MESSAGING_MARKETING: "patientConsent.marketing",
};

export function PatientConsentChips({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["patient", patientId, "consents"],
    queryFn: () => apiGet<ConsentRow[]>(`/api/v1/patients/${patientId}/consents`),
  });

  if (q.isPending || q.isError || !q.data?.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5" role="list" aria-label={t("patientConsent.header", "Consent status")}>
      {q.data.map((row) => {
        const labelKey = PURPOSE_I18N[row.purpose] ?? row.purpose;
        return (
          <Badge
            key={row.purpose}
            variant="outline"
            role="listitem"
            className={cn(
              "text-xs font-normal",
              row.granted
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                : "border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100",
            )}
          >
            {t(labelKey, row.purpose)} · {row.granted ? t("patientConsent.granted", "Granted") : t("patientConsent.missing", "Missing")}
          </Badge>
        );
      })}
    </div>
  );
}