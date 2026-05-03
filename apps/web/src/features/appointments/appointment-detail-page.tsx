import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppointmentQuery, useClinicsQuery, usePatientQuery, usePatientsQuery, useUsersQuery } from "@/lib/api-hooks";
import type { AppointmentDto } from "@/lib/api-types";
import { ApiError, apiPatch } from "@/lib/http";

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isReadOnlyStatus(status: string): boolean {
  return status === "COMPLETED";
}

export function AppointmentDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: apt, isPending, isError, error } = useAppointmentQuery(id);
  const { data: clinics = [] } = useClinicsQuery();
  const { data: userData } = useUsersQuery({ page: 1, pageSize: 100 });

  const readOnly = apt ? isReadOnlyStatus(apt.status) : false;

  const [patientPickerSearch, setPatientPickerSearch] = useState("");
  const [debouncedPatientSearch, setDebouncedPatientSearch] = useState("");
  useEffect(() => {
    const tid = window.setTimeout(() => setDebouncedPatientSearch(patientPickerSearch), 280);
    return () => window.clearTimeout(tid);
  }, [patientPickerSearch]);

  const { data: patData } = usePatientsQuery({
    search: debouncedPatientSearch.trim() || undefined,
    page: 1,
    pageSize: 150,
    enabled: Boolean(apt && !readOnly),
  });
  const patients = patData?.items ?? [];

  const physicians = (userData?.items ?? []).filter((u) => u.role === "PHYSICIAN");

  const [clinicId, setClinicId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [startsLocal, setStartsLocal] = useState("");
  const [endsLocal, setEndsLocal] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => {
    if (!apt) return;
    setClinicId(apt.clinicId);
    setPatientId(apt.patientId);
    setClinicianId(apt.clinicianId);
    setStartsLocal(toDatetimeLocalValue(apt.startsAt));
    setEndsLocal(toDatetimeLocalValue(apt.endsAt));
    setNotes(apt.notes ?? "");
    setStatus(apt.status);
  }, [apt]);

  const selectedPatientMissing = Boolean(patientId && !patients.some((p) => p.id === patientId));
  const { data: extraPatient } = usePatientQuery(selectedPatientMissing ? patientId : undefined);

  const clinicItems: PickListItem[] = useMemo(
    () =>
      clinics.map((c) => ({
        value: c.id,
        label: c.nameEn,
        hint: [c.city, c.country].filter(Boolean).join(" · ") || undefined,
      })),
    [clinics]
  );

  const patientItems: PickListItem[] = useMemo(() => {
    if (!apt) return [];
    if (readOnly) {
      return [
        {
          value: apt.patientId,
          label: (apt.patientName?.trim() || t("appointments.patient", "Patient")).trim(),
          hint: apt.patientMrn ?? undefined,
        },
      ];
    }
    const merged = [...patients];
    if (extraPatient && !merged.some((p) => p.id === extraPatient.id)) {
      merged.unshift(extraPatient);
    }
    return merged.map((p) => ({
      value: p.id,
      label: `${p.firstNameEn} ${p.lastNameEn}`.trim(),
      hint: p.mrn,
    }));
  }, [apt, readOnly, patients, extraPatient, t]);

  const saveMut = useMutation({
    mutationFn: (body: Partial<AppointmentDto> & Record<string, unknown>) =>
      apiPatch<AppointmentDto>(`/api/v1/appointments/${id}`, body),
    onSuccess: () => {
      setFormErr(null);
      void qc.invalidateQueries({ queryKey: ["appointment", id] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setFormErr(String((e.body as { message?: unknown }).message));
      } else setFormErr(e instanceof Error ? e.message : String(e));
    },
  });

  const statusOnlyMut = useMutation({
    mutationFn: (next: string) => apiPatch<AppointmentDto>(`/api/v1/appointments/${id}/status`, { status: next }),
    onSuccess: () => {
      setFormErr(null);
      void qc.invalidateQueries({ queryKey: ["appointment", id] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setFormErr(String((e.body as { message?: unknown }).message));
      } else setFormErr(e instanceof Error ? e.message : String(e));
    },
  });

  const onSave = () => {
    if (!id || readOnly) return;
    saveMut.mutate({
      clinicId,
      patientId,
      clinicianId,
      startsAt: new Date(startsLocal).toISOString(),
      endsAt: new Date(endsLocal).toISOString(),
      notes: notes.trim() === "" ? "" : notes,
      status,
    });
  };

  if (isPending) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (isError || !apt) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error instanceof Error ? error.message : t("common.error")}</p>
        <Button variant="outline" asChild>
          <Link to="/appointments">{t("appointments.backToList", "Back to appointments")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" className="mb-2 h-auto px-0 text-muted-foreground" asChild>
            <Link to="/appointments">← {t("appointments.backToList", "Back to appointments")}</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{t("appointments.detailTitle", "Appointment")}</h1>
          <p className="text-muted-foreground ltr-nums text-sm">{apt.id}</p>
        </div>
        <Badge variant="secondary">{apt.status}</Badge>
      </div>

      {formErr ? <p className="text-sm text-destructive">{formErr}</p> : null}

      {readOnly ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("appointments.readOnlyHint", "This appointment is completed and cannot be edited.")}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("appointments.editSection", "Details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("appointments.clinic")}</Label>
            <SearchablePickList
              items={clinicItems}
              value={clinicId}
              onValueChange={setClinicId}
              disabled={readOnly}
              searchPlaceholder={t("appointments.filterClinic", "Type clinic name…")}
              placeholder={t("appointments.pick")}
              emptyMessage={t("appointments.noClinicMatch", "No clinics match.")}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("appointments.patient")}</Label>
            {!readOnly ? (
              <p className="text-xs text-muted-foreground">
                {t("encounters.selectPatientHint", "Search by name or MRN, then choose a row.")}
              </p>
            ) : null}
            <SearchablePickList
              items={patientItems}
              value={patientId}
              onValueChange={setPatientId}
              onSearchQueryChange={(q) => setPatientPickerSearch(q)}
              disabled={readOnly}
              searchPlaceholder={t("encounters.patientSearchPlaceholder", "Type name or MRN to filter…")}
              placeholder={t("appointments.pick")}
              emptyMessage={t("encounters.noPatientsMatch", "No patients match.")}
              localFilter={false}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("appointments.clinician")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              value={clinicianId}
              disabled={readOnly}
              onChange={(e) => setClinicianId(e.target.value)}
            >
              {physicians.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("appointments.starts")}</Label>
            <Input
              className="ltr-nums"
              type="datetime-local"
              value={startsLocal}
              disabled={readOnly}
              onChange={(e) => setStartsLocal(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("appointments.ends")}</Label>
            <Input
              className="ltr-nums"
              type="datetime-local"
              value={endsLocal}
              disabled={readOnly}
              onChange={(e) => setEndsLocal(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("appointments.status")}</Label>
            {readOnly ? (
              <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium">
                {apt.status === "COMPLETED"
                  ? t("appointments.statusCompleted", "Completed")
                  : apt.status === "CONFIRMED"
                    ? t("appointments.statusConfirmed", "Confirmed")
                    : apt.status === "CANCELLED"
                      ? t("appointments.statusCancelled", "Cancelled")
                      : t("appointments.statusScheduled", "Scheduled")}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {t(
                    "appointments.statusQuickHint",
                    "Set status with one tap, or choose below and use Save with other edits."
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={apt.status === "SCHEDULED" ? "default" : "outline"}
                    disabled={statusOnlyMut.isPending || apt.status === "SCHEDULED"}
                    onClick={() => statusOnlyMut.mutate("SCHEDULED")}
                  >
                    {t("appointments.statusScheduled", "Scheduled")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={apt.status === "CONFIRMED" ? "default" : "outline"}
                    disabled={statusOnlyMut.isPending || apt.status === "CONFIRMED"}
                    onClick={() => statusOnlyMut.mutate("CONFIRMED")}
                  >
                    {t("appointments.statusConfirmed", "Confirmed")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={apt.status === "CANCELLED" ? "default" : "outline"}
                    disabled={statusOnlyMut.isPending || apt.status === "CANCELLED"}
                    onClick={() => statusOnlyMut.mutate("CANCELLED")}
                  >
                    {t("appointments.statusCancelled", "Cancelled")}
                  </Button>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {t("appointments.statusWithSave", "Or pick status for the next save")}
                  </p>
                  <select
                    id={`appointment-status-select-${id}`}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="SCHEDULED">{t("appointments.statusScheduled", "Scheduled")}</option>
                    <option value="CONFIRMED">{t("appointments.statusConfirmed", "Confirmed")}</option>
                    <option value="CANCELLED">{t("appointments.statusCancelled", "Cancelled")}</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("appointments.notes", "Notes")}</Label>
            <textarea
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              value={notes}
              disabled={readOnly}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {!readOnly ? (
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="button" disabled={saveMut.isPending} onClick={onSave}>
                {t("common.save", "Save")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={statusOnlyMut.isPending || apt.status === "COMPLETED"}
                onClick={() => statusOnlyMut.mutate("COMPLETED")}
              >
                {t("appointments.markCompleted", "Mark completed")}
              </Button>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <Button type="button" variant="outline" asChild>
                <Link to={`/patients/${apt.patientId}`}>{t("appointments.openPatient", "Open patient")}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
