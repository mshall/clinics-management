import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { setPaymentFlowActive } from "@/lib/unsaved-work-registry";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { VisitCollectionFields, type VisitCollectionFieldsHandle } from "@/components/visit-collection-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import type { AppointmentDto } from "@/lib/api-types";
import { apiPatch, apiPost, ApiError } from "@/lib/http";
import { apiErrorMessage } from "@/lib/api-error-message";
import {
  emptyVisitCollection,
  isTransferReferenceApiError,
  validateVisitCollection,
  visitCollectionToApi,
  type VisitCollectionValue,
} from "@/lib/visit-collection";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts";
import { transferRulesFromMarket, useTenantMarket } from "@/lib/use-tenant-market";


type Props = { appointment: AppointmentDto; currency?: string; examRoomOptions?: string[] };

export function QuickCheckInPanel({ appointment, currency = "AED", examRoomOptions = [] }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [payment, setPayment] = useState(String(appointment.feeAmount ?? ""));
  const [room, setRoom] = useState(appointment.preferredRoomLabel ?? appointment.roomLabel ?? "");
  const [collection, setCollection] = useState<VisitCollectionValue>(emptyVisitCollection);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const fieldsRef = useRef<VisitCollectionFieldsHandle>(null);
  const rules = transferRulesFromMarket(useTenantMarket().data);

  const paymentAmount = Number.parseFloat(payment.trim());
  const effectiveAmount = Number.isFinite(paymentAmount) && paymentAmount > 0 ? paymentAmount : 0;

  const updateCollection = (next: VisitCollectionValue) => {
    setCollection(next);
    setReferenceError(null);
  };

  const checkIn = useMutation({
    mutationFn: () => {
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
    onError: (e: unknown) => {
      if (e instanceof ApiError && isTransferReferenceApiError(e.body)) {
        setReferenceError(apiErrorMessage(e));
        fieldsRef.current?.focusReference();
        return;
      }
      toast.error(e instanceof ApiError || e instanceof Error ? apiErrorMessage(e) : String(e));
    },
  });

  const undoCheckIn = useMutation({
    mutationFn: () =>
      apiPatch<AppointmentDto>(`/api/v1/appointments/${appointment.id}`, { status: "CONFIRMED" }),
    onSuccess: () => {
      toast.success(
        t(
          "frontDesk.undoCheckInDone",
          "Check-in undone. Queue ticket and draft visit were cleared — you can check in again when ready.",
        ),
      );
      void qc.invalidateQueries({ queryKey: ["appointment", appointment.id] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["front-desk"] });
      void qc.invalidateQueries({ queryKey: ["encounters"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError || e instanceof Error ? apiErrorMessage(e) : String(e));
    },
  });

  const submit = () => {
    if (checkIn.isPending) return;
    const collectErr = validateVisitCollection(effectiveAmount, collection, t, rules);
    if (collectErr) {
      setSubmitAttempted(true);
      if (collection.mode === "MONEY_TRANSFER") fieldsRef.current?.focusReference();
      else toast.error(collectErr);
      return;
    }
    checkIn.mutate();
  };

  const active = appointment.status !== "CHECKED_IN" && appointment.status !== "COMPLETED" && appointment.status !== "CANCELLED";
  useKeyboardShortcuts(
    [
      { key: "Enter", mod: true, allowInInputs: true, handler: submit },
      ...[1, 2, 3, 4, 5].map((n) => ({
        key: String(n),
        alt: true,
        allowInInputs: true,
        handler: () => fieldsRef.current?.selectOption(n - 1),
      })),
    ],
    active,
  );

  useEffect(() => {
    if (!checkIn.isPending) return;
    setPaymentFlowActive(true);
    return () => setPaymentFlowActive(false);
  }, [checkIn.isPending]);

  if (appointment.status === "CHECKED_IN") {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3 text-sm">
          {appointment.queueTicketNumber ? (
            <p data-testid="checked-in-ticket">
              {t("frontDesk.checkedInTicket", "Ticket")}{" "}
              <strong className="ltr-nums">#{appointment.queueTicketNumber}</strong>
              {appointment.checkedInAt ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {new Date(appointment.checkedInAt).toLocaleTimeString()}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-muted-foreground">
              {t("frontDesk.checkedInNoTicket", "Patient is checked in.")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {appointment.openEncounterId ? (
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to={`/encounters/${appointment.openEncounterId}`}>
                  {t("frontDesk.openEncounter", "Open encounter")}
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={undoCheckIn.isPending}
              data-testid="undo-check-in"
              onClick={() => undoCheckIn.mutate()}
            >
              {t("frontDesk.undoCheckIn", "Undo check-in")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "frontDesk.undoCheckInHint",
              "Returns the appointment to Confirmed and clears the queue ticket and draft encounter so you can restart the visit flow.",
            )}
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
        <div className="space-y-1 sm:col-span-2">
          <Label optional>{t("frontDesk.collectPayment", "Payment today")}</Label>
          <Input
            type="number"
            inputMode="decimal"
            className="min-h-11 max-w-xs ltr-nums"
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            data-testid="check-in-amount"
          />
        </div>
        <VisitCollectionFields
          ref={fieldsRef}
          className="sm:col-span-2"
          amount={effectiveAmount}
          value={collection}
          onChange={updateCollection}
          disabled={checkIn.isPending}
          referenceError={referenceError}
          showErrors={submitAttempted}
          onSubmit={submit}
          shortcutHints
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
        <div className="space-y-1 sm:col-span-2">
          <Button
            type="button"
            className="min-h-12 w-full text-base sm:w-auto"
            disabled={checkIn.isPending}
            onClick={submit}
            data-testid="quick-check-in-submit"
          >
            {t("frontDesk.checkInButton", "Check in & print ticket")}
          </Button>
          <p className="hidden text-xs text-muted-foreground lg:block">
            {t("frontDesk.checkInShortcutHint", "Ctrl+Enter to check in · Alt+1… to pick the payment method")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}