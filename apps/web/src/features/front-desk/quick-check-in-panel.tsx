import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppointmentDto } from "@/lib/api-types";
import { apiPost } from "@/lib/http";

type Props = { appointment: AppointmentDto; currency?: string };

export function QuickCheckInPanel({ appointment, currency = "AED" }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [payment, setPayment] = useState(String(appointment.feeAmount ?? ""));
  const [room, setRoom] = useState(appointment.roomLabel ?? "");

  const checkIn = useMutation({
    mutationFn: () =>
      apiPost<{ queueTicketNumber: number }>(`/api/v1/front-desk/appointments/${appointment.id}/check-in`, {
        paymentAmount: payment.trim() === "" ? undefined : Number(payment),
        roomLabel: room.trim() || undefined,
        currency,
      }),
    onSuccess: (data) => {
      toast.success(t("frontDesk.checkInDone", "Checked in · ticket #{{n}}", { n: data.queueTicketNumber }));
      void qc.invalidateQueries({ queryKey: ["appointment", appointment.id] });
      void qc.invalidateQueries({ queryKey: ["front-desk"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (appointment.status === "CHECKED_IN" && appointment.queueTicketNumber) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm">
          <p>
            {t("frontDesk.checkedInTicket", "Ticket")} <strong className="ltr-nums">#{appointment.queueTicketNumber}</strong>
            {appointment.checkedInAt ? (
              <span className="text-muted-foreground"> · {new Date(appointment.checkedInAt).toLocaleTimeString()}</span>
            ) : null}
          </p>
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
        <div className="space-y-1">
          <Label optional>{t("frontDesk.collectPayment", "Payment today")}</Label>
          <Input type="number" value={payment} onChange={(e) => setPayment(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label optional>{t("frontDesk.room", "Room")}</Label>
          <Input value={room} onChange={(e) => setRoom(e.target.value)} />
        </div>
        <Button type="button" className="sm:col-span-2" disabled={checkIn.isPending} onClick={() => checkIn.mutate()}>
          {t("frontDesk.checkInButton", "Check in & print ticket")}
        </Button>
      </CardContent>
    </Card>
  );
}
