import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserCircle, UserCheck, UserX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { isClinicRequiredUserRole, isOrgWideUserRole } from "@/features/platform/platform-shared";
import { EmployeeDeleteConfirmDialog } from "@/features/hr/employee-delete-confirm-dialog";
import { EmployeeDeactivateConfirmDialog } from "@/features/hr/employee-deactivate-confirm-dialog";
import { EmployeeReactivateDialog } from "@/features/hr/employee-reactivate-dialog";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import { collectEmployeeCreateIssues } from "@/lib/create-form-validation";
import { useClinicsQuery, useEmployeeQuery } from "@/lib/api-hooks";
import type { EmployeeDto } from "@/lib/api-types";
import { canManageEmployees } from "@/lib/employee-manage-policy";
import { ApiError, apiDelete, apiFetchBlob, apiPatch, apiPost, apiPostFormData } from "@/lib/http";
import { formatClinicName, formatClinicNameFields, formatEmploymentType, formatUserRole, localeForLanguage } from "@/lib/locale-display";
import { formatEmployeeName } from "@/lib/employee-display";
import { useAuthStore } from "@/stores/auth-store";

const EMP_TYPE_VALUES = ["FULL_TIME", "PART_TIME", "CONTRACTOR", "LOCUM"] as const;

export function EmployeeDetailPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const canManage = canManageEmployees(authUser?.role);
  const { id } = useParams();
  const { data: emp, isPending, isError, error } = useEmployeeQuery(id);
  const { data: clinics = [] } = useClinicsQuery();

  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [clinicId, setClinicId] = useState("");
  const [assignedClinicIds, setAssignedClinicIds] = useState<string[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstNameAr, setFirstNameAr] = useState("");
  const [lastNameAr, setLastNameAr] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [employmentType, setEmploymentType] = useState("FULL_TIME");
  const [hireDate, setHireDate] = useState("");
  const [salaryBase, setSalaryBase] = useState("");
  const [idDocFile, setIdDocFile] = useState<File | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const validation = useValidationIssuesDialog({ intent: "save" });

  useEffect(() => {
    if (!emp) return;
    setClinicId(emp.clinicId);
    setAssignedClinicIds(emp.linkedUserClinicIds ?? [emp.clinicId]);
    setFirstName(emp.firstNameEn);
    setLastName(emp.lastNameEn);
    setFirstNameAr(emp.firstNameAr ?? "");
    setLastNameAr(emp.lastNameAr ?? "");
    setEmail(emp.email ?? "");
    setPhone(emp.phone);
    setJobTitle(emp.jobTitle);
    setEmploymentType(emp.employmentType);
    setHireDate(emp.hireDate);
    setSalaryBase(String(emp.salaryBase));
  }, [emp]);

  const clinicItems: PickListItem[] = useMemo(
    () => clinics.map((c) => ({ value: c.id, label: formatClinicName(c, i18n.language) })),
    [clinics, i18n.language],
  );
  const empTypeItems: PickListItem[] = useMemo(
    () => EMP_TYPE_VALUES.map((value) => ({ value, label: formatEmploymentType(value, t) })),
    [t],
  );

  const linkedUserRole = emp?.linkedUserRole ?? "";
  const showClinicAssignment = Boolean(linkedUserRole) && !isOrgWideUserRole(linkedUserRole);
  const requiresClinicAssignment = isClinicRequiredUserRole(linkedUserRole);
  const assignedClinicLabels = useMemo(() => {
    const ids = emp?.linkedUserClinicIds ?? (emp?.clinicId ? [emp.clinicId] : []);
    return ids
      .map((id) => clinics.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => formatClinicName(c!, i18n.language));
  }, [emp?.linkedUserClinicIds, emp?.clinicId, clinics, i18n.language]);

  const money = (n: number) =>
    new Intl.NumberFormat(localeForLanguage(i18n.language), { style: "currency", currency: "AED" }).format(n);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing employee id");
      const primaryClinicId = showClinicAssignment ? (assignedClinicIds[0] ?? clinicId) : clinicId;
      const updated = await apiPatch<EmployeeDto>(`/api/v1/hr/employees/${id}`, {
        ...(showClinicAssignment
          ? { clinicIds: assignedClinicIds }
          : { clinicId: primaryClinicId }),
        firstNameEn: firstName.trim(),
        lastNameEn: lastName.trim(),
        firstNameAr: firstNameAr.trim() || undefined,
        lastNameAr: lastNameAr.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.replace(/\D/g, ""),
        employmentType,
        hireDate,
        salaryBase: Number.parseFloat(salaryBase),
      });
      if (idDocFile) {
        const fd = new FormData();
        fd.append("file", idDocFile);
        return apiPostFormData<EmployeeDto>(`/api/v1/hr/employees/${id}/id-document`, fd);
      }
      return updated;
    },
    onSuccess: () => {
      setFormErr(null);
      setEditing(false);
      setIdDocFile(null);
      void qc.invalidateQueries({ queryKey: ["hr", "employees"] });
      void qc.invalidateQueries({ queryKey: ["employee", id] });
      void qc.invalidateQueries({ queryKey: ["hr"] });
      toast.success(t("hr.employeeUpdated", "Employee updated."));
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body
          ? String((e.body as { message?: unknown }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      setFormErr(msg);
      validation.showError(e);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => apiDelete(`/api/v1/hr/employees/${id}`),
    onSuccess: () => {
      setDeleteOpen(false);
      void qc.invalidateQueries({ queryKey: ["hr"] });
      void qc.invalidateQueries({ queryKey: ["admin", "org-users"] });
      toast.success(t("hr.deleteSuccess", "Employee deleted."));
      navigate("/hr");
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

  const deactivateMut = useMutation({
    mutationFn: (resignationDate: string) =>
      apiPost<EmployeeDto>(`/api/v1/hr/employees/${id}/deactivate`, { resignationDate }),
    onSuccess: () => {
      setDeactivateOpen(false);
      void qc.invalidateQueries({ queryKey: ["hr"] });
      toast.success(t("hr.deactivateSuccess", "Employee deactivated."));
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

  const reactivateMut = useMutation({
    mutationFn: (startDate: string) =>
      apiPost<EmployeeDto>(`/api/v1/hr/employees/${id}/reactivate`, { startDate }),
    onSuccess: () => {
      setReactivateOpen(false);
      void qc.invalidateQueries({ queryKey: ["hr"] });
      toast.success(t("hr.reactivateSuccess", "Employee reactivated."));
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

  const handleSaveEmployee = () => {
    if (saveMut.isPending || !emp) return;
    const employee = emp;
    const primaryClinicId = showClinicAssignment ? (assignedClinicIds[0] ?? "") : clinicId;
    const issues = collectEmployeeCreateIssues(
      {
        userId: employee.userId ?? "",
        linkedUserRole,
        clinicId: primaryClinicId,
        assignedClinicIds,
        firstName,
        lastName,
        phone,
        salary: salaryBase,
        requireLinkedUser: Boolean(employee.userId),
      },
      t,
    );
    if (issues.length > 0) {
      validation.showIssues(issues);
      return;
    }
    saveMut.mutate();
  };

  if (isPending) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }

  if (isError || !emp) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error instanceof Error ? error.message : t("common.error")}</p>
        <Button variant="outline" asChild>
          <Link to="/hr?tab=employees">{t("hr.backToEmployees", "Back to employees")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EmployeeDeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        employee={{
          id: emp.id,
          employeeNumber: emp.employeeNumber,
          firstNameEn: emp.firstNameEn,
          lastNameEn: emp.lastNameEn,
          firstNameAr: emp.firstNameAr,
          lastNameAr: emp.lastNameAr,
          clinicId: emp.clinicId,
          clinicNameEn: emp.clinicNameEn,
          jobTitle: emp.jobTitle,
          employmentType: emp.employmentType,
          hireDate: emp.hireDate,
          salaryBase: emp.salaryBase,
        }}
        pending={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
      />

      <EmployeeDeactivateConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        employee={{
          id: emp.id,
          employeeNumber: emp.employeeNumber,
          firstNameEn: emp.firstNameEn,
          lastNameEn: emp.lastNameEn,
          firstNameAr: emp.firstNameAr,
          lastNameAr: emp.lastNameAr,
          clinicId: emp.clinicId,
          clinicNameEn: emp.clinicNameEn,
          jobTitle: emp.jobTitle,
          employmentType: emp.employmentType,
          hireDate: emp.hireDate,
          salaryBase: emp.salaryBase,
        }}
        pending={deactivateMut.isPending}
        onConfirm={(resignationDate) => deactivateMut.mutate(resignationDate)}
      />

      <EmployeeReactivateDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        employee={{
          employeeNumber: emp.employeeNumber,
          firstNameEn: emp.firstNameEn,
          lastNameEn: emp.lastNameEn,
          firstNameAr: emp.firstNameAr,
          lastNameAr: emp.lastNameAr,
          resignationDate: emp.resignationDate,
        }}
        pending={reactivateMut.isPending}
        onConfirm={(startDate) => reactivateMut.mutate(startDate)}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" className="mb-2 h-auto px-0 text-muted-foreground" asChild>
            <Link to="/hr?tab=employees">← {t("hr.backToEmployees", "Back to employees")}</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {formatEmployeeName(emp, i18n.language)}
            </h1>
            <Badge variant={emp.recordStatus === "INACTIVE" ? "outline" : "secondary"}>
              {t(`hr.recordStatuses.${emp.recordStatus}`, emp.recordStatus)}
            </Badge>
          </div>
          <p className="text-muted-foreground font-mono text-sm ltr-nums">{emp.employeeNumber}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to={`/hr/employees/${emp.id}/profile`}>
              <UserCircle className="me-2 h-4 w-4" />
              {t("hr.viewEmployeeProfile", "Employee profile")}
            </Link>
          </Button>
          {canManage ? (
            <>
              {emp.recordStatus === "INACTIVE" ? (
                <Button
                  type="button"
                  variant="default"
                  disabled={reactivateMut.isPending}
                  onClick={() => setReactivateOpen(true)}
                >
                  <UserCheck className="me-2 h-4 w-4" />
                  {t("hr.reactivate", "Reactivate")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={deactivateMut.isPending}
                  onClick={() => setDeactivateOpen(true)}
                >
                  <UserX className="me-2 h-4 w-4" />
                  {t("hr.deactivate", "Deactivate")}
                </Button>
              )}
              {emp.recordStatus === "ACTIVE" ? (
                <Button type="button" variant="outline" onClick={() => setEditing((v) => !v)}>
                  {editing ? t("common.cancel", "Cancel") : t("common.edit", "Edit")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={deleteMut.isPending}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="me-2 h-4 w-4" />
                {t("common.delete", "Delete")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("hr.employmentTimeline", "Employment timeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          {emp.employmentPeriods.length ? (
            <ul className="space-y-3">
              {emp.employmentPeriods.map((period) => (
                <li
                  key={period.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="ltr-nums font-medium">
                    {period.startDate} → {period.endDate ?? t("hr.employmentPeriodPresent", "Present")}
                  </span>
                  {period.separationReason ? (
                    <Badge variant="outline">
                      {t(`hr.separationReasons.${period.separationReason}`, period.separationReason)}
                    </Badge>
                  ) : period.endDate ? null : (
                    <Badge variant="secondary">{t("hr.recordStatuses.ACTIVE", "Active")}</Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground ltr-nums">
              {emp.hireDate} → {emp.recordStatus === "ACTIVE" ? t("hr.employmentPeriodPresent", "Present") : emp.resignationDate ?? "—"}
            </p>
          )}
          {emp.recordStatus === "INACTIVE" && emp.resignationDate ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("hr.resignationDate", "Resignation date")}: <span className="ltr-nums">{emp.resignationDate}</span>
              {emp.separationReason ? (
                <>
                  {" "}
                  · {t("hr.separationReason", "Separation reason")}:{" "}
                  {t(`hr.separationReasons.${emp.separationReason}`, emp.separationReason)}
                </>
              ) : null}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editing ? t("hr.editEmployee", "Edit employee") : t("hr.employeeDetails", "Employee details")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {editing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {formErr ? <p className="text-sm text-destructive sm:col-span-full">{formErr}</p> : null}
              <div className="space-y-2 sm:col-span-2">
                {showClinicAssignment ? (
                  <>
                    <Label required={requiresClinicAssignment}>
                      {t("admin.assignedClinics", "Assigned clinics")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "hr.assignedClinicsOptionalHint",
                        "Select one or more clinics for this employee, same as organization admin user setup.",
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {clinics.map((c) => {
                        const on = assignedClinicIds.includes(c.id);
                        return (
                          <Button
                            key={c.id}
                            type="button"
                            size="sm"
                            variant={on ? "default" : "outline"}
                            onClick={() => {
                              setAssignedClinicIds((ids) => {
                                const next = on ? ids.filter((x) => x !== c.id) : [...ids, c.id];
                                setClinicId(next[0] ?? "");
                                return next;
                              });
                            }}
                          >
                            {formatClinicName(c, i18n.language)}
                          </Button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <Label required>{t("hr.clinic")}</Label>
                    <SearchablePickList
                      items={clinicItems}
                      value={clinicId}
                      onValueChange={setClinicId}
                      searchPlaceholder={t("appointments.filterClinic", "Type clinic name…")}
                      placeholder={t("hr.pickClinic")}
                    />
                  </>
                )}
              </div>
              <div className="space-y-2">
                <Label required>{t("patients.firstNameEn")}</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label required>{t("patients.lastNameEn")}</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.firstNameAr")}</Label>
                <Input value={firstNameAr} onChange={(e) => setFirstNameAr(e.target.value)} dir="auto" />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.lastNameAr")}</Label>
                <Input value={lastNameAr} onChange={(e) => setLastNameAr(e.target.value)} dir="auto" />
              </div>
              <div className="space-y-2">
                <Label>{t("hr.email")}</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label required>{t("hr.phone")}</Label>
                <Input
                  className="ltr-nums"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 20))}
                />
              </div>
              {emp.linkedUserRole ? (
                <div className="space-y-2">
                  <Label>{t("admin.role", "Role")}</Label>
                  <Input value={formatUserRole(emp.linkedUserRole, t)} readOnly />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>{t("hr.jobTitle")}</Label>
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label>{t("hr.employmentType")}</Label>
                <SearchablePickList
                  items={empTypeItems}
                  value={employmentType}
                  onValueChange={setEmploymentType}
                  searchPlaceholder={t("hr.filterEmpType")}
                  placeholder={t("hr.employmentType")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("hr.hireDate")}</Label>
                <Input className="ltr-nums" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("hr.salaryBase")}</Label>
                <Input className="ltr-nums" type="number" value={salaryBase} onChange={(e) => setSalaryBase(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("hr.replaceIdDocument", "Replace ID / passport")}</Label>
                <Input
                  className="cursor-pointer text-sm"
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setIdDocFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button
                  type="button"
                  disabled={saveMut.isPending}
                  onClick={handleSaveEmployee}
                >
                  {t("common.save", "Save")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {showClinicAssignment && assignedClinicLabels.length > 1 ? (
                <Row
                  label={t("admin.assignedClinics", "Assigned clinics")}
                  value={assignedClinicLabels.join(", ")}
                />
              ) : (
                <Row label={t("hr.clinic")} value={formatClinicNameFields(emp.clinicNameEn, null, i18n.language)} />
              )}
              <Separator />
              {emp.linkedUserRole ? (
                <>
                  <Row label={t("admin.role", "Role")} value={formatUserRole(emp.linkedUserRole, t)} />
                  <Separator />
                </>
              ) : null}
              <Row label={t("hr.email")} value={emp.email ?? "—"} />
              <Separator />
              <Row label={t("hr.phone")} value={<span className="ltr-nums">{emp.phone}</span>} />
              <Separator />
              {!emp.linkedUserRole ? (
                <>
                  <Row label={t("hr.jobTitle")} value={emp.jobTitle} />
                  <Separator />
                </>
              ) : null}
              <Row
                label={t("hr.employmentType")}
                value={<Badge variant="secondary">{formatEmploymentType(emp.employmentType, t)}</Badge>}
              />
              <Separator />
              <Row label={t("hr.hireDate")} value={<span className="ltr-nums">{emp.hireDate}</span>} />
              <Separator />
              <Row label={t("hr.salaryBase")} value={<span className="ltr-nums">{money(emp.salaryBase)}</span>} />
              {emp.hasIdDoc ? (
                <>
                  <Separator />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">{t("hr.idDocument")}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={async () => {
                        const { blob } = await apiFetchBlob(`/api/v1/hr/employees/${emp.id}/id-document`);
                        const url = URL.createObjectURL(blob);
                        window.open(url, "_blank", "noopener,noreferrer");
                        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                      }}
                    >
                      {t("hr.downloadIdDoc")}
                    </Button>
                  </div>
                </>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
      <ValidationIssuesDialog {...validation.dialogProps} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end font-medium">{value}</span>
    </div>
  );
}
