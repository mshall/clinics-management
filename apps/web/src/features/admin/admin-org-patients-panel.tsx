import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  emptyPatientAcquisitionFormValues,
  PatientAcquisitionFields,
  patientAcquisitionFormToBody,
  patientAcquisitionFormValuesFromPatient,
  validatePatientAcquisitionForm,
  type PatientAcquisitionFormValues,
} from "@/components/patient-acquisition-fields";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClinicsQuery, usePatientQuery } from "@/lib/api-hooks";
import type { PatientDto } from "@/lib/api-schema";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/http";
import { formatClinicName } from "@/lib/locale-display";
import type { Paginated } from "@/lib/paginated";
import { formatPatientEnglishName } from "@/lib/patient-display";
import { apiErrorMessage } from "@/features/platform/platform-shared";

type DialogMode = null | "create" | { edit: string };

function dobInputValue(iso: string | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function AdminOrgPatientsPanel() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  const [firstNameEn, setFirstNameEn] = useState("");
  const [lastNameEn, setLastNameEn] = useState("");
  const [firstNameAr, setFirstNameAr] = useState("");
  const [lastNameAr, setLastNameAr] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("M");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [homeBranchId, setHomeBranchId] = useState("");
  const [acquisition, setAcquisition] = useState<PatientAcquisitionFormValues>(emptyPatientAcquisitionFormValues());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);

  const editPatientId = dialogMode && typeof dialogMode === "object" ? dialogMode.edit : null;
  const isCreate = dialogMode === "create";
  const isEdit = Boolean(editPatientId);
  const dialogOpen = isCreate || isEdit;

  const { data: clinics = [] } = useClinicsQuery();

  const patientsQuery = useQuery({
    queryKey: ["admin", "org-patients", page, pageSize, search],
    queryFn: () => {
      const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";
      return apiGet<Paginated<PatientDto>>(`/api/v1/patients?page=${page}&pageSize=${pageSize}${q}`);
    },
  });

  const patientDetailQuery = usePatientQuery(isEdit ? editPatientId ?? undefined : undefined);

  const resetCreateForm = () => {
    setFirstNameEn("");
    setLastNameEn("");
    setFirstNameAr("");
    setLastNameAr("");
    setDob("");
    setGender("M");
    setPhone("");
    setEmail("");
    setNationalId("");
    setHomeBranchId("");
    setAcquisition(emptyPatientAcquisitionFormValues());
    setFormErr(null);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setFormErr(null);
  };

  useEffect(() => {
    if (!isEdit || !patientDetailQuery.data) return;
    const p = patientDetailQuery.data;
    setFirstNameEn(p.firstNameEn);
    setLastNameEn(p.lastNameEn);
    setFirstNameAr(p.firstNameAr ?? "");
    setLastNameAr(p.lastNameAr ?? "");
    setDob(dobInputValue(p.dob));
    setGender(p.gender ?? "M");
    setPhone(p.phone);
    setEmail(p.email ?? "");
    setNationalId(p.nationalId ?? "");
    setHomeBranchId(p.homeBranchId ?? "");
    setAcquisition(patientAcquisitionFormValuesFromPatient(p));
  }, [isEdit, patientDetailQuery.data]);

  const validateForm = (): string | null => {
    if (!firstNameEn.trim() || !lastNameEn.trim()) {
      return t("patients.errorNameRequired", "English first and last name are required.");
    }
    if (!firstNameAr.trim()) {
      return t("patients.errorFirstNameAr", "Arabic first name is required.");
    }
    if (!lastNameAr.trim()) {
      return t("patients.errorLastNameAr", "Arabic last name is required.");
    }
    if (!dob) return t("patients.errorDobRequired", "Date of birth is required.");
    if (!phone.trim()) return t("patients.errorPhoneRequired", "Phone is required.");
    return validatePatientAcquisitionForm(acquisition, t);
  };

  const buildBody = (): Record<string, string | undefined> => ({
    firstNameEn: firstNameEn.trim(),
    lastNameEn: lastNameEn.trim(),
    firstNameAr: firstNameAr.trim(),
    lastNameAr: lastNameAr.trim(),
    dob,
    gender,
    phone: phone.trim(),
    email: email.trim() || undefined,
    nationalId: nationalId.trim() || undefined,
    homeBranchId: homeBranchId || undefined,
    ...patientAcquisitionFormToBody(acquisition),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const err = validateForm();
      if (err) throw new Error(err);
      return apiPost<PatientDto>("/api/v1/patients", buildBody());
    },
    onSuccess: () => {
      setFormErr(null);
      closeDialog();
      void qc.invalidateQueries({ queryKey: ["admin", "org-patients"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
    onError: (e: unknown) => setFormErr(apiErrorMessage(e)),
  });

  const patchMut = useMutation({
    mutationFn: () => {
      const err = validateForm();
      if (err) throw new Error(err);
      return apiPatch<PatientDto>(`/api/v1/patients/${editPatientId}`, buildBody());
    },
    onSuccess: () => {
      setFormErr(null);
      closeDialog();
      void qc.invalidateQueries({ queryKey: ["admin", "org-patients"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["patient", editPatientId] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
    onError: (e: unknown) => setFormErr(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (patientId: string) => apiDelete(`/api/v1/patients/${patientId}`),
    onSuccess: () => {
      closeDialog();
      void qc.invalidateQueries({ queryKey: ["admin", "org-patients"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
    onError: (e: unknown) => setFormErr(apiErrorMessage(e)),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: () => {
      if (selectAllMatching) {
        return apiPost<{ ok: true; deleted: number }>("/api/v1/patients/bulk-delete", {
          all: true,
          search: search.trim() || undefined,
        });
      }
      return apiPost<{ ok: true; deleted: number }>("/api/v1/patients/bulk-delete", { ids: [...selectedIds] });
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setSelectAllMatching(false);
      void qc.invalidateQueries({ queryKey: ["admin", "org-patients"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) alert(e.message);
      else alert(e instanceof Error ? e.message : String(e));
    },
  });

  const canSave =
    firstNameEn.trim() &&
    lastNameEn.trim() &&
    firstNameAr.trim() &&
    lastNameAr.trim() &&
    dob &&
    phone.trim();

  const homeBranchLabel = useMemo(
    () => (row: PatientDto) => {
      const c = row.homeBranchId ? clinics.find((x) => x.id === row.homeBranchId) : undefined;
      if (c) return formatClinicName(c, i18n.language);
      const branchName = typeof row.homeBranch === "string" ? row.homeBranch : null;
      if (branchName) return branchName;
      return t("admin.orgPatientsNoBranch", "—");
    },
    [clinics, i18n.language, t],
  );

  const rows = patientsQuery.data?.items ?? [];
  const total = patientsQuery.data?.total ?? 0;
  const totalPages = patientsQuery.data?.totalPages ?? 1;

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));
  const selectedCount = selectAllMatching ? total : selectedIds.size;

  const toggleRow = (id: string, on: boolean) => {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const togglePageAll = () => {
    if (allPageSelected) {
      setSelectAllMatching(false);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  useEffect(() => {
    setSelectAllMatching(false);
    setSelectedIds(new Set());
  }, [page, pageSize, search]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("admin.tabOrgPatients", "Organization patients")}</CardTitle>
            <CardDescription>
              {t("admin.orgPatientsHint", "Register, update, and remove patient records across your organization.")}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                resetCreateForm();
                setDialogMode("create");
              }}
            >
              {t("admin.createPatient", "Create patient")}
            </Button>
            {selectedCount > 0 ? (
              <Button
                type="button"
                variant="destructive"
                disabled={bulkDeleteMut.isPending}
                onClick={() => {
                  const msg = selectAllMatching
                    ? t("admin.orgPatientsBulkDeleteAllConfirm", "Delete all {{count}} patients matching this search?", { count: total })
                    : t("admin.orgPatientsBulkDeleteConfirm", "Delete {{count}} selected patients?", { count: selectedCount });
                  if (window.confirm(msg)) bulkDeleteMut.mutate();
                }}
              >
                {t("admin.orgPatientsBulkDelete", "Delete selected ({{count}})", { count: selectedCount })}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {patientsQuery.isError ? (
            <p className="text-sm text-destructive">
              {patientsQuery.error instanceof ApiError ? patientsQuery.error.message : t("common.error")}
            </p>
          ) : null}
          <div className="max-w-sm space-y-2">
            <Label htmlFor="org-patients-search">{t("admin.orgPatientsSearch", "Search patients")}</Label>
            <Input
              id="org-patients-search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t("admin.orgPatientsSearchPh", "MRN, name, phone, or national ID…")}
            />
          </div>

          {patientsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <>
              {allPageSelected && total > rows.length ? (
                <p className="text-sm text-muted-foreground">
                  {selectAllMatching ? (
                    <>
                      {t("admin.orgPatientsAllMatchingSelected", "All {{count}} patients matching this search are selected.", { count: total })}{" "}
                      <button type="button" className="underline" onClick={() => { setSelectAllMatching(false); setSelectedIds(new Set()); }}>
                        {t("admin.orgPatientsClearSelection", "Clear selection")}
                      </button>
                    </>
                  ) : (
                    <>
                      {t("admin.orgPatientsSelectAllPrompt", "All {{count}} patients on this page are selected.", { count: rows.length })}{" "}
                      <button type="button" className="font-medium underline" onClick={() => setSelectAllMatching(true)}>
                        {t("admin.orgPatientsSelectAllMatching", "Select all {{count}} matching patients", { count: total })}
                      </button>
                    </>
                  )}
                </p>
              ) : null}
              <ResponsiveTable>
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={t("admin.orgPatientsSelectAllPage", "Select all on this page")}
                          checked={allPageSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = somePageSelected && !allPageSelected;
                          }}
                          onChange={togglePageAll}
                        />
                      </th>
                      <th className="px-3 py-2 text-start">{t("patients.mrn", "MRN")}</th>
                      <th className="px-3 py-2 text-start">{t("admin.displayName")}</th>
                      <th className="px-3 py-2 text-start">{t("patients.phone")}</th>
                      <th className="px-3 py-2 text-start">{t("patients.homeBranch")}</th>
                      <th className="px-3 py-2 text-start">{t("patients.dob")}</th>
                      <th className="px-3 py-2 text-end">{t("common.actions", "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                          {t("admin.orgPatientsEmpty", "No patients match your search.")}
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              aria-label={t("admin.orgPatientsSelectRow", "Select patient")}
                              checked={selectAllMatching || selectedIds.has(row.id)}
                              onChange={(e) => toggleRow(row.id, e.target.checked)}
                            />
                          </td>
                          <td className="px-3 py-2 ltr-nums">{row.mrn}</td>
                          <td className="px-3 py-2">{formatPatientEnglishName(row)}</td>
                          <td className="px-3 py-2 ltr-nums">{row.phone}</td>
                          <td className="px-3 py-2">{homeBranchLabel(row)}</td>
                          <td className="px-3 py-2 ltr-nums">{dobInputValue(row.dob)}</td>
                          <td className="px-3 py-2 text-end">
                            <Button type="button" size="sm" variant="outline" onClick={() => setDialogMode({ edit: row.id })}>
                              {t("common.edit", "Edit")}
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </ResponsiveTable>
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={total}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t("admin.orgPatientsEdit", "Edit patient") : t("admin.createPatient", "Create patient")}
            </DialogTitle>
          </DialogHeader>
          {isEdit && patientDetailQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <div className="flex flex-col gap-3 pt-1">
              {formErr ? <p className="text-sm text-destructive">{formErr}</p> : null}
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
                <Label required>{t("patients.dob")}</Label>
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
              <div className="space-y-2">
                <Label required>{t("patients.phone")}</Label>
                <Input className="ltr-nums" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>
                  {t("patients.nationalId")}{" "}
                  <span className="text-xs font-normal text-muted-foreground">({t("common.optional", "optional")})</span>
                </Label>
                <Input className="ltr-nums" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
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
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={homeBranchId}
                  onChange={(e) => setHomeBranchId(e.target.value)}
                >
                  <option value="">{t("patients.noHomeBranch", "None")}</option>
                  {clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatClinicName(c, i18n.language)}
                    </option>
                  ))}
                </select>
              </div>
              <PatientAcquisitionFields values={acquisition} onChange={setAcquisition} />
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  disabled={!canSave || (isCreate ? createMut.isPending : patchMut.isPending)}
                  onClick={() => (isCreate ? createMut.mutate() : patchMut.mutate())}
                >
                  {isEdit ? t("common.save", "Save") : t("admin.createPatient", "Create patient")}
                </Button>
                {isEdit && editPatientId ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deleteMut.isPending}
                    onClick={() => {
                      if (window.confirm(t("admin.orgPatientsDeleteConfirm", "Delete this patient? They will be removed from the registry."))) {
                        deleteMut.mutate(editPatientId);
                      }
                    }}
                  >
                    {t("common.delete", "Delete")}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={closeDialog}>
                  {t("common.cancel", "Cancel")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
