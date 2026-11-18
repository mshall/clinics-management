import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { setPaymentFlowActive } from "@/lib/unsaved-work-registry";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { VisitCollectionFields } from "@/components/visit-collection-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import type { AppointmentDto } from "@/lib/api-types";
import { apiPost, ApiError } from "@/lib/http";
import { apiErrorMessage } from "@/lib/api-error-message";
import {
  emptyVisitCollection,
  validateVisitCollection,
  visitCollectionToApi,
  type VisitCollectionValue,
} from "@/lib/visit-collection";

type Props = { appointment: AppointmentDto; currency?: string; examRoomOptions?: string[] };

export function QuickCheckInPanel({ appointment, currency = "AED", examRoomOptions = [] }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [payment, setPayment] = useState(String(appointment.feeAmount ?? ""));
  const [room, setRoom] = useState(appointment.preferredRoomLabel ?? appointment.roomLabel ?? "");
  const [collection, setCollection] = useState<VisitCollectionValue>(emptyVisitCollection);

  const paymentAmount = Number.parseFloat(payment.trim());
  const effectiveAmount = Number.isFinite(paymentAmount) && paymentAmount > 0 ? paymentAmount : 0;

  const checkIn = useMutation({
    mutationFn: () => {
      const collectErr = validateVisitCollection(effectiveAmount, collection, t);
      if (collectErr) throw new Error(collectErr);
      return apiPost<{
        queueTicketNumber: number;
        openEncounterId?: string | null;
        checkedInAt?: string;
        status?: string;
      }>(
        `/api/v1/front-desk/appointments/${appointment.id}/check-in`,
        {
          paymentAmount: effectiveAmount > 0 ? effectiveAmount : undefined,
          roomLabel: room.trim() || undefined,
          currency,
          visitCollection: visitCollectionToApi(effectiveAmount, collection),
        },
      );
    },
    onSuccess: (data) => {
      toast.success(t("frontDesk.checkInDone", "Checked in · ticket #{{n}}", { n: data.queueTicketNumber }));
      qc.setQueryData<AppointmentDto>(["appointment", appointment.id], (prev) =>
        prev
          ? {
              ...prev,
              status: "CHECKED_IN",
              queueTicketNumber: data.queueTicketNumber,
              checkedInAt: data.checkedInAt ?? prev.checkedInAt,
              openEncounterId: data.openEncounterId ?? prev.openEncounterId,
              queueStage: prev.queueStage ?? "WAITING",
            }
          : prev,
      );
      void qc.invalidateQueries({ queryKey: ["appointment", appointment.id] });
      void qc.invalidateQueries({ queryKey: ["front-desk"] });
      void qc.invalidateQueries({ queryKey: ["encounters"] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError || e instanceof Error ? apiErrorMessage(e) : String(e)),
  });

  useEffect(() => {
    if (!checkIn.isPending) return;
    setPaymentFlowActive(true);
    return () => setPaymentFlowActive(false);
  }, [checkIn.isPending]);

  if (appointment.status === "CHECKED_IN" && appointment.queueTicketNumber) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3 text-sm">
          <p>
            {t("frontDesk.checkedInTicket", "Ticket")} <strong className="ltr-nums">#{appointment.queueTicketNumber}</strong>
            {appointment.checkedInAt ? (
              <span className="text-muted-foreground"> · {new Date(appointment.checkedInAt).toLocaleTimeString()}</span>
            ) : null}
          </p>
          {appointment.openEncounterId ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to={`/encounters/${appointment.openEncounterId}`}>
                {t("frontDesk.openEncounter", "Open encounter")}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (appointment.status === "COMPLETED" || appointment.status === "CANCELLED") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("frontDesk.quickCheckIn", "Quick check-in")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label optional>{t("frontDesk.collectPayment", "Payment today")}</Label>
          <Input type="number" className="max-w-xs ltr-nums" value={payment} onChange={(e) => setPayment(e.target.value)} />
        </div>
        <VisitCollectionFields
          className="sm:col-span-2"
          amount={effectiveAmount}
          value={collection}
          onChange={setCollection}
          disabled={checkIn.isPending}
        />
        <div className="space-y-1 sm:col-span-2">
          <Label optional>{t("frontDesk.preferredExamRoom", "Preferred exam room")}</Label>
          {examRoomOptions.length ? (
            <select className={`max-w-xs ${nativeSelectClassName}`} value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">{t("frontDesk.autoAssignRoom", "Auto-assign when visit starts")}</option>
              {examRoomOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <Input className="max-w-xs" value={room} onChange={(e) => setRoom(e.target.value)} placeholder={t("frontDesk.autoAssignRoom", "Auto-assign when visit starts")} />
          )}
          <p className="text-xs text-muted-foreground">{t("frontDesk.preferredRoomHint", "Patient waits in the queue until Start visit assigns a room.")}</p>
        </div>
        <Button type="button" className="sm:col-span-2" disabled={checkIn.isPending} onClick={() => checkIn.mutate()}>
          {t("frontDesk.checkInButton", "Check in & print ticket")}
        </Button>
      </CardContent>
    </Card>
  );
}