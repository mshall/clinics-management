import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AppointmentStatusBadge, appointmentStatusClassName } from "@/components/appointment-status-badge";
import { AppointmentDeleteConfirmDialog } from "@/features/appointments/appointment-delete-confirm-dialog";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppointmentQuery, useClinicsQuery, usePatientQuery, usePatientsQuery, useUsersQuery } from "@/lib/api-hooks";
import type { AppointmentDto } from "@/lib/api-types";
import { ApiError, apiDelete, apiPatch } from "@/lib/http";
import { canDeleteAppointment } from "@/lib/appointment-delete-policy";
import { patientToPickListItem } from "@/lib/patient-display";
import { formatClinicName } from "@/lib/locale-display";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isReadOnlyStatus(status: string): boolean {
  return status === "COMPLETED";
}

const STATUS_CODES = ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "CANCELLED", "COMPLETED"] as const;
type AppointmentStatusCode = (typeof STATUS_CODES)[number];

function isAppointmentStatusCode(s: string): s is AppointmentStatusCode {
  return (STATUS_CODES as readonly string[]).includes(s);
}

export function AppointmentDetailPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const canDelete = canDeleteAppointment(authUser?.role);
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
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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

  const statusLabel = (code: string) => {
    if (!isAppointmentStatusCode(code)) return code;
    const map: Record<AppointmentStatusCode, string> = {
      SCHEDULED: t("appointments.statusScheduled", "Scheduled"),
      CONFIRMED: t("appointments.statusConfirmed", "Confirmed"),
      CHECKED_IN: t("appointments.statusCheckedIn", "Checked in"),
      CANCELLED: t("appointments.statusCancelled", "Cancelled"),
      COMPLETED: t("appointments.statusCompleted", "Completed"),
    };
    return map[code];
  };

  const toastStatusDraft = (code: string) => {
    toast.success(
      t("appointments.statusDraftToast", "Status: {{status}}. Click Save to apply.", { status: statusLabel(code) })
    );
  };

  const selectedPatientMissing = Boolean(patientId && !patients.some((p) => p.id === patientId));
  const { data: extraPatient } = usePatientQuery(selectedPatientMissing ? patientId : undefined);

  const clinicItems: PickListItem[] = useMemo(
    () =>
      clinics.map((c) => ({
        value: c.id,
        label: formatClinicName(c, i18n.language),
        hint: [c.city, c.country].filter(Boolean).join(" · ") || undefined,
      })),
    [clinics, i18n.language],
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
    return merged.map((p) => patientToPickListItem(p));
  }, [apt, readOnly, patients, extraPatient, t]);

  const saveMut = useMutation({
    mutationFn: (body: Partial<AppointmentDto> & Record<string, unknown>) =>
      apiPatch<AppointmentDto>(`/api/v1/appointments/${id}`, body),
    onSuccess: (_data, variables) => {
      setFormErr(null);
      void qc.invalidateQueries({ queryKey: ["appointment", id] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      const st = typeof variables.status === "string" ? variables.status : undefined;
      if (st) {
        toast.success(
          t("appointments.savedWithStatus", "Appointment saved. Status is now {{status}}.", { status: statusLabel(st) })
        );
      } else {
        toast.success(t("appointments.saveSuccess", "Appointment saved."));
      }
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body
          ? String((e.body as { message?: unknown }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      setFormErr(msg);
      toast.error(msg);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => apiDelete(`/api/v1/appointments/${id}`),
    onSuccess: () => {
      setDeleteDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      toast.success(t("appointments.deleteSuccess", "Appointment deleted."));
      navigate("/appointments");
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body
          ? String((e.body as { message?: unknown }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      toast.error(msg);
    },
  });

  const onSave = () => {
    if (!id || readOnly) return;
    const start = new Date(startsLocal);
    const end = new Date(endsLocal);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      const msg = t("appointments.invalidDateRange", "Enter valid start and end times.");
      setFormErr(msg);
      toast.error(msg);
      return;
    }
    if (end <= start) {
      const msg = t("appointments.endAfterStart", "End time must be after start time.");
      setFormErr(msg);
      toast.error(msg);
      return;
    }
    saveMut.mutate({
      clinicId,
      patientId,
      clinicianId,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
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
      <AppointmentDeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        appointment={
          apt
            ? {
                id: apt.id,
                patientName: apt.patientName,
                patientMrn: apt.patientMrn,
                startsAt: apt.startsAt,
                endsAt: apt.endsAt,
                clinicianName: apt.clinicianName,
                status: apt.status,
                clinicId: apt.clinicId,
                clinicNameEn: apt.clinicNameEn,
                clinicNameAr: apt.clinicNameAr,
              }
            : null
        }
        pending={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
      />

      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("appointments.confirmCompleteTitle", "Mark appointment completed?")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t(
              "appointments.confirmCompleteBody",
              "Completed appointments lock editing. Nothing is saved until you click Save."
            )}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCompleteDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setStatus("COMPLETED");
                setCompleteDialogOpen(false);
                toastStatusDraft("COMPLETED");
              }}
            >
              {t("appointments.confirmCompleteAction", "Continue")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" className="mb-2 h-auto px-0 text-muted-foreground" asChild>
            <Link to="/appointments">← {t("appointments.backToList", "Back to appointments")}</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{t("appointments.detailTitle", "Appointment")}</h1>
          <p className="text-muted-foreground text-sm">
            {apt.patientName ? (
              <span>
                {t("appointments.patient", "Patient")}: <span className="font-medium text-foreground">{apt.patientName}</span>
              </span>
            ) : null}
            {apt.patientName && apt.clinicianName ? <span className="text-muted-foreground"> · </span> : null}
            {apt.clinicianName ? (
              <span>
                {t("appointments.clinician", "Clinician")}: <span className="font-medium text-foreground">{apt.clinicianName}</span>
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground ltr-nums">{t("appointments.referenceId", "Reference")}: {apt.id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDelete ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={deleteMut.isPending}
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="me-2 h-4 w-4" />
              {t("appointments.delete", "Delete")}
            </Button>
          ) : null}
          <AppointmentStatusBadge status={apt.status} />
        </div>
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
            <Label required>{t("appointments.clinic")}</Label>
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
            <Label required>{t("appointments.patient")}</Label>
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
            <Label required>{t("appointments.clinician")}</Label>
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
            <Label required>{t("appointments.starts")}</Label>
            <Input
              className="ltr-nums"
              type="datetime-local"
              value={startsLocal}
              disabled={readOnly}
              onChange={(e) => setStartsLocal(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label required>{t("appointments.ends")}</Label>
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
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <AppointmentStatusBadge status={apt.status} />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {t(
                    "appointments.statusQuickHint",
                    "Choose a status below, then click Save to apply. Marking completed asks for confirmation first."
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["SCHEDULED", t("appointments.statusScheduled", "Scheduled")] as const,
                      ["CONFIRMED", t("appointments.statusConfirmed", "Confirmed")] as const,
                      ["CHECKED_IN", t("appointments.statusCheckedIn", "Checked in")] as const,
                      ["CANCELLED", t("appointments.statusCancelled", "Cancelled")] as const,
                      ["COMPLETED", t("appointments.markCompleted", "Mark completed")] as const,
                    ] as const
                  ).map(([code, label]) => {
                    const active = status === code;
                    return (
                      <Button
                        key={code}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saveMut.isPending}
                        className={cn(
                          active
                            ? cn(appointmentStatusClassName(code), "text-white shadow-sm hover:opacity-95")
                            : "border-border bg-background hover:bg-muted/60"
                        )}
                        onClick={() => {
                          if (code === "COMPLETED") {
                            if (status !== "COMPLETED") setCompleteDialogOpen(true);
                            return;
                          }
                          if (code === status) return;
                          setStatus(code);
                          toastStatusDraft(code);
                        }}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {t("appointments.statusWithSave", "Or choose from the list (same as shortcuts)")}
                  </p>
                  <select
                    id={`appointment-status-select-${id}`}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={status}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "COMPLETED") {
                        setCompleteDialogOpen(true);
                        return;
                      }
                      setStatus(v);
                      toastStatusDraft(v);
                    }}
                  >
                    <option value="SCHEDULED">{t("appointments.statusScheduled", "Scheduled")}</option>
                    <option value="CONFIRMED">{t("appointments.statusConfirmed", "Confirmed")}</option>
                    <option value="CHECKED_IN">{t("appointments.statusCheckedIn", "Checked in")}</option>
                    <option value="CANCELLED">{t("appointments.statusCancelled", "Cancelled")}</option>
                    <option value="COMPLETED">{t("appointments.statusCompleted", "Completed")}</option>
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
