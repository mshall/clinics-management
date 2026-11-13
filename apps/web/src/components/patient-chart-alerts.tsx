import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/http";
import { cn } from "@/lib/utils";

type BadgeRow = { kind: string; level: string; messageEn: string; messageAr: string };

export function PatientChartAlerts({ patientId, className }: { patientId: string; className?: string }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const q = useQuery({
    queryKey: ["patient", patientId, "header-alerts"],
    queryFn: () => apiGet<{ badges: BadgeRow[] }>(`/api/v1/front-desk/patients/${patientId}/header-alerts`),
    enabled: Boolean(patientId),
  });

  const badges = q.data?.badges ?? [];
  if (!badges.length) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {badges.map((b) => (
        <Badge
          key={b.kind}
          variant={b.level === "high" ? "default" : b.level === "medium" ? "secondary" : "outline"}
          className={cn("text-xs", b.level === "high" && "bg-destructive text-destructive-foreground")}
        >
          {isAr ? b.messageAr : b.messageEn}
        </Badge>
      ))}
    </div>
  );
}
