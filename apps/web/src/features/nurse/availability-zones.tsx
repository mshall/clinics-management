import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPut } from "@/lib/http";
import { ErrorBlock, Field, LoadingBlock } from "./nurse-shared";
import { useClinics, useErrorText } from "./nurse-shared-utils";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

type Week = { version: 1; timezone?: string; days: { weekday: number; slots: { start: string; end: string }[] }[] };
type DayDraft = { on: boolean; start: string; end: string };
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** HVCFG02 — weekly availability for a nurse (one window per day keeps field entry short; the slot engine, travel buffers and daily cap do the rest). */
export function AvailabilityEditor({ clinicianId, title }: { clinicianId: string; title?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errText = useErrorText();
  const clinics = useClinics();
  const clinicId = clinics.data?.[0]?.id;
  const q = useQuery({
    queryKey: ["nurse", "availability", clinicianId, clinicId],
    queryFn: () => apiGet<{ weekJson: Week } | null>(`/api/v1/scheduling/availability?clinicId=${clinicId}&clinicianId=${clinicianId}`),
    enabled: Boolean(clinicId),
  });
  const [days, setDays] = useState<DayDraft[]>(WEEKDAYS.map(() => ({ on: false, start: "09:00", end: "17:00" })));
  useSyncOnChange([q.data], () => {
    if (q.data === undefined) return;
    const week = q.data?.weekJson;
    setDays(WEEKDAYS.map((d) => {
      const slot = week?.days.find((x) => x.weekday === d)?.slots[0];
      return slot ? { on: true, start: slot.start, end: slot.end } : { on: false, start: "09:00", end: "17:00" };
    }));
  });
  const save = useMutation({
    mutationFn: () => apiPut(`/api/v1/scheduling/availability`, { clinicId, clinicianId, weekJson: { version: 1, days: WEEKDAYS.map((d) => ({ weekday: d, slots: days[d]!.on ? [{ start: days[d]!.start, end: days[d]!.end }] : [] })) } }),
    onSuccess: () => { toast.success(t("nurse.availability.saved")); void qc.invalidateQueries({ queryKey: ["nurse", "availability", clinicianId] }); void qc.invalidateQueries({ queryKey: ["nurse", "onboarding"] }); },
    onError: (e) => toast.error(errText(e)),
  });
  const patch = (i: number, p: Partial<DayDraft>) => setDays((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const invalid = days.some((d) => d.on && d.end <= d.start);
  return (
    <Card data-testid="availability-editor">
      <CardHeader className="pb-1"><CardTitle className="text-base">{title ?? t("nurse.availability.title")}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {q.isLoading || clinics.isLoading ? <LoadingBlock /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        {WEEKDAYS.map((d) => (
          <div key={d} className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-11 w-32 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={days[d]!.on} onChange={(e) => patch(d, { on: e.target.checked })} /> {t(`nurse.availability.days.${d}`)}</label>
            <Input aria-label={t("nurse.availability.from")} type="time" className="min-h-11 w-32" disabled={!days[d]!.on} value={days[d]!.start} onChange={(e) => patch(d, { start: e.target.value })} />
            <span aria-hidden>-</span>
            <Input aria-label={t("nurse.availability.to")} type="time" className="min-h-11 w-32" disabled={!days[d]!.on} value={days[d]!.end} onChange={(e) => patch(d, { end: e.target.value })} />
          </div>
        ))}
        {invalid ? <p className="text-sm text-destructive" role="alert">{t("nurse.availability.invalid")}</p> : null}
        <Button className="min-h-11" disabled={!clinicId || invalid || save.isPending} onClick={() => save.mutate()} data-testid="availability-save">{t("nurse.common.save")}</Button>
      </CardContent>
    </Card>
  );
}

type HomeSettings = { acceptsHomeVisits?: boolean; coverageDistrictIds?: string[]; dailyVisitCap?: number | null };

/** HVCFG02/03 — coverage zones (district slugs) and the daily visit cap. */
export function ZonesEditor({ clinicianId, title }: { clinicianId: string; title?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errText = useErrorText();
  const q = useQuery({ queryKey: ["nurse", "home-settings", clinicianId], queryFn: () => apiGet<{ settings: HomeSettings | null } | HomeSettings | null>(`/api/v1/home-visits/settings/${clinicianId}`) });
  const [zones, setZones] = useState("");
  const [cap, setCap] = useState("");
  useSyncOnChange([q.data], () => {
    if (q.data === undefined) return;
    const raw = q.data as { settings?: HomeSettings | null } & HomeSettings | null;
    const s = (raw && "settings" in raw ? raw.settings : raw) as HomeSettings | null;
    setZones((s?.coverageDistrictIds ?? []).join(", "));
    setCap(s?.dailyVisitCap ? String(s.dailyVisitCap) : "");
  });
  const save = useMutation({
    mutationFn: () => apiPut(`/api/v1/home-visits/settings/${clinicianId}`, { acceptsHomeVisits: true, coverageDistrictIds: zones.split(/[,\n]/).map((z) => z.trim()).filter(Boolean), dailyVisitCap: cap ? Number(cap) : null }),
    onSuccess: () => { toast.success(t("nurse.zones.saved")); void qc.invalidateQueries({ queryKey: ["nurse", "home-settings", clinicianId] }); void qc.invalidateQueries({ queryKey: ["nurse", "onboarding"] }); },
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <Card data-testid="zones-editor">
      <CardHeader className="pb-1"><CardTitle className="text-base">{title ?? t("nurse.zones.title")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? <LoadingBlock /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        <Field label={t("nurse.zones.districts")} htmlFor={`zones-${clinicianId}`} hint={t("nurse.zones.hint")}><Input id={`zones-${clinicianId}`} className="min-h-11" value={zones} onChange={(e) => setZones(e.target.value)} /></Field>
        <Field label={t("nurse.zones.cap")} htmlFor={`cap-${clinicianId}`}><Input id={`cap-${clinicianId}`} type="number" min={1} className="min-h-11" value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
        <Button className="min-h-11" disabled={save.isPending || !zones.trim()} onClick={() => save.mutate()} data-testid="zones-save">{t("nurse.common.save")}</Button>
      </CardContent>
    </Card>
  );
}
