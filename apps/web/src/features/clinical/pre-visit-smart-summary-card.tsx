import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AiFeatureLabel } from "@/components/ai-feature-label";
import { apiGet } from "@/lib/http";

type PreVisitPayload = { patientId: string; lines: string[] };

export function PreVisitSmartSummaryCard({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["clinic-ai", "pre-visit-summary", patientId],
    queryFn: () => apiGet<PreVisitPayload>(`/api/v1/clinic-ai/patients/${patientId}/pre-visit-summary`),
    retry: false,
  });

  if (q.isPending) return null;
  if (q.isError || !q.data?.lines?.length) return null;

  return (
    <Card className="border-border/80 bg-muted/15">
      <CardHeader className="pb-2">
        <AiFeatureLabel featureId="pre_visit_summary" showDisclosure />
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 ps-4 text-sm text-foreground">
          {q.data.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{t("aiFeatures.preVisitSummary.footer")}</p>
      </CardContent>
    </Card>
  );
}