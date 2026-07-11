import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEmployeeName } from "@/lib/employee-display";

type EmployeeReactivateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: {
    firstNameEn: string;
    lastNameEn: string;
    firstNameAr?: string | null;
    lastNameAr?: string | null;
    employeeNumber: string;
    resignationDate?: string | null;
  } | null;
  pending?: boolean;
  onConfirm: (startDate: string) => void;
};

export function EmployeeReactivateDialog({
  open,
  onOpenChange,
  employee,
  pending = false,
  onConfirm,
}: EmployeeReactivateDialogProps) {
  const { t, i18n } = useTranslation();
  const [startDate, setStartDate] = useState("");

  useEffect(() => {
    if (open) {
      setStartDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, employee?.employeeNumber]);

  const minDate = employee?.resignationDate
    ? new Date(`${employee.resignationDate}T12:00:00`)
    : null;
  if (minDate) minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate ? minDate.toISOString().slice(0, 10) : undefined;

  const canConfirm = Boolean(startDate.trim());

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={t("hr.rehireConfirmTitle", "Re-hire employee?")}
      description={t(
        "hr.rehireConfirmIntro",
        "Record a new employment period starting on the re-hire date. Previous periods stay in the employment timeline.",
      )}
      confirmLabel={t("hr.rehireConfirmAction", "Re-hire employee")}
      cancelLabel={t("common.cancel", "Cancel")}
      pending={pending}
      confirmDisabled={!canConfirm}
      variant="default"
      onConfirm={() => {
        if (canConfirm) onConfirm(startDate);
      }}
      details={
        employee ? (
          <div className="space-y-4">
            <p className="font-medium">{formatEmployeeName(employee, i18n.language)}</p>
            <p className="font-mono text-xs text-muted-foreground ltr-nums">{employee.employeeNumber}</p>
            <div className="space-y-2">
              <Label required>{t("hr.rehireDate", "Re-hire date")}</Label>
              <Input
                className="ltr-nums"
                type="date"
                value={startDate}
                min={minDateStr}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
        ) : null
      }
    />
  );
}
