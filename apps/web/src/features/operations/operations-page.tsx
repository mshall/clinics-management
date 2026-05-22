import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateActionButton } from "@/components/create-action-button";
import { OperationStatusBadge } from "@/components/operation-status-badge";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useClinicsQuery,
  useOperationsQuery,
  usePatientsQuery,
  useSchedulingPhysiciansQuery,
} from "@/lib/api-hooks";
import type { OperationDto } from "@/lib/api-types";
import { ApiError, apiPatch, apiPost } from "@/lib/http";
import { resolvePatientListLabel } from "@/lib/patient-display";
import { columnFilterIncludes } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { defaultMonthRange } from "@/stores/date-range-store";

const CREATE_ROLES = new Set(["group_admin", "branch_manager", "clinic_admin", "clinic_assistant", "receptionist"]);

function toOperationIso(localDatetime: string): string {
  const d = new Date(localDatetime);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date or time");
  return d.toISOString();
}

export function OperationsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const canCreate = authUser?.role ? CREATE_ROLES.has(authUser.role) : false;
  const isPhysician = authUser?.role === "physician";

  const initialRange = useMemo(() => defaultMonthRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [filterClinicId, setFilterClinicId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("operationDate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const { data: opData, isPending, isError, error } = useOperationsQuery({
    from,
    to,
    page,
    pageSize,
    sortBy,
    sortOrder,
    clinicId: filterClinicId || undefined,
  });

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };

  const rows = opData?.items ?? [];
  const opTotal = opData?.total ?? 0;
  const opTotalPages = opData?.totalPages ?? 1;

  const { data: clinics = [] } = useClinicsQuery();
  const singleManagedClinic = clinics.length === 1 ? clinics[0]! : null;
  const clinicById = useMemo(() => {
    const m = new Map<string, { en: string; ar: string }>();
    for (const c of clinics) m.set(c.id, { en: c.nameEn, ar: c.nameAr });
    return m;
  }, [clinics]);

  const { data: patData } = usePatientsQuery({ page: 1, pageSize: 200 });
  const patients = patData?.items ?? [];
  const patientLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patients) m.set(p.id, `${p.mrn} — ${p.firstNameEn} ${p.lastNameEn}`);
    return m;
  }, [patients]);

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [clinicId, setClinicId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [operationDate, setOperationDate] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [comments, setComments] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState<string | null>(null);

  const [bookPatientSearch, setBookPatientSearch] = useState("");
  const [debouncedBookPatient, setDebouncedBookPatient] = useState("");
  useEffect(() => {
    const tid = window.setTimeout(() => setDebouncedBookPatient(bookPatientSearch), 280);
    return () => window.clearTimeout(tid);
  }, [bookPatientSearch]);

  const [doctorSearch, setDoctorSearch] = useState("");
  const [debouncedDoctorSearch, setDebouncedDoctorSearch] = useState("");
  useEffect(() => {
    const tid = window.setTimeout(() => setDebouncedDoctorSearch(doctorSearch), 280);
    return () => window.clearTimeout(tid);
  }, [doctorSearch]);

  const schedulingClinicId = clinicId || singleManagedClinic?.id || "";
  const { data: physicians = [], isPending: physiciansPending } = useSchedulingPhysiciansQuery({
    clinicId: schedulingClinicId || undefined,
    search: debouncedDoctorSearch.trim() || undefined,
    enabled: showCreatePanel,
  });

  const { data: bookPatData, isPending: bookPatientsPending } = usePatientsQuery({
    search: debouncedBookPatient.trim() || undefined,
    page: 1,
    pageSize: 100,
    enabled: showCreatePanel,
  });
  const bookPatients = bookPatData?.items ?? [];
  const bookPatientItems: PickListItem[] = useMemo(
    () =>
      bookPatients.map((p) => ({
        value: p.id,
        label: `${p.firstNameEn} ${p.lastNameEn}`.trim(),
        hint: p.mrn,
      })),
    [bookPatients]
  );

  const physicianItems: PickListItem[] = useMemo(
    () => physicians.map((d) => ({ value: d.userId, label: d.displayName, hint: d.email ?? undefined })),
    [physicians]
  );

  const [efPatient, setEfPatient] = useState("");
  const [efDoctor, setEfDoctor] = useState("");
  const [efDate, setEfDate] = useState("");
  const [efTotal, setEfTotal] = useState("");
  const [efDown, setEfDown] = useState("");
  const [efStatus, setEfStatus] = useState("");
  const [completeConfirmOp, setCompleteConfirmOp] = useState<OperationDto | null>(null);
  const [completeCollectionAmount, setCompleteCollectionAmount] = useState("");
  const [completeFormErr, setCompleteFormErr] = useState<string | null>(null);
  const [editOp, setEditOp] = useState<OperationDto | null>(null);
  const [editPatientId, setEditPatientId] = useState("");
  const [editClinicianId, setEditClinicianId] = useState("");
  const [editOperationDate, setEditOperationDate] = useState("");
  const [editTotalCost, setEditTotalCost] = useState("");
  const [editDownPayment, setEditDownPayment] = useState("");
  const [editComments, setEditComments] = useState("");
  const [editClinicId, setEditClinicId] = useState("");
  const [editFormErr, setEditFormErr] = useState<string | null>(null);
  const [editPatientSearch, setEditPatientSearch] = useState("");
  const [debouncedEditPatient, setDebouncedEditPatient] = useState("");
  const [editDoctorSearch, setEditDoctorSearch] = useState("");
  const [debouncedEditDoctor, setDebouncedEditDoctor] = useState("");

  useEffect(() => {
    const tid = window.setTimeout(() => setDebouncedEditPatient(editPatientSearch), 280);
    return () => window.clearTimeout(tid);
  }, [editPatientSearch]);

  useEffect(() => {
    const tid = window.setTimeout(() => setDebouncedEditDoctor(editDoctorSearch), 280);
    return () => window.clearTimeout(tid);
  }, [editDoctorSearch]);

  const openEdit = (o: OperationDto) => {
    setEditOp(o);
    setEditPatientId(o.patientId);
    setEditClinicianId(o.clinicianId);
    setEditClinicId(o.clinicId);
    const d = new Date(o.operationDate);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditOperationDate(local);
    setEditTotalCost(String(o.totalCost));
    setEditDownPayment(String(o.downPayment));
    setEditComments(o.comments ?? "");
    setEditFormErr(null);
    setEditPatientSearch("");
    setEditDoctorSearch("");
  };

  const editSchedulingClinicId = editClinicId || singleManagedClinic?.id || "";
  const { data: editPhysicians = [], isPending: editPhysiciansPending } = useSchedulingPhysiciansQuery({
    clinicId: editSchedulingClinicId || undefined,
    search: debouncedEditDoctor.trim() || undefined,
    enabled: editOp != null,
  });
  const { data: editPatData, isPending: editPatientsPending } = usePatientsQuery({
    search: debouncedEditPatient.trim() || undefined,
    page: 1,
    pageSize: 100,
    enabled: editOp != null,
  });
  const editPatients = editPatData?.items ?? [];
  const editPatientItems: PickListItem[] = useMemo(
    () =>
      editPatients.map((p) => ({
        value: p.id,
        label: `${p.firstNameEn} ${p.lastNameEn}`.trim(),
        hint: p.mrn,
      })),
    [editPatients]
  );
  const editPhysicianItems: PickListItem[] = useMemo(
    () => editPhysicians.map((d) => ({ value: d.userId, label: d.displayName, hint: d.email ?? undefined })),
    [editPhysicians]
  );

  useEffect(() => {
    if (singleManagedClinic) {
      setClinicId(singleManagedClinic.id);
      setFilterClinicId(singleManagedClinic.id);
    }
  }, [singleManagedClinic?.id]);

  const filteredRows = useMemo(() => {
    const loc = i18n.language === "ar" ? "ar-AE" : "en-AE";
    return rows.filter((o) => {
      if (efPatient.trim()) {
        const pText = resolvePatientListLabel({
          patientId: o.patientId,
          patientMrn: o.patientMrn,
          patientName: o.patientName,
          registryLabel: patientLabel.get(o.patientId),
        }).text;
        if (!columnFilterIncludes(pText, efPatient)) return false;
      }
      if (efDoctor.trim() && !columnFilterIncludes(o.clinicianName ?? o.clinicianId, efDoctor)) return false;
      if (efDate.trim()) {
        const ds = new Date(o.operationDate).toLocaleString(loc);
        if (!columnFilterIncludes(ds, efDate) && !columnFilterIncludes(o.operationDate, efDate)) return false;
      }
      if (efTotal.trim() && !columnFilterIncludes(String(o.totalCost), efTotal)) return false;
      if (efDown.trim() && !columnFilterIncludes(String(o.downPayment), efDown)) return false;
      if (efStatus.trim() && !columnFilterIncludes(o.status, efStatus)) return false;
      return true;
    });
  }, [rows, efPatient, efDoctor, efDate, efTotal, efDown, efStatus, i18n.language, patientLabel]);

  const openCompleteDialog = (o: OperationDto) => {
    const balance = Math.max(0, o.balanceDue ?? o.totalCost - (o.paidAmount ?? o.downPayment));
    setCompleteConfirmOp(o);
    setCompleteCollectionAmount(balance > 0.001 ? String(balance) : "");
    setCompleteFormErr(null);
  };

  const completeBalance = completeConfirmOp
    ? Math.max(0, completeConfirmOp.balanceDue ?? completeConfirmOp.totalCost - (completeConfirmOp.paidAmount ?? completeConfirmOp.downPayment))
    : 0;
  const completeCollectionN = Number.parseFloat(completeCollectionAmount || "0");
  const completeCollectionValid =
    completeBalance <= 0.001 ||
    (Number.isFinite(completeCollectionN) &&
      completeCollectionN > 0 &&
      Math.abs(completeCollectionN - completeBalance) < 0.001);

  const statusMut = useMutation({
    mutationFn: ({
      id,
      status,
      collectionAmount,
    }: {
      id: string;
      status: "COMPLETED" | "CANCELLED";
      collectionAmount?: number;
    }) =>
      apiPatch<OperationDto>(`/api/v1/operations/${id}/status`, {
        status,
        ...(collectionAmount !== undefined ? { collectionAmount } : {}),
      }),
    onSuccess: () => {
      setCompleteConfirmOp(null);
      setCompleteCollectionAmount("");
      setCompleteFormErr(null);
      void qc.invalidateQueries({ queryKey: ["operations"] });
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setCompleteFormErr(String((e.body as { message?: unknown }).message));
      } else setCompleteFormErr(e instanceof Error ? e.message : String(e));
    },
  });

  const editMut = useMutation({
    mutationFn: () => {
      if (!editOp) throw new Error("No operation selected");
      return apiPatch<OperationDto>(`/api/v1/operations/${editOp.id}`, {
        patientId: editPatientId,
        clinicianId: editClinicianId,
        operationDate: toOperationIso(editOperationDate),
        totalCost: Number.parseFloat(editTotalCost),
        downPayment: editDownPayment.trim() ? Number.parseFloat(editDownPayment) : 0,
        comments: editComments.trim() || undefined,
        clinicId: editClinicId || undefined,
      });
    },
    onSuccess: () => {
      setEditFormErr(null);
      setEditOp(null);
      void qc.invalidateQueries({ queryKey: ["operations"] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setEditFormErr(String((e.body as { message?: unknown }).message));
      } else setEditFormErr(e instanceof Error ? e.message : String(e));
    },
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiPost<unknown>("/api/v1/operations", {
        patientId,
        clinicianId,
        operationDate: toOperationIso(operationDate),
        totalCost: Number.parseFloat(totalCost),
        downPayment: downPayment.trim() ? Number.parseFloat(downPayment) : 0,
        comments: comments.trim() || undefined,
        clinicId: schedulingClinicId || undefined,
      }),
    onSuccess: () => {
      setFormErr(null);
      setCreateOk(t("operations.created", "Operation scheduled."));
      void qc.invalidateQueries({ queryKey: ["operations"] });
      setPatientId("");
      setBookPatientSearch("");
      setDebouncedBookPatient("");
      setClinicianId("");
      setDoctorSearch("");
      setDebouncedDoctorSearch("");
      setOperationDate("");
      setTotalCost("");
      setDownPayment("");
      setComments("");
    },
    onError: (e: unknown) => {
      setCreateOk(null);
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setFormErr(String((e.body as { message?: unknown }).message));
      } else setFormErr(e instanceof Error ? e.message : String(e));
    },
  });

  const loc = i18n.language === "ar" ? "ar-AE" : "en-AE";
  const money = (n: number) =>
    n.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <Dialog
        open={completeConfirmOp != null}
        onOpenChange={(open) => {
          if (!open) {
            setCompleteConfirmOp(null);
            setCompleteCollectionAmount("");
            setCompleteFormErr(null);
          }
        }}
      >
        <DialogContent aria-describedby={undefined} className="max-w-md border-amber-200/80 dark:border-amber-900/50">
          <div className="space-y-4">
            <DialogHeader className="space-y-3 text-start">
              <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <Lock className="size-5" aria-hidden />
              </div>
              <DialogTitle className="text-start text-xl">
                {t("operations.confirmCompleteTitle", "Mark operation as completed?")}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t(
                "operations.confirmCompleteBody",
                "Collect any remaining balance below. The full operation cost is posted to revenue only when you mark it complete."
              )}
            </p>
            {completeConfirmOp ? (
              <div className="space-y-3 text-sm">
                <p className="font-medium">
                  {resolvePatientListLabel({
                    patientId: completeConfirmOp.patientId,
                    patientMrn: completeConfirmOp.patientMrn,
                    patientName: completeConfirmOp.patientName,
                    registryLabel: patientLabel.get(completeConfirmOp.patientId),
                  }).text}
                </p>
                <div className="grid gap-1 rounded-md border border-border bg-muted/30 p-3 text-muted-foreground">
                  <p>
                    {t("operations.totalCost", "Total cost (AED)")}:{" "}
                    <span className="font-medium text-foreground">{money(completeConfirmOp.totalCost)}</span>
                  </p>
                  <p>
                    {t("operations.downPayment", "Down payment (AED)")}:{" "}
                    <span className="font-medium text-foreground">{money(completeConfirmOp.downPayment)}</span>
                  </p>
                  <p>
                    {t("operations.paidAmount", "Paid (AED)")}:{" "}
                    <span className="font-medium text-foreground">{money(completeConfirmOp.paidAmount ?? 0)}</span>
                  </p>
                  <p className="font-medium text-foreground">
                    {t("operations.confirmCompleteRemaining", "Remaining to collect")}: {money(completeBalance)}
                  </p>
                </div>
                {completeBalance > 0.001 ? (
                  <div className="space-y-1">
                    <Label htmlFor="complete-collection">{t("operations.collectRemaining", "Amount collected now (AED)")}</Label>
                    <Input
                      id="complete-collection"
                      className="ltr-nums"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={completeCollectionAmount}
                      onChange={(e) => {
                        setCompleteCollectionAmount(e.target.value);
                        setCompleteFormErr(null);
                      }}
                      placeholder={money(completeBalance)}
                    />
                    {!completeCollectionValid && completeCollectionAmount.trim() ? (
                      <p className="text-xs text-destructive">
                        {t("operations.collectRemainingHint", "Enter the full remaining amount to continue.")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {t(
                    "operations.confirmCompleteRevenueNote",
                    "On completion, {{amount}} AED will be added to clinic revenue.",
                    { amount: money(completeConfirmOp.totalCost) }
                  )}
                </p>
              </div>
            ) : null}
            {completeFormErr ? <p className="text-sm text-destructive">{completeFormErr}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCompleteConfirmOp(null);
                  setCompleteCollectionAmount("");
                  setCompleteFormErr(null);
                }}
                disabled={statusMut.isPending}
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                type="button"
                disabled={statusMut.isPending || !completeConfirmOp || !completeCollectionValid}
                onClick={() => {
                  if (!completeConfirmOp) return;
                  statusMut.mutate({
                    id: completeConfirmOp.id,
                    status: "COMPLETED",
                    ...(completeBalance > 0.001 ? { collectionAmount: completeCollectionN } : {}),
                  });
                }}
              >
                {t("operations.markCompleted", "Mark completed")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOp != null} onOpenChange={(open) => !open && setEditOp(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("operations.editTitle", "Edit operation")}</DialogTitle>
          </DialogHeader>
          {editOp ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="edit-op-date">{t("operations.operationDate", "Operation date")}</Label>
                <Input
                  id="edit-op-date"
                  className="ltr-nums"
                  type="datetime-local"
                  value={editOperationDate}
                  onChange={(e) => setEditOperationDate(e.target.value)}
                />
              </div>
              {clinics.length > 1 ? (
                <div className="space-y-1">
                  <Label htmlFor="edit-op-clinic">{t("operations.clinic", "Clinic")}</Label>
                  <select
                    id="edit-op-clinic"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    value={editClinicId}
                    onChange={(e) => {
                      setEditClinicId(e.target.value);
                      setEditClinicianId("");
                    }}
                  >
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>
                        {i18n.language === "ar" ? c.nameAr || c.nameEn : c.nameEn || c.nameAr}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label>{t("operations.patient", "Patient")}</Label>
                <SearchablePickList
                  items={editPatientItems}
                  value={editPatientId}
                  onValueChange={setEditPatientId}
                  onSearchQueryChange={setEditPatientSearch}
                  searchPlaceholder={t("encounters.patientSearchPlaceholder", "Type name or MRN to filter…")}
                  placeholder={t("operations.selectPatient", "Select patient")}
                  emptyMessage={
                    editPatientsPending ? t("common.loading") : t("encounters.noPatientsMatch", "No patients match.")
                  }
                  localFilter={false}
                  minSearchLength={1}
                  idleMessage={t("encounters.patientSearchIdle", "Start typing to show matching patients.")}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("operations.doctor", "Performing doctor")}</Label>
                <SearchablePickList
                  items={editPhysicianItems}
                  value={editClinicianId}
                  onValueChange={setEditClinicianId}
                  onSearchQueryChange={setEditDoctorSearch}
                  searchPlaceholder={t("appointments.filterPhysician", "Type physician name…")}
                  placeholder={t("operations.selectDoctor", "Select doctor")}
                  emptyMessage={
                    editPhysiciansPending ? t("common.loading") : t("operations.noDoctors", "No physicians found.")
                  }
                  localFilter={false}
                  minSearchLength={0}
                  idleMessage={t("operations.doctorSearchIdle", "Type a name or pick from the list.")}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-op-total">{t("operations.totalCost", "Total cost (AED)")}</Label>
                  <Input
                    id="edit-op-total"
                    className="ltr-nums"
                    type="text"
                    inputMode="decimal"
                    value={editTotalCost}
                    onChange={(e) => setEditTotalCost(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-op-down">{t("operations.downPayment", "Down payment (AED)")}</Label>
                  <Input
                    id="edit-op-down"
                    className="ltr-nums"
                    type="text"
                    inputMode="decimal"
                    value={editDownPayment}
                    onChange={(e) => setEditDownPayment(e.target.value)}
                  />
                </div>
              </div>
              {(editOp.paidAmount ?? 0) > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("operations.paidAmount", "Paid (AED)")}: {money(editOp.paidAmount ?? 0)} ·{" "}
                  {t("operations.balanceDue", "Balance (AED)")}: {money(editOp.balanceDue ?? 0)}
                </p>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="edit-op-comments">{t("operations.comments", "Comments")}</Label>
                <Textarea
                  id="edit-op-comments"
                  rows={3}
                  value={editComments}
                  onChange={(e) => setEditComments(e.target.value)}
                />
              </div>
              {editFormErr ? <p className="text-sm text-destructive">{editFormErr}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditOp(null)} disabled={editMut.isPending}>
                  {t("common.cancel", "Cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={
                    editMut.isPending ||
                    !editPatientId ||
                    !editClinicianId ||
                    !editOperationDate ||
                    !editTotalCost.trim() ||
                    Number.isNaN(Number.parseFloat(editTotalCost))
                  }
                  onClick={() => editMut.mutate()}
                >
                  {t("operations.saveChanges", "Save changes")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("operations.title", "Operations")}</h1>
        <p className="text-sm text-muted-foreground">
          {isPhysician
            ? t("operations.subtitlePhysician", "Procedures assigned to you.")
            : t("operations.subtitle", "Schedule and track surgical procedures.")}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("dateRange.label", "Reporting period")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="op-from">{t("dateRange.from", "From")}</Label>
            <Input id="op-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-to">{t("dateRange.to", "To")}</Label>
            <Input id="op-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
          {clinics.length > 1 ? (
            <div className="space-y-1">
              <Label htmlFor="op-clinic-filter">{t("operations.clinic", "Clinic")}</Label>
              <select
                id="op-clinic-filter"
                className="flex h-9 w-full min-w-[180px] rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={filterClinicId}
                onChange={(e) => { setFilterClinicId(e.target.value); setPage(1); }}
              >
                <option value="">{t("operations.allClinics", "All clinics")}</option>
                {clinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    {i18n.language === "ar" ? c.nameAr || c.nameEn : c.nameEn || c.nameAr}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canCreate ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{t("operations.schedule", "Schedule operation")}</CardTitle>
            <CreateActionButton type="button" onClick={() => setShowCreatePanel((v) => !v)}>
              {showCreatePanel ? t("common.hide", "Hide") : t("operations.new", "New operation")}
            </CreateActionButton>
          </CardHeader>
          {showCreatePanel ? (
            <CardContent className="space-y-6 overflow-visible">
              <fieldset className="space-y-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-medium">{t("operations.sectionWhen", "When & where")}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="op-date">{t("operations.operationDate", "Operation date")}</Label>
                    <Input
                      id="op-date"
                      className="ltr-nums"
                      type="datetime-local"
                      value={operationDate}
                      onChange={(e) => setOperationDate(e.target.value)}
                    />
                  </div>
                  {clinics.length > 1 ? (
                    <div className="space-y-1">
                      <Label htmlFor="op-clinic">{t("operations.clinic", "Clinic")}</Label>
                      <select
                        id="op-clinic"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                        value={clinicId}
                        onChange={(e) => {
                          setClinicId(e.target.value);
                          setClinicianId("");
                        }}
                      >
                        <option value="">{t("operations.autoClinic", "Patient home branch")}</option>
                        {clinics.map((c) => (
                          <option key={c.id} value={c.id}>
                            {i18n.language === "ar" ? c.nameAr || c.nameEn : c.nameEn || c.nameAr}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              </fieldset>

              <fieldset className="space-y-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-medium">{t("operations.sectionPeople", "Patient & doctor")}</legend>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label>{t("operations.patient", "Patient")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("encounters.selectPatientHint", "Search by name or MRN, then choose a row.")}
                    </p>
                    <SearchablePickList
                      items={bookPatientItems}
                      value={patientId}
                      onValueChange={setPatientId}
                      onSearchQueryChange={setBookPatientSearch}
                      searchPlaceholder={t("encounters.patientSearchPlaceholder", "Type name or MRN to filter…")}
                      placeholder={t("operations.selectPatient", "Select patient")}
                      emptyMessage={
                        bookPatientsPending ? t("common.loading") : t("encounters.noPatientsMatch", "No patients match.")
                      }
                      localFilter={false}
                      minSearchLength={1}
                      idleMessage={t("encounters.patientSearchIdle", "Start typing to show matching patients.")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("operations.doctor", "Performing doctor")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("operations.doctorHint", "Doctors assigned to the selected clinic. Type a name to filter.")}
                    </p>
                    <SearchablePickList
                      items={physicianItems}
                      value={clinicianId}
                      onValueChange={setClinicianId}
                      onSearchQueryChange={setDoctorSearch}
                      searchPlaceholder={t("appointments.filterPhysician", "Type physician name…")}
                      placeholder={t("operations.selectDoctor", "Select doctor")}
                      emptyMessage={
                        physiciansPending ? t("common.loading") : t("operations.noDoctors", "No physicians found.")
                      }
                      localFilter={false}
                      minSearchLength={0}
                      idleMessage={t("operations.doctorSearchIdle", "Type a name or pick from the list.")}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-medium">{t("operations.sectionPayment", "Cost & payment")}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="op-total">{t("operations.totalCost", "Total cost (AED)")}</Label>
                    <Input
                      id="op-total"
                      className="ltr-nums bg-background"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={totalCost}
                      onChange={(e) => setTotalCost(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="op-down">{t("operations.downPayment", "Down payment (AED)")}</Label>
                    <Input
                      id="op-down"
                      className="ltr-nums bg-background"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={downPayment}
                      onChange={(e) => setDownPayment(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-medium">{t("operations.comments", "Comments")}</legend>
                <Textarea
                  id="op-comments"
                  className="bg-background"
                  rows={3}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder={t("operations.commentsPlaceholder", "Notes about the procedure…")}
                />
              </fieldset>

              {formErr ? <p className="text-sm text-destructive">{formErr}</p> : null}
              {createOk ? <p className="text-sm text-emerald-600">{createOk}</p> : null}
              <CreateActionButton
                type="button"
                disabled={
                  createMut.isPending ||
                  !patientId ||
                  !clinicianId ||
                  !operationDate ||
                  !totalCost.trim() ||
                  Number.isNaN(Number.parseFloat(totalCost))
                }
                onClick={() => createMut.mutate()}
              >
                {t("operations.save", "Save operation")}
              </CreateActionButton>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isPhysician
              ? t("operations.myOperations", "My operations")
              : t("operations.list", "Scheduled operations")}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : isError ? (
            <p className="text-sm text-destructive">{error instanceof Error ? error.message : String(error)}</p>
          ) : (
            <>
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <SortableTh
                      label={t("operations.operationDate", "Operation date")}
                      column="operationDate"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                    />
                    <FilterTh
                      label={t("operations.patient", "Patient")}
                      value={efPatient}
                      onChange={setEfPatient}
                    />
                    <FilterTh
                      label={t("operations.doctor", "Performing doctor")}
                      value={efDoctor}
                      onChange={setEfDoctor}
                    />
                    <SortableTh
                      label={t("operations.totalCost", "Total cost (AED)")}
                      column="totalCost"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                    />
                    <SortableTh
                      label={t("operations.downPayment", "Down payment (AED)")}
                      column="downPayment"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                    />
                    <th className="px-3 py-2 text-start font-medium">{t("operations.paidAmount", "Paid (AED)")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("operations.balanceDue", "Balance (AED)")}</th>
                    <SortableTh
                      label={t("operations.status", "Status")}
                      column="status"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      filterValue={efStatus}
                      onFilterChange={setEfStatus}
                    />
                    <th className="px-3 py-2 text-start font-medium">{t("operations.comments", "Comments")}</th>
                    <th className="px-3 py-2 text-end font-medium">{t("common.actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                        {t("operations.empty", "No operations in this period.")}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((o) => {
                      const clinic = clinicById.get(o.clinicId);
                      const clinicLabel = clinic
                        ? i18n.language === "ar"
                          ? clinic.ar || clinic.en
                          : clinic.en || clinic.ar
                        : null;
                      const patientText = resolvePatientListLabel({
                        patientId: o.patientId,
                        patientMrn: o.patientMrn,
                        patientName: o.patientName,
                        registryLabel: patientLabel.get(o.patientId),
                      }).text;
                      return (
                        <tr key={o.id} className="border-b last:border-0">
                          <td className="px-3 py-2 align-top">
                            <div>{new Date(o.operationDate).toLocaleString(loc)}</div>
                            {clinicLabel ? (
                              <div className="text-xs text-muted-foreground">{clinicLabel}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 align-top">{patientText}</td>
                          <td className="px-3 py-2 align-top">{o.clinicianName ?? "—"}</td>
                          <td className="px-3 py-2 align-top">{money(o.totalCost)}</td>
                          <td className="px-3 py-2 align-top">{money(o.downPayment)}</td>
                          <td className="px-3 py-2 align-top">{money(o.paidAmount ?? 0)}</td>
                          <td className="px-3 py-2 align-top">{money(o.balanceDue ?? o.totalCost - (o.paidAmount ?? 0))}</td>
                          <td className="px-3 py-2 align-top">
                            <OperationStatusBadge status={o.status ?? "SCHEDULED"} />
                          </td>
                          <td className="max-w-[200px] px-3 py-2 align-top text-muted-foreground">
                            {o.comments?.trim() || "—"}
                          </td>
                          <td className="px-3 py-2 align-top text-end">
                            {o.status === "SCHEDULED" ? (
                              <div className="flex flex-wrap justify-end gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={statusMut.isPending || editMut.isPending}
                                  onClick={() => openEdit(o)}
                                >
                                  {t("operations.edit", "Edit")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={statusMut.isPending}
                                  onClick={() => openCompleteDialog(o)}
                                >
                                  {t("operations.markCompleted", "Mark completed")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  disabled={statusMut.isPending}
                                  onClick={() => statusMut.mutate({ id: o.id, status: "CANCELLED" })}
                                >
                                  {t("operations.markCancelled", "Cancel")}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={opTotal}
                totalPages={opTotalPages}
                onPageChange={setPage}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
