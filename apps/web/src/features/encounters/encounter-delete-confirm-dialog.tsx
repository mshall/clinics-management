import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatClinicNameFields, formatEncounterStatus, localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { formatVisitType } from "@/lib/visit-types";

export type EncounterDeleteTarget = {
  id: string;
  patientName?: string | null;
  patientMrn?: string | null;
  status: string;
  visitType: string;
  clinicId: string;
  clinicNameEn?: string | null;
  clinicNameAr?: string | null;
  clinicLabel?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  visitFeeAmount?: number | null;
  visitFeeCurrency?: string;
};

type EncounterDeleteConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounter: EncounterDeleteTarget | null;
  pending?: boolean;
  onConfirm: () => void;
};

export function EncounterDeleteConfirmDialog({
  open,
  onOpenChange,
  encounter,
  pending = false,
  onConfirm,
}: EncounterDeleteConfirmDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);

  const patientLabel =
    encounter?.patientName?.trim() ||
    (encounter?.patientMrn ? encounter.patientMrn : t("encounters.patient", "Patient"));

  const clinicLabel =
    encounter?.clinicLabel ??
    (encounter
      ? formatClinicNameFields(
          encounter.clinicNameEn,
          encounter.clinicNameAr,
          i18n.language,
          encounter.clinicId,
        )
      : null);

  const whenLabel = encounter
    ? new Date(encounter.updatedAt ?? encounter.createdAt).toLocaleString(locale)
    : null;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={t("encounters.deleteConfirmTitle", "Delete encounter?")}
      description={t(
        "encounters.deleteConfirmIntro",
        "This visit record and its clinical data will be permanently removed. This action cannot be undone.",
      )}
      confirmLabel={t("encounters.deleteConfirmAction", "Delete encounter")}
      cancelLabel={t("common.cancel", "Cancel")}
      pending={pending}
      onConfirm={onConfirm}
      details={
        encounter ? (
          <dl className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("encounters.patient", "Patient")}
                </dt>
                <dd className="font-medium text-foreground">{patientLabel}</dd>
                {encounter.patientMrn ? (
                  <dd className="text-xs text-muted-foreground ltr-nums">{encounter.patientMrn}</dd>
                ) : null}
              </div>
              <Badge variant={encounter.status === "FINALIZED" ? "default" : "secondary"}>
                {formatEncounterStatus(encounter.status, t)}
              </Badge>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("encounters.visitType", "Visit type")}
              </dt>
              <dd>{formatVisitType(encounter.visitType, t)}</dd>
            </div>
            {whenLabel ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("encounters.updated", "Updated")}
                </dt>
                <dd className="ltr-nums text-foreground">{whenLabel}</dd>
              </div>
            ) : null}
            {clinicLabel ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("encounters.clinic", "Clinic")}
                </dt>
                <dd>{clinicLabel}</dd>
              </div>
            ) : null}
            {encounter.visitFeeAmount != null && encounter.visitFeeAmount > 0 ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("encounters.visitFee", "Visit fee")}
                </dt>
                <dd className="ltr-nums">
                  {formatMoneyAmount(
                    encounter.visitFeeAmount,
                    encounter.visitFeeCurrency ?? "AED",
                    locale,
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null
      }
    />
  );
}
