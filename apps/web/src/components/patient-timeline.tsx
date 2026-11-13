import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/http";

const FILTERS = ["VISIT", "OPERATION", "DOCUMENT", "INVOICE", "MESSAGE"] as const;

type Item = Record<string, unknown> & { type: string; at: string };

export function PatientTimeline({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<Set<string>>(() => new Set(FILTERS));
  const types = useMemo(() => [...active].join(","), [active]);
  const q = useQuery({
    queryKey: ["patient", patientId, "timeline", types],
    queryFn: () => apiGet<{ items: Item[] }>(`/api/v1/patients/${patientId}/timeline?types=${encodeURIComponent(types)}`),
  });

  const toggle = (f: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next.size ? next : new Set([f]);
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">{t("patients.timeline", "Timeline")}</CardTitle>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f}
              type="button"
              size="sm"
              variant={active.has(f) ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => toggle(f)}
            >
              {t(`patients.timeline.${f.toLowerCase()}`, f)}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="max-h-[28rem] space-y-2 overflow-y-auto text-sm">
        {q.isPending ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : (
          (q.data?.items ?? []).map((item, i) => (
            <div key={i} className="flex flex-wrap items-start gap-2 border-b border-border/60 pb-2">
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {item.type}
              </Badge>
              <span className="shrink-0 text-xs text-muted-foreground ltr-nums">{new Date(String(item.at)).toLocaleString()}</span>
              <span className="min-w-0 flex-1">{timelineLabel(item, t)}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function timelineLabel(item: Item, t: TFunction): ReactNode {
  if (item.type === "VISIT" && item.encounterId)
    return <Link to={`/encounters/${String(item.encounterId)}`} className="text-primary hover:underline">{String(item.visitType ?? "Visit")}</Link>;
  if (item.type === "OPERATION" && item.operationId)
    return <Link to={`/operations`} className="text-primary hover:underline">{t("patients.timeline.operation", "Operation")}</Link>;
  if (item.type === "INVOICE" && item.invoiceId)
    return <span>{t("patients.timeline.invoice", "Invoice")} {String(item.number ?? "")}</span>;
  if (item.type === "MESSAGE" && item.ticketId)
    return <Link to={`/customer-support`} className="text-primary hover:underline">{String(item.title ?? "Message")}</Link>;
  return String(item.description ?? item.caption ?? item.kind ?? "—");
}
