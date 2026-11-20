import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DoorOpen, Hourglass, Megaphone, MonitorPlay, Play, Stethoscope } from "lucide-react";
import { EmptyState, PageHeader, StatCard, StatusChip, type KTone } from "@/brand/ui-kit";
import { Skeleton } from "@/components/skeleton";
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

function stageTone(stage: string): KTone {
  return stage === "CALLED" ? "info" : stage === "IN_EXAM" ? "good" : "warn";
}

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
    // Optimistic: flip the ticket to CALLED immediately; roll back if the API refuses.
    onMutate: async (ticketNumber) => {
      const key = ["front-desk", "board", activeClinic];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Board>(key);
      if (prev) {
        qc.setQueryData<Board>(key, {
          ...prev,
          lastCalledTicket: ticketNumber,
          waiting: prev.waiting.map((w) => (w.ticketNumber === ticketNumber ? { ...w, queueStage: "CALLED" } : w)),
        });
      }
      return { prev, key };
    },
    onError: (e: Error, _n, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["front-desk"] }),
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

  const longestWait = Math.max(0, ...waiting.map((w) => w.waitMinutes));
  const freeRooms = (boardQ.data?.rooms ?? []).filter((r) => r.free).length;
  const totalRooms = boardQ.data?.rooms?.length ?? 0;

  const renderRow = (w: QueueRow, actions: "waiting" | "exam") => (
    <div key={w.appointmentId} data-stage={w.queueStage} className="group flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-border/80 bg-card px-3 py-2.5 shadow-[var(--kx-shadow-1)] transition-[box-shadow,border-color] duration-150 hover:border-primary/30 hover:shadow-[var(--kx-shadow-2)]">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-accent font-mono text-lg font-bold tabular-nums text-accent-foreground ltr-nums" aria-label={t("frontDesk.ticket", "Ticket")}>#{w.ticketNumber ?? "—"}</span>
        <div className="min-w-0">
          <p className="truncate font-medium">{w.patientName}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="truncate">{w.clinicianName}</span>
            <span className={w.waitMinutes >= 45 && actions === "waiting" ? "font-semibold text-[hsl(var(--warning))]" : ""}>
              {t("frontDesk.waitMins", "{{n}} min", { n: Math.max(0, w.waitMinutes) })}
            </span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusChip tone={stageTone(w.queueStage)}>{stageBadge(w.queueStage, t)}</StatusChip>
            {w.roomLabel ? <StatusChip tone="brand" dot={false}><DoorOpen className="size-3" aria-hidden />{w.roomLabel}</StatusChip> : null}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions === "waiting" ? (
          <>
            <Button type="button" size="sm" variant="secondary" className="min-h-10 min-w-16" disabled={!w.ticketNumber || w.queueStage === "CALLED"} onClick={() => w.ticketNumber && callMut.mutate(w.ticketNumber)}>
              <Megaphone className="size-4" aria-hidden />{t("frontDesk.callTicket", "Call")}
            </Button>
            <Button type="button" size="sm" className="min-h-10" disabled={startVisitMut.isPending} onClick={() => startVisitMut.mutate(w.appointmentId)}>
              <Play className="size-4" aria-hidden />{t("frontDesk.startVisit", "Start visit")}
            </Button>
          </>
        ) : w.openEncounterId ? (
          <Button asChild size="sm" variant="default">
            <Link to={`/encounters/${w.openEncounterId}`}><Stethoscope className="size-4" aria-hidden />{t("frontDesk.openEncounter", "Open encounter")}</Link>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline" className="min-h-10">
          <Link to={`/appointments/${w.appointmentId}`}>{t("common.open", "Open")}</Link>
        </Button>
      </div>
    </div>
  );

  const loadingRows = (
    <div className="space-y-2" role="status" aria-busy="true">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[4.5rem] rounded-xl" />)}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("frontDesk.liveBoard", "Live clinic board")}
        description={t("frontDesk.flowHint", "Check-in → waiting → call → start visit (auto room) → finalize encounter frees the room.")}
        actions={
          <>
            <select className={`${nativeSelectClassName} h-9 min-h-9 w-auto max-w-[16rem] py-1 md:h-9`} value={activeClinic} onChange={(e) => setClinicId(e.target.value)} aria-label={t("cashDrawer.clinic", "Clinic")}>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>{c.nameEn}</option>
              ))}
            </select>
            <Button asChild variant="outline" size="sm">
              <Link to={`/front-desk/waiting-room?clinicId=${activeClinic}`} target="_blank"><MonitorPlay className="size-4" aria-hidden />{t("frontDesk.waitingScreen", "Waiting-room screen")}</Link>
            </Button>
          </>
        }
      />

      <nav aria-label={t("frontDesk.tools", "Front desk tools")} className="-mt-2 flex flex-wrap items-center gap-2">
        {[
          ["/front-desk/cash-drawer", "cash-drawer-link", t("cashDrawer.title", "Cash drawer")],
          ["/front-desk/installments", "installments-link", t("installments.title", "Installments")],
          ["/front-desk/claims", "claims-link", t("claims.title", "Claims")],
          ["/messaging/ai-receptionist", "ai-receptionist-link", t("aiReceptionist.title", "AI receptionist")],
        ].map(([to, id, label]) => (
          <Link key={id} to={to!} data-testid={id} className="rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-muted-foreground shadow-[var(--kx-shadow-1)] transition-colors hover:border-primary/30 hover:text-foreground">{label}</Link>
        ))}
        <span data-testid="front-desk-shortcuts" className="ms-auto hidden items-center gap-3 text-xs text-muted-foreground lg:flex">
          <span><kbd className="kx-kbd">N</kbd> {t("frontDesk.kbdCallNext", "call next")}</span>
          <span><kbd className="kx-kbd">S</kbd> {t("frontDesk.kbdStartNext", "start next visit")}</span>
          <span><kbd className="kx-kbd">Ctrl</kbd>+<kbd className="kx-kbd">K</kbd> {t("frontDesk.kbdFind", "find patient")}</span>
        </span>
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard tone="warn" icon={<Hourglass className="size-4" />} label={t("frontDesk.waitingQueue", "Waiting")} value={waiting.length} />
        <StatCard tone="good" icon={<Stethoscope className="size-4" />} label={t("frontDesk.inExamQueue", "In exam rooms")} value={boardQ.data?.inExam?.length ?? 0} />
        <StatCard tone="info" icon={<DoorOpen className="size-4" />} label={t("frontDesk.rooms", "Rooms")} value={`${freeRooms}/${totalRooms}`} hint={t("frontDesk.roomFree", "Free")} />
        <StatCard tone={longestWait >= 45 ? "bad" : "neutral"} icon={<Hourglass className="size-4" />} label={t("frontDesk.longestWait", "Longest wait")} value={t("frontDesk.waitMins", "{{n}} min", { n: longestWait })} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("frontDesk.waitingQueue", "Waiting")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {boardQ.isPending ? loadingRows : null}
            {(boardQ.data?.waiting ?? []).map((w) => renderRow(w, "waiting"))}
            {!boardQ.data?.waiting?.length && !boardQ.isPending ? (
              <EmptyState compact title={t("frontDesk.noWaiting", "No patients in the waiting queue.")} />
            ) : null}
          </CardContent>
          <CardHeader className="pt-0">
            <CardTitle className="text-base">{t("frontDesk.inExamQueue", "In exam rooms")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(boardQ.data?.inExam ?? []).map((w) => renderRow(w, "exam"))}
            {!boardQ.data?.inExam?.length && !boardQ.isPending ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-muted-foreground">{t("frontDesk.noInExam", "No patients in exam rooms.")}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-base">{t("frontDesk.rooms", "Rooms")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {boardQ.data?.lastCalledTicket != null ? (
              <p className="text-sm text-muted-foreground">
                {t("frontDesk.lastCalled", "Last called")}: <strong className="text-foreground ltr-nums">#{boardQ.data.lastCalledTicket}</strong>
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {(boardQ.data?.rooms ?? []).map((r) => (
                <div key={r.label} className={`rounded-lg border px-3 py-2 text-sm ${r.free ? "border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.07)]" : "border-border bg-muted/40"}`}>
                  <div className="font-medium">{r.label}</div>
                  <div className={`text-xs ${r.free ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}`}>
                    {r.free ? t("frontDesk.roomFree", "Free") : t("frontDesk.roomBusy", "In use")}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <KiorexConfirmQueuePanel clinicId={activeClinic || undefined} />
      <WaitlistPanel clinicId={activeClinic || undefined} />
    </div>
  );
}
