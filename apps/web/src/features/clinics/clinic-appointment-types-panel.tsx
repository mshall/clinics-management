import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPatch, apiPost } from "@/lib/http";

type AppointmentTypeRow = {
  id: string;
  nameEn: string;
  nameAr: string;
  durationMinutes: number;
  feeAmount: string | number;
  colorHex: string;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  requiresRoom: boolean;
  marketplaceBookable: boolean;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  depositAmount: string | number | null;
  newPatientOnly: boolean;
};

type Props = {
  clinicId: string;
  canEdit: boolean;
};

const emptyDraft = {
  nameEn: "",
  nameAr: "",
  durationMinutes: "15",
  feeAmount: "0",
  colorHex: "#3b82f6",
  bufferBeforeMin: "0",
  bufferAfterMin: "0",
  requiresRoom: false,
  marketplaceBookable: false,
  minNoticeMinutes: "120",
  maxDaysAhead: "30",
  depositAmount: "",
  newPatientOnly: false,
};

export function ClinicAppointmentTypesPanel({ clinicId, canEdit }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);

  const typesQuery = useQuery({
    queryKey: ["scheduling", "appointment-types", clinicId],
    queryFn: () => apiGet<AppointmentTypeRow[]>(`/api/v1/scheduling/appointment-types?clinicId=${encodeURIComponent(clinicId)}`),
  });

  const saveMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editingId
        ? apiPatch(`/api/v1/scheduling/appointment-types/${encodeURIComponent(editingId)}`, payload)
        : apiPost("/api/v1/scheduling/appointment-types", { ...payload, clinicId }),
    onSuccess: () => {
      toast.success(t("scheduling.typeSaved", "Appointment type saved"));
      setEditingId(null);
      setDraft(emptyDraft);
      void qc.invalidateQueries({ queryKey: ["scheduling", "appointment-types", clinicId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (row: AppointmentTypeRow) => {
    setEditingId(row.id);
    setDraft({
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      durationMinutes: String(row.durationMinutes),
      feeAmount: String(row.feeAmount),
      colorHex: row.colorHex,
      bufferBeforeMin: String(row.bufferBeforeMin ?? 0),
      bufferAfterMin: String(row.bufferAfterMin ?? 0),
      requiresRoom: row.requiresRoom,
      marketplaceBookable: row.marketplaceBookable,
      minNoticeMinutes: String(row.minNoticeMinutes ?? 120),
      maxDaysAhead: String(row.maxDaysAhead ?? 30),
      depositAmount: row.depositAmount != null ? String(row.depositAmount) : "",
      newPatientOnly: row.newPatientOnly,
    });
  };

  const submit = () => {
    saveMut.mutate({
      ...draft,
      durationMinutes: Number(draft.durationMinutes),
      feeAmount: Number(draft.feeAmount),
      bufferBeforeMin: Number(draft.bufferBeforeMin),
      bufferAfterMin: Number(draft.bufferAfterMin),
      minNoticeMinutes: Number(draft.minNoticeMinutes),
      maxDaysAhead: Number(draft.maxDaysAhead),
      depositAmount: draft.depositAmount.trim() ? Number(draft.depositAmount) : null,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("scheduling.appointmentTypesTitle", "Appointment types")}</CardTitle>
        <CardDescription>
          {t("scheduling.appointmentTypesHint", "Duration, buffers, marketplace rules, and room requirements for this branch.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          {(typesQuery.data ?? []).map((row) => (
            <li key={row.id} className="rounded border border-border px-3 py-2">
              <TypeSummary row={row} />
              {canEdit ? (
                <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => startEdit(row)}>
                  {t("common.edit")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canEdit ? (
          <div className="grid gap-2 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2">
            <Field label={t("scheduling.typeNameEn", "Name (EN)")} value={draft.nameEn} onChange={(v) => setDraft({ ...draft, nameEn: v })} />
            <Field label={t("scheduling.typeNameAr", "Name (AR)")} value={draft.nameAr} onChange={(v) => setDraft({ ...draft, nameAr: v })} />
            <Field label={t("scheduling.durationMin", "Duration (min)")} value={draft.durationMinutes} onChange={(v) => setDraft({ ...draft, durationMinutes: v })} />
            <Field label={t("scheduling.feeAmount", "Fee")} value={draft.feeAmount} onChange={(v) => setDraft({ ...draft, feeAmount: v })} />
            <Field label={t("scheduling.bufferBefore", "Buffer before (min)")} value={draft.bufferBeforeMin} onChange={(v) => setDraft({ ...draft, bufferBeforeMin: v })} />
            <Field label={t("scheduling.bufferAfter", "Buffer after (min)")} value={draft.bufferAfterMin} onChange={(v) => setDraft({ ...draft, bufferAfterMin: v })} />
            <Field label={t("scheduling.minNotice", "Min notice (min)")} value={draft.minNoticeMinutes} onChange={(v) => setDraft({ ...draft, minNoticeMinutes: v })} />
            <Field label={t("scheduling.maxDaysAhead", "Max days ahead")} value={draft.maxDaysAhead} onChange={(v) => setDraft({ ...draft, maxDaysAhead: v })} />
            <Field label={t("scheduling.depositAmount", "Deposit")} value={draft.depositAmount} onChange={(v) => setDraft({ ...draft, depositAmount: v })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.requiresRoom} onChange={(e) => setDraft({ ...draft, requiresRoom: e.target.checked })} />
              {t("scheduling.requiresRoom", "Requires room")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.marketplaceBookable} onChange={(e) => setDraft({ ...draft, marketplaceBookable: e.target.checked })} />
              {t("scheduling.marketplaceBookable", "Marketplace bookable")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.newPatientOnly} onChange={(e) => setDraft({ ...draft, newPatientOnly: e.target.checked })} />
              {t("scheduling.newPatientOnly", "New patients only")}
            </label>
            <div className="sm:col-span-2 flex gap-2">
              <Button type="button" disabled={!draft.nameEn.trim() || saveMut.isPending} onClick={submit}>
                {editingId ? t("common.save") : t("scheduling.addType", "Add type")}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={() => { setEditingId(null); setDraft(emptyDraft); }}>
                  {t("common.cancel")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TypeSummary({ row }: { row: AppointmentTypeRow }) {
  const { t } = useTranslation();
  return (
    <>
      <span className="font-medium">{row.nameEn}</span>
      <span className="text-muted-foreground">
        {" "}
        · {row.durationMinutes} {t("scheduling.minShort", "min")} · {String(row.feeAmount)}
        {row.bufferBeforeMin || row.bufferAfterMin
          ? ` · ±${row.bufferBeforeMin}/${row.bufferAfterMin} ${t("scheduling.bufferShort", "buffer")}`
          : ""}
        {row.requiresRoom ? ` · ${t("scheduling.requiresRoom", "Requires room")}` : ""}
      </span>
    </>
  );
}