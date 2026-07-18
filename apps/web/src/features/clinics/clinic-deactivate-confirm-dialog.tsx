import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatClinicNameFields } from "@/lib/locale-display";

type ClinicDeactivateTarget = {
  nameEn: string;
  nameAr: string;
  city: string;
  country: string;
};

type ClinicDeactivateConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinic: ClinicDeactivateTarget | null;
  pending?: boolean;
  onConfirm: () => void;
};

export function ClinicDeactivateConfirmDialog({
  open,
  onOpenChange,
  clinic,
  pending = false,
  onConfirm,
}: ClinicDeactivateConfirmDialogProps) {
  const { t, i18n } = useTranslation();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={t("clinics.deactivateConfirmTitle", "Disable clinic?")}
      description={t(
        "clinics.deactivateConfirmIntro",
        "This clinic or branch will be hidden from the active directory. Active branches under a parent are disabled together. You can reactivate it later.",
      )}
      confirmLabel={t("clinics.deactivateConfirmAction", "Disable clinic")}
      cancelLabel={t("common.cancel", "Cancel")}
      pending={pending}
      onConfirm={onConfirm}
      details={
        clinic ? (
          <dl className="space-y-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("clinics.nameColumnEn", "Name")}
              </dt>
              <dd className="font-medium">{formatClinicNameFields(clinic.nameEn, clinic.nameAr, i18n.language)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("clinics.cityColumn", "City")}
              </dt>
              <dd>
                {clinic.city}, {clinic.country}
              </dd>
            </div>
          </dl>
        ) : null
      }
    />
  );
}
