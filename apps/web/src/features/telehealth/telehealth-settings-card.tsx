import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Video } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPut } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";
import { getDoctorSettings, putDoctorSettings } from "./telehealth-api";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type Windows = Record<string, { start: string; end: string }[]>;
type TypeRow = { id: string; nameEn: string; nameAr: string; durationMinutes: number; feeAmount: string | number; serviceLocation?: string; isActive: boolean };

/** Doctor settings (ADR-039): "Offers telehealth", optional telehealth-only windows; managers also set per-service telehealth duration and price. */
export function TelehealthSettingsCard({ clinicianId, canManageServices, servicesOnly }: { clinicianId: string; canManageServices?: boolean; servicesOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const meId = useAuthStore((s) => s.user?.id);
  const q = useQuery({ queryKey: ["telehealth-settings", clinicianId], queryFn: () => getDoctorSettings(clinicianId) });
  const [offers, setOffers] = useState(false);
  const [windows, setWindows] = useState<Windows>({});
  useEffect(() => {
    if (q.data) { setOffers(q.data.offersTelehealth); setWindows((q.data.windows as Windows | null) ?? {}); }
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => putDoctorSettings(clinicianId, { offersTelehealth: offers, windows }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telehealth-settings", clinicianId] }),
  });
  const types = useQuery({ queryKey: ["telehealth-types"], enabled: Boolean(canManageServices), queryFn: () => apiGet<TypeRow[]>("/api/v1/scheduling/appointment-types") });
  const saveType = useMutation({
    mutationFn: (v: { id: string; enabled: boolean; durationMinutes?: number; feeAmount?: number }) => apiPut(`/api/v1/telehealth/appointment-types/${v.id}`, v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telehealth-types"] }),
  });
  if (clinicianId !== meId && !canManageServices) return null;
  if (q.isError) return null;
  const setWin = (d: string, k: "start" | "end", v: string) => setWindows((w) => ({ ...w, [d]: [{ start: w[d]?.[0]?.start ?? "09:00", end: w[d]?.[0]?.end ?? "12:00", [k]: v }] }));
  const dayLabel = (d: string) => new Intl.DateTimeFormat(i18n.language, { weekday: "long" }).format(new Date(2026, 0, 4 + DAYS.indexOf(d as (typeof DAYS)[number])));
  return (
    <Card data-testid="th-settings">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Video className="h-4 w-4" />{t("telehealth.settings.title", "Telehealth")}</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        {q.data && !q.data.enabled ? <p role="status" className="text-sm text-muted-foreground">{t("telehealth.settings.disabled", "Telehealth is switched off for your organization.")}</p> : null}
        {servicesOnly ? null : <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={offers} onChange={(e) => setOffers(e.target.checked)} data-testid="th-offers" />
          {t("telehealth.settings.offers", "Offers telehealth")}
        </label>}
        {offers && !servicesOnly ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm text-muted-foreground">{t("telehealth.settings.windows", "Telehealth-only hours (optional). Leave empty to use your normal availability.")}</legend>
            {DAYS.map((d) => (
              <div key={d} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2 text-sm">
                <span>{dayLabel(d)}</span>
                <Input type="time" aria-label={`${d} start`} value={windows[d]?.[0]?.start ?? ""} onChange={(e) => e.target.value ? setWin(d, "start", e.target.value) : setWindows((w) => { const n = { ...w }; delete n[d]; return n; })} />
                <Input type="time" aria-label={`${d} end`} value={windows[d]?.[0]?.end ?? ""} onChange={(e) => setWin(d, "end", e.target.value)} />
              </div>
            ))}
          </fieldset>
        ) : null}
        {servicesOnly ? null : <div><Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save", "Save")}</Button>
          {save.isSuccess ? <span className="ms-3 text-sm text-muted-foreground" role="status">{t("common.saved", "Saved")}</span> : null}</div>}
        {canManageServices ? (
          <div className="grid gap-2 border-t pt-3">
            <p className="text-sm font-medium">{t("telehealth.settings.services", "Telehealth services (own duration and price)")}</p>
            {(types.data ?? []).filter((x) => x.isActive && x.serviceLocation !== "HOME").map((s) => (
              <TypeRowEditor key={s.id} row={s} lang={i18n.language} onSave={(v) => saveType.mutate({ id: s.id, ...v })} />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TypeRowEditor({ row, lang, onSave }: { row: TypeRow; lang: string; onSave: (v: { enabled: boolean; durationMinutes: number; feeAmount: number }) => void }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(row.serviceLocation === "VIDEO");
  const [duration, setDuration] = useState(String(row.durationMinutes));
  const [fee, setFee] = useState(String(Number(row.feeAmount)));
  return (
    <div className="grid grid-cols-[1fr_5rem_6rem_auto] items-center gap-2 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{lang.startsWith("ar") ? row.nameAr || row.nameEn : row.nameEn}</label>
      <Input type="number" min={5} value={duration} onChange={(e) => setDuration(e.target.value)} aria-label={t("telehealth.settings.duration", "Minutes")} />
      <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} aria-label={t("telehealth.settings.price", "Price")} />
      <Button type="button" size="sm" variant="outline" onClick={() => onSave({ enabled, durationMinutes: Number(duration), feeAmount: Number(fee) })}>{t("common.save", "Save")}</Button>
    </div>
  );
}
