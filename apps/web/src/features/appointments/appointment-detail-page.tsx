import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
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
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: apt, isPending, isError, error } = useAppointmentQuery(id);
  const { data: clinics = [] } = useClinicsQuery();
  const { data: patData } = usePatientsQuery({ page: 1, pageSize: 200 });
  const { data: userData } = useUsersQuery({ page: 1, pageSize: 100 });
  const patients = patData?.items ?? [];
  const patientMissingFromList = Boolean(apt && !patients.some((p) => p.id === apt.patientId));
  const { data: extraPatient } = usePatientQuery(patientMissingFromList && apt ? apt.patientId : undefined);
  const patientOptions = useMemo(() => {
    if (extraPatient && !patients.some((p) => p.id === extraPatient.id)) {
      return [extraPatient, ...patients];
    }
    return patients;
  }, [patients, extraPatient]);
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

  const readOnly = apt ? isReadOnlyStatus(apt.status) : false;

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
          {t("appointments.readOnlyHint", "This appointment is completed or cancelled and cannot be edited.")}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("appointments.editSection", "Details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("appointments.clinic")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              value={clinicId}
              disabled={readOnly}
              onChange={(e) => setClinicId(e.target.value)}
            >
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameEn}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("appointments.patient")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              value={patientId}
              disabled={readOnly}
              onChange={(e) => setPatientId(e.target.value)}
            >
              {patientOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.mrn} — {p.firstNameEn} {p.lastNameEn}
                </option>
              ))}
            </select>
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
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              value={status}
              disabled={readOnly}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="SCHEDULED">{t("appointments.statusScheduled", "Scheduled")}</option>
              <option value="CONFIRMED">{t("appointments.statusConfirmed", "Confirmed")}</option>
              <option value="CANCELLED">{t("appointments.statusCancelled", "Cancelled")}</option>
              <option value="COMPLETED">{t("appointments.statusCompleted", "Completed")}</option>
            </select>
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
