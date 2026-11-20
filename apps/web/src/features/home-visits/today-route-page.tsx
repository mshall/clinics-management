import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/lib/http";

type Address = { masked: true; district: string } | { masked: false; district: string; line1?: string; building?: string; floor?: string; flat?: string; landmark?: string };
type Visit = {
  id: string;
  appointmentId?: string;
  state: "REQUESTED" | "CONFIRMED" | "ON_MY_WAY" | "ARRIVED" | "FINISHED" | "ABORTED_UNSAFE" | "CANCELLED" | "NO_SHOW";
  plannedStartsAt: string;
  plannedEndsAt: string;
  district: string;
  address: Address;
  patient: { id: string; name?: string; phone?: string };
  fee?: { baseFee: number; surcharge: number; total: number };
  navigationUrl?: string | null;
  travelMinutesFromPrevious?: number | null;
};
type RouteResponse = { date: string; view: "LIST" | "ROUTE"; items: Visit[] };
type SosResult = { show: { ambulance: string; police: string }; delivered: boolean };

function position(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("geolocation unavailable"));
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, { enableHighAccuracy: true, timeout: 10_000 });
  });
}

/**
 * HVEXE01 — the clinician's "Today" route: home visits in time order with On my way, Arrived, Finished, Leave visit (unsafe) and one-tap SOS.
 * The address and phone render only when the server returned them (assigned clinician / admin, from CONFIRMED, never 24 h after the visit).
 * Safety actions are always shown: they are not gated by any feature flag (ADR-025).
 */
export function TodayRoutePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [sos, setSos] = useState<SosResult | null>(null);
  const [unsafeFor, setUnsafeFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const route = useQuery({ queryKey: ["home-visits", "route"], queryFn: () => apiGet<RouteResponse>("/api/v1/home-visits/route"), refetchInterval: 30_000 });

  const act = useMutation({
    mutationFn: async (p: { id: string; action: "depart" | "arrive" | "finish" | "abort-unsafe" | "sos"; body?: Record<string, unknown> }) => {
      const needsPos = p.action !== "finish" && p.action !== "depart";
      const geo = needsPos || p.action === "depart" || p.action === "finish" ? await position().catch(() => null) : null;
      if (needsPos && !geo && p.action !== "abort-unsafe") throw new Error(t("homeVisits.needLocation"));
      return apiPost<unknown>(`/api/v1/home-visits/${p.id}/${p.action}`, { ...(geo ?? {}), ...(p.body ?? {}) });
    },
    onSuccess: (data, v) => {
      if (v.action === "sos") setSos(data as SosResult);
      setUnsafeFor(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["home-visits"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("homeVisits.failed")),
  });

  const items = route.data?.items ?? [];
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4" data-testid="home-today-route">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t("homeVisits.today")}</h1>
        <Button asChild size="sm" variant="outline"><Link to="/nurse/safety">{t("nurse.safety.title")}</Link></Button>
      </div>
      {sos ? (
        <Card className="border-destructive" role="alert" data-testid="sos-panel">
          <CardContent className="space-y-1 p-4">
            <p className="font-semibold">{sos.delivered ? t("homeVisits.sosSent") : t("homeVisits.sosNotDelivered")}</p>
            <p>{t("homeVisits.callAmbulance", { number: sos.show.ambulance })}</p>
            <p>{t("homeVisits.callPolice", { number: sos.show.police })}</p>
          </CardContent>
        </Card>
      ) : null}
      {route.isLoading ? <p className="text-sm text-muted-foreground">{t("common.loading", "Loading")}</p> : null}
      {!route.isLoading && items.length === 0 ? <p className="text-sm text-muted-foreground">{t("homeVisits.none")}</p> : null}
      {items.map((v) => {
        const active = v.state === "ON_MY_WAY" || v.state === "ARRIVED";
        return (
          <Card key={v.id} data-testid="home-visit-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{new Date(v.plannedStartsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {v.patient.name ?? v.district}</span>
                <span className="text-xs font-normal text-muted-foreground">{t(`homeVisits.state.${v.state}`)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {v.address.masked ? (
                <p className="text-muted-foreground">{t("homeVisits.addressMasked", { district: v.address.district })}</p>
              ) : (
                <p>{[v.address.line1, v.address.building, v.address.floor && `${t("homeVisits.floor")} ${v.address.floor}`, v.address.flat && `${t("homeVisits.flat")} ${v.address.flat}`, v.address.landmark, v.address.district].filter(Boolean).join(", ")}</p>
              )}
              {v.patient.phone ? <a className="text-primary underline" href={`tel:${v.patient.phone}`}>{v.patient.phone}</a> : null}
              {v.fee ? <p>{t("homeVisits.fee", { base: v.fee.baseFee, surcharge: v.fee.surcharge })}</p> : null}
              {v.travelMinutesFromPrevious != null ? <p className="text-muted-foreground">{t("homeVisits.travel", { minutes: v.travelMinutesFromPrevious })}</p> : null}
              {v.navigationUrl ? <a className="text-primary underline" href={v.navigationUrl} target="_blank" rel="noreferrer">{t("homeVisits.navigate")}</a> : null}
              <div className="flex flex-wrap gap-2 pt-1">
                {v.state === "CONFIRMED" ? <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: v.id, action: "depart" })}>{t("homeVisits.onMyWay")}</Button> : null}
                {v.state === "ON_MY_WAY" ? <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: v.id, action: "arrive" })}>{t("homeVisits.arrived")}</Button> : null}
                {v.state === "ARRIVED" ? <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: v.id, action: "finish" })}>{t("homeVisits.finished")}</Button> : null}
                {v.appointmentId && (v.state === "ARRIVED" || v.state === "FINISHED") ? (
                  <Button asChild size="sm" variant="outline" data-testid="open-visit-record"><Link to={`/nurse/visits/${v.appointmentId}`}>{t("nurse.visit.open")}</Link></Button>
                ) : null}
                {active ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setUnsafeFor(unsafeFor === v.id ? null : v.id)}>{t("homeVisits.leaveUnsafe")}</Button>
                    <Button size="sm" variant="destructive" data-testid="sos-button" disabled={act.isPending} onClick={() => act.mutate({ id: v.id, action: "sos" })}>{t("homeVisits.sos")}</Button>
                  </>
                ) : null}
              </div>
              {unsafeFor === v.id ? (
                <div className="space-y-2 rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">{t("homeVisits.unsafeHelp")}</p>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("homeVisits.unsafeReason")} />
                  <Button size="sm" disabled={!reason.trim() || act.isPending} onClick={() => act.mutate({ id: v.id, action: "abort-unsafe", body: { reason } })}>{t("homeVisits.confirmLeave")}</Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
