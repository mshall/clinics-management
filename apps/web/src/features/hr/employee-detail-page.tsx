import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserCircle } from "lucide-react";
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
import { EmployeeDeleteConfirmDialog } from "@/features/hr/employee-delete-confirm-dialog";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import { collectEmployeeCreateIssues } from "@/lib/create-form-validation";
import { useClinicsQuery, useEmployeeQuery } from "@/lib/api-hooks";
import type { EmployeeDto } from "@/lib/api-types";
import { canManageEmployees } from "@/lib/employee-manage-policy";
import { ApiError, apiDelete, apiFetchBlob, apiPatch, apiPostFormData } from "@/lib/http";
import { formatClinicName, formatClinicNameFields, formatEmploymentType, localeForLanguage } from "@/lib/locale-display";
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
  const [clinicId, setClinicId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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
    setFirstName(emp.firstNameEn);
    setLastName(emp.lastNameEn);
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

  const money = (n: number) =>
    new Intl.NumberFormat(localeForLanguage(i18n.language), { style: "currency", currency: "AED" }).format(n);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing employee id");
      const updated = await apiPatch<EmployeeDto>(`/api/v1/hr/employees/${id}`, {
        clinicId,
        firstNameEn: firstName.trim(),
        lastNameEn: lastName.trim(),
        email: email.trim() || undefined,
        phone: phone.replace(/\D/g, ""),
        jobTitle: jobTitle.trim(),
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

  const handleSaveEmployee = () => {
    if (saveMut.isPending) return;
    const issues = collectEmployeeCreateIssues(
      { clinicId, firstName, lastName, phone, salary: salaryBase },
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" className="mb-2 h-auto px-0 text-muted-foreground" asChild>
            <Link to="/hr?tab=employees">← {t("hr.backToEmployees", "Back to employees")}</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {emp.firstNameEn} {emp.lastNameEn}
          </h1>
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
            <Button type="button" variant="outline" onClick={() => setEditing((v) => !v)}>
              {editing ? t("common.cancel", "Cancel") : t("common.edit", "Edit")}
            </Button>
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
          <CardTitle className="text-base">
            {editing ? t("hr.editEmployee", "Edit employee") : t("hr.employeeDetails", "Employee details")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {editing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {formErr ? <p className="text-sm text-destructive sm:col-span-full">{formErr}</p> : null}
              <div className="space-y-2 sm:col-span-2">
                <Label required>{t("hr.clinic")}</Label>
                <SearchablePickList
                  items={clinicItems}
                  value={clinicId}
                  onValueChange={setClinicId}
                  searchPlaceholder={t("appointments.filterClinic", "Type clinic name…")}
                  placeholder={t("hr.pickClinic")}
                />
              </div>
              <div className="space-y-2">
                <Label required>{t("hr.firstName")}</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label required>{t("hr.lastName")}</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
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
              <div className="space-y-2">
                <Label>{t("hr.jobTitle")}</Label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </div>
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
              <Row label={t("hr.clinic")} value={formatClinicNameFields(emp.clinicNameEn, null, i18n.language)} />
              <Separator />
              <Row label={t("hr.email")} value={emp.email ?? "—"} />
              <Separator />
              <Row label={t("hr.phone")} value={<span className="ltr-nums">{emp.phone}</span>} />
              <Separator />
              <Row label={t("hr.jobTitle")} value={emp.jobTitle} />
              <Separator />
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
