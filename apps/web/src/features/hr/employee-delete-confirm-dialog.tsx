import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatClinicNameFields, formatEmploymentType, localeForLanguage } from "@/lib/locale-display";

export type EmployeeDeleteTarget = {
  id: string;
  employeeNumber: string;
  firstNameEn: string;
  lastNameEn: string;
  clinicId: string;
  clinicNameEn?: string | null;
  clinicLabel?: string | null;
  jobTitle: string;
  employmentType: string;
  hireDate: string;
  salaryBase?: number | null;
};

type EmployeeDeleteConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeDeleteTarget | null;
  pending?: boolean;
  onConfirm: () => void;
};

export function EmployeeDeleteConfirmDialog({
  open,
  onOpenChange,
  employee,
  pending = false,
  onConfirm,
}: EmployeeDeleteConfirmDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);

  const clinicLabel =
    employee?.clinicLabel ??
    (employee
      ? formatClinicNameFields(employee.clinicNameEn, null, i18n.language, employee.clinicId)
      : null);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={t("hr.deleteConfirmTitle", "Delete employee?")}
      description={t(
        "hr.deleteConfirmIntro",
        "This employee record and related HR history will be permanently removed. This action cannot be undone.",
      )}
      confirmLabel={t("hr.deleteConfirmAction", "Delete employee")}
      cancelLabel={t("common.cancel", "Cancel")}
      pending={pending}
      onConfirm={onConfirm}
      details={
        employee ? (
          <dl className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("hr.name", "Name")}
                </dt>
                <dd className="font-medium text-foreground">
                  {employee.firstNameEn} {employee.lastNameEn}
                </dd>
                <dd className="font-mono text-xs text-muted-foreground ltr-nums">{employee.employeeNumber}</dd>
              </div>
              <Badge variant="secondary">{formatEmploymentType(employee.employmentType, t)}</Badge>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("hr.jobTitle", "Job title")}
              </dt>
              <dd>{employee.jobTitle}</dd>
            </div>
            {clinicLabel ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("hr.clinic", "Clinic")}
                </dt>
                <dd>{clinicLabel}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("hr.hireDate", "Hire date")}
              </dt>
              <dd className="ltr-nums">{employee.hireDate}</dd>
            </div>
            {employee.salaryBase != null ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("hr.salaryBase", "Salary base (AED)")}
                </dt>
                <dd className="ltr-nums">
                  {new Intl.NumberFormat(locale, { style: "currency", currency: "AED" }).format(employee.salaryBase)}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null
      }
    />
  );
}
