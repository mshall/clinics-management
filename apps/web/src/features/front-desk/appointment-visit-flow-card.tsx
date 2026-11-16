import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppointmentDto } from "@/lib/api-types";
import { apiPost } from "@/lib/http";

type Props = { appointment: AppointmentDto };

export function AppointmentVisitFlowCard({ appointment }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const startVisit = useMutation({
    mutationFn: () =>
      apiPost<{ encounterId: string }>(`/api/v1/front-desk/appointments/${appointment.id}/start-visit`, {}),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["appointment", appointment.id] });
      void qc.invalidateQueries({ queryKey: ["front-desk"] });
      toast.success(t("frontDesk.visitStarted", "Visit started — exam room assigned."));
      void navigate(`/encounters/${data.encounterId}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (appointment.status === "COMPLETED" || appointment.status === "CANCELLED") return null;

  const stage = appointment.queueStage ?? (appointment.status === "CHECKED_IN" ? "WAITING" : null);
  if (!stage && appointment.status !== "CHECKED_IN") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("frontDesk.visitFlow", "Visit flow")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {stage ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t("frontDesk.queueStage", "Stage")}:</span>
            <Badge variant="outline">{stage}</Badge>
            {appointment.roomLabel ? <Badge variant="secondary">{appointment.roomLabel}</Badge> : null}
            {appointment.preferredRoomLabel && !appointment.roomLabel ? (
              <span className="text-xs text-muted-foreground">
                {t("frontDesk.preferredRoom", "Preferred")}: {appointment.preferredRoomLabel}
              </span>
            ) : null}
          </div>
        ) : null}
        {stage === "IN_EXAM" ? (
          <p className="text-muted-foreground">{t("frontDesk.inExamHint", "Finalize the encounter to complete the visit and free the exam room.")}</p>
        ) : appointment.status === "CHECKED_IN" ? (
          <div className="flex flex-wrap gap-2">
            {appointment.openEncounterId ? (
              <Button type="button" variant="outline" asChild>
                <Link to={`/encounters/${appointment.openEncounterId}`}>
                  {t("frontDesk.openEncounter", "Open encounter")}
                </Link>
              </Button>
            ) : null}
            <Button type="button" disabled={startVisit.isPending} onClick={() => startVisit.mutate()}>
              {t("frontDesk.startVisit", "Start visit")}
            </Button>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          <Link to="/front-desk/board" className="text-primary hover:underline">
            {t("frontDesk.liveBoard", "Live clinic board")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}