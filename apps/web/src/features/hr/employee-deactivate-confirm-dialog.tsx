import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatClinicNameFields, formatEmploymentType, localeForLanguage } from "@/lib/locale-display";
import { formatEmployeeName } from "@/lib/employee-display";
import type { EmployeeDeleteTarget } from "@/features/hr/employee-delete-confirm-dialog";

type EmployeeDeactivateConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeDeleteTarget | null;
  pending?: boolean;
  onConfirm: (resignationDate: string) => void;
};

export function EmployeeDeactivateConfirmDialog({
  open,
  onOpenChange,
  employee,
  pending = false,
  onConfirm,
}: EmployeeDeactivateConfirmDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const [resignationDate, setResignationDate] = useState("");

  useEffect(() => {
    if (open) {
      setResignationDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, employee?.id]);

  const clinicLabel =
    employee?.clinicLabel ??
    (employee
      ? formatClinicNameFields(employee.clinicNameEn, null, i18n.language, employee.clinicId)
      : null);

  const canConfirm = Boolean(resignationDate.trim());

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={t("hr.deactivateConfirmTitle", "Deactivate employee?")}
      description={t(
        "hr.deactivateConfirmIntro",
        "The employee will be marked inactive with a resignation date. Their login account (if linked) is kept. You can reactivate them later to start a new employment period.",
      )}
      confirmLabel={t("hr.deactivateConfirmAction", "Deactivate employee")}
      cancelLabel={t("common.cancel", "Cancel")}
      pending={pending}
      confirmDisabled={!canConfirm}
      variant="default"
      onConfirm={() => {
        if (canConfirm) onConfirm(resignationDate);
      }}
      details={
        employee ? (
          <div className="space-y-4">
            <dl className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("hr.name", "Name")}
                  </dt>
                  <dd className="font-medium text-foreground">
                    {formatEmployeeName(employee, i18n.language)}
                  </dd>
                  <dd className="font-mono text-xs text-muted-foreground ltr-nums">{employee.employeeNumber}</dd>
                </div>
                <Badge variant="secondary">{formatEmploymentType(employee.employmentType, t)}</Badge>
              </div>
              {clinicLabel ? (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("hr.clinic", "Clinic")}
                  </dt>
                  <dd>{clinicLabel}</dd>
                </div>
              ) : null}
            </dl>
            <div className="space-y-2">
              <Label required>{t("hr.separationReason", "Separation reason")}</Label>
              <Input value={t("hr.separationReasons.RESIGNATION", "Resignation")} readOnly />
            </div>
            <div className="space-y-2">
              <Label required>{t("hr.resignationDate", "Resignation date")}</Label>
              <Input
                className="ltr-nums"
                type="date"
                value={resignationDate}
                min={employee.hireDate}
                onChange={(e) => setResignationDate(e.target.value)}
              />
            </div>
            {employee.salaryBase != null ? (
              <p className="text-xs text-muted-foreground">
                {t("hr.salaryBase", "Salary base (AED)")}:{" "}
                <span className="ltr-nums">
                  {new Intl.NumberFormat(locale, { style: "currency", currency: "AED" }).format(employee.salaryBase)}
                </span>
              </p>
            ) : null}
          </div>
        ) : null
      }
    />
  );
}
