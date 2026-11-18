import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppointmentsQuery } from "@/lib/api-hooks";
import { apiPatch } from "@/lib/http";
import { resolvePatientListLabel } from "@/lib/patient-display";
import { formatAppointmentTimeRange } from "@/lib/appointment-scheduling";

type Props = { clinicId?: string };

export function KiorexConfirmQueuePanel({ clinicId }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useAppointmentsQuery({
    page: 1,
    pageSize: 20,
    sortBy: "startsAt",
    sortOrder: "asc",
    clinicId,
    bookingSource: "KIOREX_MARKETPLACE",
    status: "SCHEDULED",
    enabled: Boolean(clinicId),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/v1/appointments/${encodeURIComponent(id)}/status`, { status: "CONFIRMED" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(t("kiorex.confirmQueue.confirmed", "Appointment confirmed"));
    },
  });

  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("kiorex.confirmQueue.title", "Kiorex — confirm bookings")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("kiorex.confirmQueue.hint", "Manual-confirm clinics: approve marketplace bookings before reminders go out.")}
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("kiorex.confirmQueue.empty", "No pending Kiorex bookings")}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((a) => {
              const patient = resolvePatientListLabel({
                patientId: a.patientId,
                patientMrn: a.patientMrn,
                patientName: a.patientName,
              });
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                  <div className="text-sm">
                    <span className="font-medium">{patient.text}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {formatAppointmentTimeRange(a.startsAt, a.endsAt, i18n.language)}
                    </span>
                  </div>
                  <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate(a.id)}>
                    {t("kiorex.confirmQueue.confirm", "Confirm")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}