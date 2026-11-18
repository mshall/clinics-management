import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  FlaskConical,
  Pill,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AiFeatureLabel } from "@/components/ai-feature-label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/http";

type PreVisitPayload = { patientId: string; lines: string[] };

type LineStyle = {
  icon: LucideIcon;
  tone: "neutral" | "info" | "warn" | "accent" | "success";
};

function styleForLine(line: string, index: number): LineStyle {
  const lower = line.toLowerCase();
  if (index === 0 || lower.includes("mrn")) {
    return { icon: UserRound, tone: "accent" };
  }
  if (lower.includes("last visit")) {
    return { icon: CalendarDays, tone: "info" };
  }
  if (lower.includes("med")) {
    return { icon: Pill, tone: "success" };
  }
  if (lower.includes("lab") || lower.includes("radiology") || lower.includes("result")) {
    return { icon: FlaskConical, tone: "info" };
  }
  if (lower.includes("allerg")) {
    return { icon: AlertTriangle, tone: "warn" };
  }
  if (lower.includes("before starting") || lower.includes("vitals")) {
    return { icon: ClipboardList, tone: "neutral" };
  }
  return { icon: Sparkles, tone: "neutral" };
}

const toneClass: Record<LineStyle["tone"], string> = {
  neutral: "border-border/80 bg-muted/30 text-foreground",
  info: "border-sky-500/25 bg-sky-500/10 text-sky-950 dark:text-sky-50",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-50",
  accent: "border-violet-500/25 bg-gradient-to-br from-violet-500/15 to-indigo-500/10 text-foreground",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-50",
};

const iconToneClass: Record<LineStyle["tone"], string> = {
  neutral: "text-muted-foreground",
  info: "text-sky-600",
  warn: "text-amber-600",
  accent: "text-violet-600",
  success: "text-emerald-600",
};

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
    <Card className="overflow-hidden border-violet-500/20 bg-gradient-to-br from-violet-500/5 via-background to-sky-500/5 shadow-sm">
      <CardHeader className="pb-3">
        <AiFeatureLabel featureId="pre_visit_summary" showDisclosure />
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="grid gap-2 sm:grid-cols-2">
          {q.data.lines.map((line, i) => {
            const style = styleForLine(line, i);
            const Icon = style.icon;
            return (
              <li
                key={i}
                className={cn(
                  "flex gap-3 rounded-lg border p-3 text-sm leading-snug shadow-sm",
                  toneClass[style.tone],
                  i === 0 ? "sm:col-span-2" : "",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80",
                    iconToneClass[style.tone],
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span>{line}</span>
              </li>
            );
          })}
        </ul>
        <p className="pt-1 text-xs text-muted-foreground">{t("aiFeatures.preVisitSummary.footer")}</p>
      </CardContent>
    </Card>
  );
}