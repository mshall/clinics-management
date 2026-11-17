import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useClinicPhysiciansQuery } from "@/lib/api-hooks";
import { apiGet, apiPut } from "@/lib/http";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { physicianToPickListItem } from "@/lib/physician-display";

type AppointmentTypeRow = {
  id: string;
  nameEn: string;
  nameAr: string;
  durationMinutes: number;
  feeAmount: string | number;
};

type OverrideRow = {
  appointmentTypeId: string;
  durationMinutes: number | null;
  feeAmount: string | number | null;
};

type Props = {
  clinicId: string;
  canEdit: boolean;
};

export function ClinicianTypeOverridesPanel({ clinicId, canEdit }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: physicians = [] } = useClinicPhysiciansQuery(clinicId);
  const [clinicianId, setClinicianId] = useState("");

  useEffect(() => {
    if (!clinicianId && physicians[0]?.userId) setClinicianId(physicians[0].userId);
  }, [clinicianId, physicians]);

  const typesQuery = useQuery({
    queryKey: ["scheduling", "appointment-types", clinicId],
    queryFn: () => apiGet<AppointmentTypeRow[]>(`/api/v1/scheduling/appointment-types?clinicId=${encodeURIComponent(clinicId)}`),
  });

  const overridesQuery = useQuery({
    queryKey: ["scheduling", "type-overrides", clinicianId],
    enabled: Boolean(clinicianId),
    queryFn: () =>
      apiGet<OverrideRow[]>(`/api/v1/scheduling/clinicians/${encodeURIComponent(clinicianId)}/type-overrides`),
  });

  const [draft, setDraft] = useState<Record<string, { duration: string; fee: string }>>({});

  useEffect(() => {
    const types = typesQuery.data ?? [];
    const overrides = overridesQuery.data ?? [];
    const byType = new Map(overrides.map((o) => [o.appointmentTypeId, o]));
    const next: Record<string, { duration: string; fee: string }> = {};
    for (const type of types) {
      const o = byType.get(type.id);
      next[type.id] = {
        duration: o?.durationMinutes != null ? String(o.durationMinutes) : "",
        fee: o?.feeAmount != null ? String(o.feeAmount) : "",
      };
    }
    setDraft(next);
  }, [typesQuery.data, overridesQuery.data, clinicianId]);

  const saveMut = useMutation({
    mutationFn: () => {
      const types = typesQuery.data ?? [];
      const overrides = types.map((type) => {
        const row = draft[type.id] ?? { duration: "", fee: "" };
        const duration = row.duration.trim() ? Number(row.duration) : null;
        const fee = row.fee.trim() ? Number(row.fee) : null;
        return { appointmentTypeId: type.id, durationMinutes: duration, feeAmount: fee };
      });
      return apiPut(`/api/v1/scheduling/clinicians/${encodeURIComponent(clinicianId)}/type-overrides`, { overrides });
    },
    onSuccess: () => {
      toast.success(t("scheduling.overridesSaved", "Type overrides saved"));
      void qc.invalidateQueries({ queryKey: ["scheduling", "type-overrides", clinicianId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const physicianOptions = useMemo(
    () => physicians.map((p) => physicianToPickListItem(p, i18n.language)),
    [physicians, i18n.language],
  );

  if (!physicians.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("scheduling.typeOverridesTitle", "Per-doctor type overrides")}</CardTitle>
        <CardDescription>
          {t(
            "scheduling.typeOverridesHint",
            "Optional duration and fee per doctor. Leave blank to use the clinic type defaults.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-sm font-medium" htmlFor="clinician-type-override-select">
            {t("appointments.clinician", "Doctor")}
          </label>
          <select
            id="clinician-type-override-select"
            className={nativeSelectClassName}
            value={clinicianId}
            onChange={(e) => setClinicianId(e.target.value)}
          >
            {physicianOptions.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {(typesQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("scheduling.noTypesForOverrides", "Add appointment types first.")}</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {(typesQuery.data ?? []).map((type) => {
              const label = i18n.language.startsWith("ar") ? type.nameAr || type.nameEn : type.nameEn;
              const row = draft[type.id] ?? { duration: "", fee: "" };
              return (
                <li key={type.id} className="rounded border border-border px-3 py-2">
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("scheduling.typeDefault", "Default")}: {type.durationMinutes} {t("scheduling.minShort", "min")} ·{" "}
                    {type.feeAmount}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input
                      type="number"
                      min={1}
                      placeholder={t("scheduling.overrideDuration", "Override duration")}
                      disabled={!canEdit}
                      value={row.duration}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [type.id]: { ...row, duration: e.target.value } }))
                      }
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder={t("scheduling.overrideFee", "Override fee")}
                      disabled={!canEdit}
                      value={row.fee}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [type.id]: { ...row, fee: e.target.value } }))}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {canEdit && (typesQuery.data ?? []).length > 0 ? (
          <Button type="button" disabled={!clinicianId || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {t("common.save", "Save")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}