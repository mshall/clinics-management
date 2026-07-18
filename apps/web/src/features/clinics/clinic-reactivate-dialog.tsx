import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatClinicNameFields } from "@/lib/locale-display";

type ClinicReactivateTarget = {
  nameEn: string;
  nameAr: string;
  disabledAt?: string | null;
};

type ClinicReactivateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinic: ClinicReactivateTarget | null;
  pending?: boolean;
  onConfirm: (startDate: string) => void;
};

export function ClinicReactivateDialog({
  open,
  onOpenChange,
  clinic,
  pending = false,
  onConfirm,
}: ClinicReactivateDialogProps) {
  const { t, i18n } = useTranslation();
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (open) setStartDate(new Date().toISOString().slice(0, 10));
  }, [open]);

  const canConfirm = Boolean(startDate.trim());

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={t("clinics.reactivateConfirmTitle", "Reactivate clinic?")}
      description={t(
        "clinics.reactivateConfirmIntro",
        "A new operating period will start on the date you choose. Previous periods remain in the operating history.",
      )}
      confirmLabel={t("clinics.reactivateConfirmAction", "Reactivate clinic")}
      cancelLabel={t("common.cancel", "Cancel")}
      pending={pending}
      confirmDisabled={!canConfirm}
      onConfirm={() => {
        if (canConfirm) onConfirm(startDate);
      }}
      details={
        clinic ? (
          <div className="space-y-4">
            <dl className="space-y-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("clinics.nameColumnEn", "Name")}
                </dt>
                <dd className="font-medium">{formatClinicNameFields(clinic.nameEn, clinic.nameAr, i18n.language)}</dd>
              </div>
            </dl>
            <div className="space-y-2">
              <Label htmlFor="clinic-reactivate-date">{t("clinics.reactivateStartDate", "Operating start date")}</Label>
              <Input
                id="clinic-reactivate-date"
                className="ltr-nums"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
        ) : null
      }
    />
  );
}
