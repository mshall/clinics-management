import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, MapPin, Navigation, Phone, ShieldAlert } from "lucide-react";
import { EmptyState, StatusChip, type KTone } from "@/brand/ui-kit";
import { Skeleton } from "@/components/skeleton";
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
  const { t, i18n } = useTranslation();
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
    onMutate: async (v) => {
      // Optimistic: move the card to its next state at once; rolled back on error.
      const next: Record<string, Visit["state"]> = { depart: "ON_MY_WAY", arrive: "ARRIVED", finish: "FINISHED" };
      const key = ["home-visits", "route"];
      const prev = qc.getQueryData<RouteResponse>(key);
      if (prev && next[v.action]) qc.setQueryData<RouteResponse>(key, { ...prev, items: prev.items.map((i) => (i.id === v.id ? { ...i, state: next[v.action]! } : i)) });
      return { prev, key };
    },
    onSuccess: (data, v) => {
      if (v.action === "sos") setSos(data as SosResult);
      setUnsafeFor(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["home-visits"] });
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(e instanceof Error ? e.message : t("homeVisits.failed"));
    },
  });

  const items = route.data?.items ?? [];
  const OPEN_STATES = ["CONFIRMED", "ON_MY_WAY", "ARRIVED"];
  const nextId = items.find((v) => OPEN_STATES.includes(v.state))?.id;
  const doneCount = items.filter((v) => v.state === "FINISHED").length;
  const timeFmt = new Intl.DateTimeFormat(i18n.language.startsWith("ar") ? "ar-EG" : undefined, { hour: "2-digit", minute: "2-digit" });
  const tone = (st: Visit["state"]): KTone =>
    st === "FINISHED" ? "good" : st === "ON_MY_WAY" ? "warn" : st === "ARRIVED" ? "brand" : st === "CONFIRMED" ? "info" : st === "ABORTED_UNSAFE" ? "bad" : "neutral";

  const primary = (v: Visit) => {
    const common = { size: "lg" as const, className: "w-full", disabled: act.isPending };
    if (v.state === "CONFIRMED") return <Button {...common} onClick={() => act.mutate({ id: v.id, action: "depart" })}><Navigation className="size-5" aria-hidden />{t("homeVisits.onMyWay")}</Button>;
    if (v.state === "ON_MY_WAY") return <Button {...common} onClick={() => act.mutate({ id: v.id, action: "arrive" })}><MapPin className="size-5" aria-hidden />{t("homeVisits.arrived")}</Button>;
    if (v.state === "ARRIVED") return <Button {...common} onClick={() => act.mutate({ id: v.id, action: "finish" })}><CheckCircle2 className="size-5" aria-hidden />{t("homeVisits.finished")}</Button>;
    return null;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24 md:pb-4" data-testid="home-today-route">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1>{t("homeVisits.today")}</h1>
          {items.length > 0 ? (
            <p className="mt-1 flex items-center gap-2" aria-live="polite">
              <span className="tabular-nums ltr-nums">{doneCount}/{items.length}</span>
              <span aria-hidden className="relative h-1.5 w-24 overflow-hidden rounded-full bg-muted"><span className="absolute inset-y-0 start-0 rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${(doneCount / items.length) * 100}%` }} /></span>
            </p>
          ) : null}
        </div>
        <Button asChild size="sm" variant="outline"><Link to="/nurse/safety"><ShieldAlert className="size-4" aria-hidden />{t("nurse.safety.title")}</Link></Button>
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
      {route.isLoading ? <div role="status" aria-busy="true" className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div> : null}
      {!route.isLoading && items.length === 0 ? <EmptyState compact title={t("homeVisits.none")} /> : null}
      {items.map((v) => {
        const active = v.state === "ON_MY_WAY" || v.state === "ARRIVED";
        const isNext = v.id === nextId;
        const addr = v.address.masked ? null : [v.address.line1, v.address.building, v.address.floor && `${t("homeVisits.floor")} ${v.address.floor}`, v.address.flat && `${t("homeVisits.flat")} ${v.address.flat}`, v.address.landmark, v.address.district].filter(Boolean).join(", ");
        return (
          <Card key={v.id} data-testid="home-visit-card" data-next={isNext ? "true" : undefined} className={isNext ? "border-primary/40 ring-1 ring-primary/20" : v.state === "FINISHED" ? "opacity-80" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-start justify-between gap-3 text-base">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="whitespace-nowrap text-lg font-semibold tabular-nums ltr-nums">{timeFmt.format(new Date(v.plannedStartsAt))}</span>
                  <span className="truncate">{v.patient.name ?? v.district}</span>
                </span>
                <StatusChip tone={tone(v.state)} className="shrink-0">{t(`homeVisits.state.${v.state}`)}</StatusChip>
              </CardTitle>
              {isNext ? <p className="text-xs font-medium text-primary">{t("kx2.nextUp", "Next up")}</p> : null}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {v.address.masked ? (
                <p className="text-muted-foreground">{t("homeVisits.addressMasked", { district: v.address.district })}</p>
              ) : (
                <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{addr}</p>
              )}
              {(v.patient.phone || v.navigationUrl) ? (
                <div className="grid grid-cols-2 gap-2">
                  {v.navigationUrl ? <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 font-medium text-primary shadow-[var(--kx-shadow-1)]" href={v.navigationUrl} target="_blank" rel="noreferrer"><Navigation className="size-4" aria-hidden />{t("homeVisits.navigate")}</a> : null}
                  {v.patient.phone ? <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 font-medium text-primary shadow-[var(--kx-shadow-1)] ltr-nums" href={`tel:${v.patient.phone}`}><Phone className="size-4" aria-hidden />{v.patient.phone}</a> : null}
                </div>
              ) : null}
              {v.fee || v.travelMinutesFromPrevious != null ? (
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {v.fee ? <span>{t("homeVisits.fee", { base: v.fee.baseFee, surcharge: v.fee.surcharge })}</span> : null}
                  {v.travelMinutesFromPrevious != null ? <span>{t("homeVisits.travel", { minutes: v.travelMinutesFromPrevious })}</span> : null}
                </p>
              ) : null}
              {primary(v)}
              <div className="flex flex-wrap gap-2">
                {v.appointmentId && (v.state === "ARRIVED" || v.state === "FINISHED") ? (
                  <Button asChild size="sm" variant="outline" data-testid="open-visit-record"><Link to={`/nurse/visits/${v.appointmentId}`}><ClipboardList className="size-4" aria-hidden />{t("nurse.visit.open")}</Link></Button>
                ) : null}
                {active ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setUnsafeFor(unsafeFor === v.id ? null : v.id)}>{t("homeVisits.leaveUnsafe")}</Button>
                    <Button size="sm" variant="destructive" data-testid="sos-button" disabled={act.isPending} onClick={() => act.mutate({ id: v.id, action: "sos" })}><ShieldAlert className="size-4" aria-hidden />{t("homeVisits.sos")}</Button>
                  </>
                ) : null}
              </div>
              {unsafeFor === v.id ? (
                <div className="space-y-2 rounded-lg border p-3">
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
