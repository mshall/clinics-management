import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClinicsQuery } from "@/lib/api-hooks";
import { apiGet, apiPost } from "@/lib/http";
import { nativeSelectClassName } from "@/lib/form-control-styles";

type Board = {
  waiting: {
    appointmentId: string;
    ticketNumber: number | null;
    patientName: string;
    clinicianName: string;
    waitMinutes: number;
    roomLabel: string | null;
    alerts: string[];
  }[];
  rooms: { label: string; free: boolean }[];
  lastCalledTicket: number | null;
};

export function FrontDeskBoardPage() {
  const { t } = useTranslation();
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("frontDesk.liveBoard", "Live clinic board")}</h1>
        <div className="flex flex-wrap gap-2">
          <select className={nativeSelectClassName} value={activeClinic} onChange={(e) => setClinicId(e.target.value)}>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameEn}
              </option>
            ))}
          </select>
          <Button asChild variant="outline" size="sm">
            <Link to={`/front-desk/waiting-room?clinicId=${activeClinic}`} target="_blank">
              {t("frontDesk.waitingScreen", "Waiting-room screen")}
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("frontDesk.waitingQueue", "Waiting")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(boardQ.data?.waiting ?? []).map((w) => (
              <div key={w.appointmentId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div>
                  <span className="font-mono text-lg font-bold ltr-nums">#{w.ticketNumber ?? "—"}</span>
                  <span className="ms-2 font-medium">{w.patientName}</span>
                  <span className="ms-2 text-muted-foreground">· {w.clinicianName}</span>
                  <span className="ms-2 text-xs text-muted-foreground ltr-nums">
                    {t("frontDesk.waitMins", "{{n}} min", { n: w.waitMinutes })}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" disabled={!w.ticketNumber} onClick={() => w.ticketNumber && callMut.mutate(w.ticketNumber)}>
                    {t("frontDesk.callTicket", "Call")}
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/appointments/${w.appointmentId}`}>{t("common.open", "Open")}</Link>
                  </Button>
                </div>
              </div>
            ))}
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
              <div key={r.label} className="flex justify-between rounded border px-2 py-1 text-sm">
                <span>{r.label}</span>
                <span className={r.free ? "text-emerald-600" : "text-amber-600"}>{r.free ? t("frontDesk.roomFree", "Free") : t("frontDesk.roomBusy", "In use")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
