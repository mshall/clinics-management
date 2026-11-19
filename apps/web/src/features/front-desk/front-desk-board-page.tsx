import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClinicsQuery } from "@/lib/api-hooks";
import { apiGet, apiPost } from "@/lib/http";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { KiorexConfirmQueuePanel } from "@/features/front-desk/kiorex-confirm-queue-panel";
import { WaitlistPanel } from "@/features/front-desk/waitlist-panel";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts";

type QueueRow = {
  appointmentId: string;
  ticketNumber: number | null;
  patientName: string;
  clinicianName: string;
  waitMinutes: number;
  queueStage: string;
  roomLabel: string | null;
  openEncounterId: string | null;
  alerts: string[];
};

type Board = {
  waiting: QueueRow[];
  inExam: QueueRow[];
  rooms: { label: string; free: boolean; appointmentId: string | null }[];
  lastCalledTicket: number | null;
};

function stageBadge(stage: string, t: (k: string, f: string) => string) {
  switch (stage) {
    case "CALLED":
      return t("frontDesk.stageCalled", "Called");
    case "IN_EXAM":
      return t("frontDesk.stageInExam", "In exam");
    default:
      return t("frontDesk.stageWaiting", "Waiting");
  }
}

export function FrontDeskBoardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: clinics = [] } = useClinicsQuery();
  const [clinicId, setClinicId] = useState("");
  const activeClinic = clinicId || clinics[0]?.id || "";

  const boardQ = useQuery({
    queryKey: ["front-desk", "board", activeClinic],
    queryFn: () => apiGet<Board>(`/api/v1/front-desk/board?clinicId=${encodeURIComponent(activeClinic)}`),
    enabled: Boolean(activeClinic),
    refetchInterval: 15_000,
  });

  const callMut = useMutation({
    mutationFn: (ticketNumber: number) => apiPost("/api/v1/front-desk/call-ticket", { clinicId: activeClinic, ticketNumber }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["front-desk"] }),
  });

  const startVisitMut = useMutation({
    mutationFn: (appointmentId: string) =>
      apiPost<{ encounterId: string }>(`/api/v1/front-desk/appointments/${appointmentId}/start-visit`, {}),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["front-desk"] });
      toast.success(t("frontDesk.visitStarted", "Visit started — exam room assigned."));
      void navigate(`/encounters/${data.encounterId}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const waiting = boardQ.data?.waiting ?? [];
  const nextToCall = waiting.find((w) => w.queueStage !== "CALLED" && w.ticketNumber != null);
  const nextToStart = waiting.find((w) => w.queueStage === "CALLED") ?? waiting[0];
  useKeyboardShortcuts([
    {
      key: "n",
      handler: () => {
        if (nextToCall?.ticketNumber != null && !callMut.isPending) callMut.mutate(nextToCall.ticketNumber);
      },
    },
    {
      key: "s",
      handler: () => {
        if (nextToStart && !startVisitMut.isPending) startVisitMut.mutate(nextToStart.appointmentId);
      },
    },
  ]);

  const renderRow = (w: QueueRow, actions: "waiting" | "exam") => (
    <div key={w.appointmentId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg font-bold ltr-nums">#{w.ticketNumber ?? "—"}</span>
          <Badge variant="outline" className="text-xs">
            {stageBadge(w.queueStage, t)}
          </Badge>
          {w.roomLabel ? (
            <Badge variant="secondary" className="text-xs">
              {w.roomLabel}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 font-medium">{w.patientName}</p>
        <p className="text-xs text-muted-foreground">
          {w.clinicianName} · {t("frontDesk.waitMins", "{{n}} min", { n: w.waitMinutes })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions === "waiting" ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-10 min-w-16"
              disabled={!w.ticketNumber}
              onClick={() => w.ticketNumber && callMut.mutate(w.ticketNumber)}
            >
              {t("frontDesk.callTicket", "Call")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-h-10"
              disabled={startVisitMut.isPending}
              onClick={() => startVisitMut.mutate(w.appointmentId)}
            >
              {t("frontDesk.startVisit", "Start visit")}
            </Button>
          </>
        ) : w.openEncounterId ? (
          <Button asChild size="sm" variant="default">
            <Link to={`/encounters/${w.openEncounterId}`}>{t("frontDesk.openEncounter", "Open encounter")}</Link>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline" className="min-h-10">
          <Link to={`/appointments/${w.appointmentId}`}>{t("common.open", "Open")}</Link>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("frontDesk.liveBoard", "Live clinic board")}</h1>
          <p className="text-sm text-muted-foreground">{t("frontDesk.flowHint", "Check-in → waiting → call → start visit (auto room) → finalize encounter frees the room.")}</p>
          <p className="hidden text-xs text-muted-foreground lg:block" data-testid="front-desk-shortcuts">
            {t("frontDesk.boardShortcuts", "Shortcuts: N call next · S start next visit · Ctrl+K find patient")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className={nativeSelectClassName} value={activeClinic} onChange={(e) => setClinicId(e.target.value)}>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameEn}
              </option>
            ))}
          </select>
          <Button asChild variant="outline" size="sm">
            <Link to="/front-desk/cash-drawer" data-testid="cash-drawer-link">
              {t("cashDrawer.title", "Cash drawer")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/front-desk/installments" data-testid="installments-link">
              {t("installments.title", "Installments")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/front-desk/waiting-room?clinicId=${activeClinic}`} target="_blank">
              {t("frontDesk.waitingScreen", "Waiting-room screen")}
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 space-y-4">
          <CardHeader>
            <CardTitle className="text-base">{t("frontDesk.waitingQueue", "Waiting")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(boardQ.data?.waiting ?? []).map((w) => renderRow(w, "waiting"))}
            {!boardQ.data?.waiting?.length && !boardQ.isPending ? (
              <p className="text-muted-foreground">{t("frontDesk.noWaiting", "No patients in the waiting queue.")}</p>
            ) : null}
          </CardContent>
          <CardHeader className="pt-0">
            <CardTitle className="text-base">{t("frontDesk.inExamQueue", "In exam rooms")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(boardQ.data?.inExam ?? []).map((w) => renderRow(w, "exam"))}
            {!boardQ.data?.inExam?.length && !boardQ.isPending ? (
              <p className="text-muted-foreground">{t("frontDesk.noInExam", "No patients in exam rooms.")}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("frontDesk.rooms", "Rooms")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {boardQ.data?.lastCalledTicket != null ? (
              <p className="text-sm">
                {t("frontDesk.lastCalled", "Last called")}: <strong className="ltr-nums">#{boardQ.data.lastCalledTicket}</strong>
              </p>
            ) : null}
            {(boardQ.data?.rooms ?? []).map((r) => (
              <div key={r.label} className="flex justify-between gap-2 rounded border px-2 py-1 text-sm">
                <span>{r.label}</span>
                <span className={r.free ? "text-emerald-600" : "text-amber-600"}>
                  {r.free ? t("frontDesk.roomFree", "Free") : t("frontDesk.roomBusy", "In use")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <KiorexConfirmQueuePanel clinicId={activeClinic || undefined} />
      <WaitlistPanel clinicId={activeClinic || undefined} />
    </div>
  );
}