import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Pencil } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CreateActionButton } from "@/components/create-action-button";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PatientEditDialog } from "@/components/patient-edit-dialog";
import { PatientPhoneField } from "@/components/patient-phone-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SearchInput } from "@/components/search-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import type { PatientDto } from "@/lib/api-schema";
import { useClinicsQuery, fetchPatientsList, patientsListQueryKey, usePatientsQuery } from "@/lib/api-hooks";
import { apiDelete, apiPost, apiPostFormData } from "@/lib/http";
import { columnFilterIncludes } from "@/lib/utils";
import { formatGender } from "@/lib/locale-display";
import { formatClinicName } from "@/lib/locale-display";
import { useAuthStore } from "@/stores/auth-store";
import { canManagePatientsInList } from "@/lib/patient-edit-policy";
import { apiErrorMessage } from "@/features/platform/platform-shared";
import {
  PendingDocumentAttachments,
  pendingDocumentDescription,
  type PendingDocumentRow,
} from "@/components/pending-document-attachments";
import {
  PATIENT_ACQUISITION_CHANNELS,
  patientAcquisitionLabel,
  type PatientAcquisitionChannel,
} from "@/lib/patient-acquisition";
import {
  parsePhoneConflictFromError,
  phoneConflictMessage,
  type PatientPhoneConflictPatient,
} from "@/lib/patient-phone-conflict";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import { collectPatientRegisterValidationIssues } from "@/lib/create-form-validation";

export function PatientsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [quickSearch, setQuickSearch] = useState("");
  const debouncedQuick = useDebouncedValue(quickSearch, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("mrn");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [pfMrn, setPfMrn] = useState("");
  const [pfName, setPfName] = useState("");
  const [pfGender, setPfGender] = useState("");
  const [pfDob, setPfDob] = useState("");
  const [pfEmail, setPfEmail] = useState("");
  const [pfBranch, setPfBranch] = useState("");
  const [patientToDelete, setPatientToDelete] = useState<PatientDto | null>(null);
  const [patientToEdit, setPatientToEdit] = useState<PatientDto | null>(null);

  const query = useMemo(
    () => ({
      search: debouncedQuick,
      page,
      pageSize,
      sortBy,
      sortOrder,
    }),
    [debouncedQuick, page, pageSize, sortBy, sortOrder]
  );

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };

  const { data, isFetching, isError, error } = usePatientsQuery(query);
  const items: PatientDto[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const filteredPatients = useMemo(() => {
    return items.filter((p) => {
      if (pfMrn.trim() && !columnFilterIncludes(p.mrn, pfMrn)) return false;
      const nameHay = `${p.firstNameEn} ${p.lastNameEn} ${p.firstNameAr ?? ""} ${p.lastNameAr ?? ""}`;
      if (pfName.trim() && !columnFilterIncludes(nameHay, pfName)) return false;
      const gLabel = p.gender === "M" ? "male m" : p.gender === "F" ? "female f" : String(p.gender);
      if (
        pfGender.trim() &&
        !columnFilterIncludes(gLabel, pfGender) &&
        !columnFilterIncludes(String(p.gender), pfGender)
      ) {
        return false;
      }
      if (pfDob.trim() && !columnFilterIncludes(p.dob, pfDob)) return false;
      if (pfEmail.trim() && !columnFilterIncludes(p.email ?? "", pfEmail)) return false;
      if (pfBranch.trim() && !columnFilterIncludes(p.homeBranch ?? "", pfBranch)) return false;
      return true;
    });
  }, [items, pfMrn, pfName, pfGender, pfDob, pfEmail, pfBranch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuick]);

  const { data: clinics = [] } = useClinicsQuery();
  const authRole = useAuthStore((s) => s.user?.role);
  const canManagePatients = canManagePatientsInList(authRole);
  const singleManagedClinic = clinics.length === 1 ? clinics[0]! : null;
  const defaultHomeBranchId = singleManagedClinic?.id ?? clinics[0]?.id ?? "";
  const [open, setOpen] = useState(false);
  const [firstNameEn, setFirstNameEn] = useState("");
  const [lastNameEn, setLastNameEn] = useState("");
  const [firstNameAr, setFirstNameAr] = useState("");
  const [lastNameAr, setLastNameAr] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("M");
  const [phone, setPhone] = useState("");
  const [phoneConflict, setPhoneConflict] = useState<PatientPhoneConflictPatient | null>(null);
  const [email, setEmail] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [nationalIdDocFile, setNationalIdDocFile] = useState<File | null>(null);
  const [homeBranchId, setHomeBranchId] = useState("");
  const [docRows, setDocRows] = useState<PendingDocumentRow[]>([]);
  const [acquisitionChannel, setAcquisitionChannel] = useState<PatientAcquisitionChannel | "">("");
  const [acquisitionReferralName, setAcquisitionReferralName] = useState("");
  const [acquisitionOtherDetail, setAcquisitionOtherDetail] = useState("");
  const [docInvalidRowIds, setDocInvalidRowIds] = useState<Set<string>>(() => new Set());
  const formErrRef = useRef<HTMLParagraphElement>(null);
  const validation = useValidationIssuesDialog({ intent: "create" });

  const resetForm = () => {
    setFirstNameEn("");
    setLastNameEn("");
    setFirstNameAr("");
    setLastNameAr("");
    setDob("");
    setGender("M");
    setPhone("");
    setPhoneConflict(null);
    setEmail("");
    setNationalId("");
    setNationalIdDocFile(null);
    setHomeBranchId(defaultHomeBranchId);
    setDocRows([]);
    setAcquisitionChannel("");
    setAcquisitionReferralName("");
    setAcquisitionOtherDetail("");
    setDocInvalidRowIds(new Set());
  };

  useEffect(() => {
    if (open && defaultHomeBranchId) {
      setHomeBranchId(defaultHomeBranchId);
    }
  }, [open, defaultHomeBranchId]);

  const showFormError = (issues: string[], invalidDocRowIds = new Set<string>()) => {
    setDocInvalidRowIds(invalidDocRowIds);
    validation.showIssues(issues);
    window.requestAnimationFrame(() => {
      formErrRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const handleSubmitRegister = () => {
    const result = collectPatientRegisterValidationIssues(
      {
        firstNameEn,
        lastNameEn,
        firstNameAr,
        lastNameAr,
        dob,
        gender,
        phone,
        email,
        nationalId,
        homeBranchId,
        acquisition: {
          channel: acquisitionChannel,
          referralName: acquisitionReferralName,
          otherDetail: acquisitionOtherDetail,
        },
        docRows,
      },
      t,
    );
    if (result.issues.length > 0) {
      showFormError(result.issues, result.invalidDocRowIds);
      return;
    }
    if (phoneConflict) {
      showFormError([phoneConflictMessage(phoneConflict, t, i18n.language)]);
      return;
    }
    setDocInvalidRowIds(new Set());
    validation.clear();
    createMut.mutate();
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const result = collectPatientRegisterValidationIssues(
        {
          firstNameEn,
          lastNameEn,
          firstNameAr,
          lastNameAr,
          dob,
          gender,
          phone,
          email,
          nationalId,
          homeBranchId,
          acquisition: {
            channel: acquisitionChannel,
            referralName: acquisitionReferralName,
            otherDetail: acquisitionOtherDetail,
          },
          docRows,
        },
        t,
      );
      if (result.issues.length > 0) throw new Error(result.issues.join(" "));

      const body: Record<string, string | undefined> = {
        firstNameEn,
        lastNameEn,
        firstNameAr: firstNameAr.trim(),
        lastNameAr: lastNameAr.trim(),
        ...(dob.trim() ? { dob: dob.trim() } : {}),
        gender,
        phone: phone.trim(),
        email: email.trim() || undefined,
        nationalId: nationalId.trim() || undefined,
        homeBranchId: homeBranchId || undefined,
      };
      if (acquisitionChannel) {
        body.acquisitionChannel = acquisitionChannel;
        if (acquisitionChannel === "DOCTOR_REFERRAL") {
          body.acquisitionReferralName = acquisitionReferralName.trim();
        }
        if (acquisitionChannel === "OTHER") {
          body.acquisitionOtherDetail = acquisitionOtherDetail.trim();
        }
      }

      const patient = await apiPost<PatientDto>("/api/v1/patients", body);
      if (nationalIdDocFile) {
        const fd = new FormData();
        fd.append("file", nationalIdDocFile);
        await apiPostFormData<PatientDto>(`/api/v1/patients/${patient.id}/national-id-document`, fd);
      }
      for (const row of docRows) {
        if (row.files.length === 0) continue;
        const description = pendingDocumentDescription(row, t);
        if (!description.trim()) {
          throw new Error(t("patients.errorDocCategoryRequired", "Each attached document needs a type."));
        }
        for (const file of row.files) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("description", description);
          await apiPostFormData(`/api/v1/patients/${patient.id}/documents`, fd);
        }
      }
      return patient;
    },
    onSuccess: async () => {
      validation.clear();
      setDocInvalidRowIds(new Set());
      setOpen(false);
      resetForm();
      toast.success(t("patients.createSuccess", "Patient registered."));

      setPfMrn("");
      setPfName("");
      setPfGender("");
      setPfDob("");
      setPfEmail("");
      setPfBranch("");
      setQuickSearch("");
      setPage(1);
      setSortBy("createdAt");
      setSortOrder("desc");

      const listParams = {
        page: 1,
        pageSize,
        sortBy: "createdAt",
        sortOrder: "desc" as const,
        search: "",
      };
      await qc.fetchQuery({
        queryKey: patientsListQueryKey(listParams),
        queryFn: () => fetchPatientsList(listParams),
      });
      await qc.invalidateQueries({ queryKey: ["patients"] });
      await qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
    onError: (e: unknown) => {
      const conflict = parsePhoneConflictFromError(e);
      if (conflict) {
        setPhoneConflict(conflict);
        showFormError([phoneConflictMessage(conflict, t, i18n.language)]);
        return;
      }
      showFormError([apiErrorMessage(e)]);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (patientId: string) => apiDelete(`/api/v1/patients/${patientId}`),
    onSuccess: () => {
      setPatientToDelete(null);
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      void qc.invalidateQueries({ queryKey: ["admin", "org-patients"] });
    },
  });

  const handleEditPatient = (patient: PatientDto, e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPatientToEdit(patient);
  };

  const handleDeletePatient = (patient: PatientDto, e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPatientToDelete(patient);
  };

  const deletePatientName = patientToDelete
    ? i18n.language === "ar" && patientToDelete.firstNameAr
      ? `${patientToDelete.firstNameAr} ${patientToDelete.lastNameAr ?? ""}`.trim()
      : `${patientToDelete.firstNameEn} ${patientToDelete.lastNameEn}`.trim()
    : "";

  return (
    <div className="space-y-6">
      <ValidationIssuesDialog {...validation.dialogProps} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("patients.title")}</h1>
          <p className="text-muted-foreground">{t("patients.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <CreateActionButton type="button">{t("patients.newPatient")}</CreateActionButton>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t("patients.registerTitle")}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-1">
              {validation.formErr ? (
                <p ref={formErrRef} className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {validation.formErr}
                </p>
              ) : null}
              <div className="space-y-2">
                <Label required>{t("patients.firstNameEn")}</Label>
                <Input value={firstNameEn} onChange={(e) => setFirstNameEn(e.target.value)} autoComplete="given-name" />
              </div>
              <div className="space-y-2">
                <Label required>{t("patients.lastNameEn")}</Label>
                <Input value={lastNameEn} onChange={(e) => setLastNameEn(e.target.value)} autoComplete="family-name" />
              </div>
              <div className="space-y-2">
                <Label required>{t("patients.firstNameAr")}</Label>
                <Input value={firstNameAr} onChange={(e) => setFirstNameAr(e.target.value)} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label required>{t("patients.lastNameAr")}</Label>
                <Input value={lastNameAr} onChange={(e) => setLastNameAr(e.target.value)} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label optional>{t("patients.dob")}</Label>
                <Input className="ltr-nums" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.gender")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="M">{t("patients.genderM")}</option>
                  <option value="F">{t("patients.genderF")}</option>
                </select>
              </div>
              <PatientPhoneField
                value={phone}
                onChange={setPhone}
                enabled={open}
                externalConflict={phoneConflict}
                onConflictChange={setPhoneConflict}
              />
              <div className="space-y-2">
                <Label>
                  {t("patients.nationalId")}{" "}
                  <span className="text-xs font-normal text-muted-foreground">({t("common.optional", "optional")})</span>
                </Label>
                <Input className="ltr-nums" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>
                  {t("patients.nationalIdDocument")}{" "}
                  <span className="text-xs font-normal text-muted-foreground">({t("common.optional", "optional")})</span>
                </Label>
                <Input
                  className="cursor-pointer text-sm"
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setNationalIdDocFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">{t("patients.nationalIdDocumentHint")}</p>
                {nationalIdDocFile ? <p className="text-xs text-muted-foreground ltr-nums">{nationalIdDocFile.name}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>
                  {t("patients.email")}{" "}
                  <span className="text-xs font-normal text-muted-foreground">({t("common.optional", "optional")})</span>
                </Label>
                <Input type="text" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.homeBranch")}</Label>
                {singleManagedClinic ? (
                  <p className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                    {formatClinicName(singleManagedClinic, i18n.language)}{" "}
                    <span className="text-muted-foreground">
                      (
                      {authRole === "branch_manager"
                        ? t("admin.managedClinicBm", "your clinic")
                        : t("admin.managedClinicCa", "assigned clinic")}
                      )
                    </span>
                  </p>
                ) : (
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={homeBranchId}
                    onChange={(e) => setHomeBranchId(e.target.value)}
                  >
                    <option value="">{t("patients.optionalBranch")}</option>
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatClinicName(c, i18n.language)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <PendingDocumentAttachments
                className="space-y-3 border-t border-border pt-3"
                rows={docRows}
                invalidRowIds={docInvalidRowIds}
                onChange={(next) => {
                  setDocRows(next);
                  setDocInvalidRowIds(new Set());
                }}
              />

              <div className="space-y-2 border-t border-border pt-3">
                <Label>{t("patients.howDidTheyFindUs", "How did they find us?")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={acquisitionChannel}
                  onChange={(e) => {
                    const v = e.target.value as PatientAcquisitionChannel | "";
                    setAcquisitionChannel(v);
                    if (v !== "DOCTOR_REFERRAL") setAcquisitionReferralName("");
                    if (v !== "OTHER") setAcquisitionOtherDetail("");
                  }}
                >
                  <option value="">{t("patients.cameThroughOptional", "Optional")}</option>
                  {PATIENT_ACQUISITION_CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {patientAcquisitionLabel(ch, t)}
                    </option>
                  ))}
                </select>
              </div>
              {acquisitionChannel === "DOCTOR_REFERRAL" ? (
                <div className="space-y-2">
                  <Label required>{t("patients.explainMore", "Explain more")}</Label>
                  <Input
                    value={acquisitionReferralName}
                    onChange={(e) => setAcquisitionReferralName(e.target.value)}
                    placeholder={t("patients.explainMorePh", "Add details…")}
                  />
                </div>
              ) : null}
              {acquisitionChannel === "OTHER" ? (
                <div className="space-y-2">
                  <Label required>{t("patients.explainMore", "Explain more")}</Label>
                  <Input
                    value={acquisitionOtherDetail}
                    onChange={(e) => setAcquisitionOtherDetail(e.target.value)}
                    placeholder={t("patients.explainMorePh", "Add details…")}
                  />
                </div>
              ) : null}

              {validation.formErr ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {validation.formErr}
                </p>
              ) : null}

              <CreateActionButton
                type="button"
                className="mt-2"
                disabled={createMut.isPending}
                onClick={handleSubmitRegister}
              >
                {t("patients.submitRegister")}
              </CreateActionButton>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("patients.search")}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={!pfMrn.trim() && !pfName.trim() && !pfGender.trim() && !pfDob.trim() && !pfEmail.trim() && !pfBranch.trim()}
            onClick={() => {
              setPfMrn("");
              setPfName("");
              setPfGender("");
              setPfDob("");
              setPfEmail("");
              setPfBranch("");
            }}
          >
            {t("patients.clearColFilters", "Clear column filters")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError ? (
            <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p>
          ) : null}
          <SearchInput
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder={t("patients.searchPlaceholder")}
            aria-busy={isFetching}
          />
          <ResponsiveTable>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60">
                <tr className="text-start">
                  <SortableTh
                    label={t("patients.mrn")}
                    column="mrn"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={pfMrn}
                    onFilterChange={setPfMrn}
                  />
                  <SortableTh
                    label={t("hr.name")}
                    column="lastNameEn"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={pfName}
                    onFilterChange={setPfName}
                  />
                  <SortableTh
                    label={t("patients.gender")}
                    column="gender"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    align="center"
                    filterValue={pfGender}
                    onFilterChange={setPfGender}
                  />
                  <SortableTh
                    label={t("patients.dob")}
                    column="dob"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={pfDob}
                    onFilterChange={setPfDob}
                  />
                  <FilterTh label={t("patients.email")} value={pfEmail} onChange={setPfEmail} />
                  <FilterTh label={t("patients.branch")} value={pfBranch} onChange={setPfBranch} />
                  {canManagePatients ? (
                    <th className="px-3 py-2 text-end">{t("common.actions", "Actions")}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((p) => (
                  <tr
                    key={p.id}
                    role="link"
                    tabIndex={0}
                    className="border-t border-border transition-colors hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/patients/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/patients/${p.id}`);
                      }
                    }}
                  >
                    <td className="px-3 py-2 font-mono text-xs ltr-nums">{p.mrn}</td>
                    <td className="px-3 py-2">
                      {i18n.language === "ar" && p.firstNameAr ? (
                        <span>
                          {p.firstNameAr} {p.lastNameAr}
                        </span>
                      ) : (
                        <span>
                          {p.firstNameEn} {p.lastNameEn}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatGender(p.gender, t)}
                      </span>
                    </td>
                    <td className="px-3 py-2 ltr-nums">{p.dob ?? t("common.notAvailable", "—")}</td>
                    <td className="max-w-[10rem] truncate px-3 py-2 text-xs text-muted-foreground">{p.email ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.homeBranch}</td>
                    {canManagePatients ? (
                      <td className="px-3 py-2 text-end">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={t("patients.editPatient", "Edit patient")}
                            onClick={(e) => handleEditPatient(p, e)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label={t("patients.deletePatient", "Delete patient")}
                            disabled={deleteMut.isPending}
                            onClick={(e) => handleDeletePatient(p, e)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {items.length === 0 && !isFetching ? (
                  <tr>
                    <td colSpan={canManagePatients ? 7 : 6} className="px-3 py-8 text-center text-muted-foreground">
                      {t("patients.empty")}
                    </td>
                  </tr>
                ) : null}
                {items.length > 0 && filteredPatients.length === 0 && !isFetching ? (
                  <tr>
                    <td colSpan={canManagePatients ? 7 : 6} className="px-3 py-8 text-center text-muted-foreground">
                      {t("patients.noColMatch", "No rows match the column filters.")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ResponsiveTable>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            disabled={isFetching}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={patientToDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setPatientToDelete(null);
        }}
        title={t("patients.deleteConfirmTitle", "Delete patient?")}
        description={t(
          "patients.deleteConfirmBody",
          "Delete {{name}} ({{mrn}})? They will be removed from the registry.",
          { name: deletePatientName, mrn: patientToDelete?.mrn ?? "" },
        )}
        confirmLabel={t("patients.deleteConfirmAction", "Delete patient")}
        cancelLabel={t("common.cancel", "Cancel")}
        pending={deleteMut.isPending}
        onConfirm={() => {
          if (patientToDelete) deleteMut.mutate(patientToDelete.id);
        }}
      />

      {patientToEdit ? (
        <PatientEditDialog
          patient={patientToEdit}
          open={Boolean(patientToEdit)}
          onOpenChange={(open) => {
            if (!open) setPatientToEdit(null);
          }}
        />
      ) : null}
    </div>
  );
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (typeof value === "string" && value.trim() === "") {
      setV(value);
      return;
    }
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}
