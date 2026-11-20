import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatGender } from "@/lib/locale-display";
import {
  patientPhoneConflictName,
  type PatientPhoneConflictPatient,
} from "@/lib/patient-phone-conflict";

type PatientPhoneConflictDialogProps = {
  open: boolean;
  patient: PatientPhoneConflictPatient | null;
  onOpenChange: (open: boolean) => void;
  /** When set, shows a primary action to book/use the existing chart instead of creating a new one. */
  onUseExisting?: (patient: PatientPhoneConflictPatient) => void;
  useExistingLabel?: string;
};

export function PatientPhoneConflictDialog({
  open,
  patient,
  onOpenChange,
  onUseExisting,
  useExistingLabel,
}: PatientPhoneConflictDialogProps) {
  const { t, i18n } = useTranslation();
  if (!patient) return null;

  const name = patientPhoneConflictName(patient, i18n.language);
  const altName =
    i18n.language === "ar"
      ? `${patient.firstNameEn} ${patient.lastNameEn}`.trim()
      : patient.firstNameAr
        ? `${patient.firstNameAr} ${patient.lastNameAr ?? ""}`.trim()
        : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="patient-phone-conflict-dialog">
        <DialogHeader>
          <DialogTitle>
            {t("patients.phoneConflictTitle", "Phone number already registered")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "patients.phoneConflictDescription",
              "A patient in this organization already uses this phone number. You cannot create another patient with the same phone. Use the existing chart or enter a different number.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="text-base font-semibold text-foreground">{name}</p>
          {altName ? <p className="text-muted-foreground">{altName}</p> : null}
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-muted-foreground">{t("patients.mrn", "MRN")}</dt>
            <dd className="font-medium ltr-nums">{patient.mrn}</dd>
            {patient.phone ? (
              <>
                <dt className="text-muted-foreground">{t("patients.phone")}</dt>
                <dd className="font-medium ltr-nums">{patient.phone}</dd>
              </>
            ) : null}
            {patient.gender ? (
              <>
                <dt className="text-muted-foreground">{t("patients.gender", "Gender")}</dt>
                <dd>{formatGender(patient.gender, t)}</dd>
              </>
            ) : null}
            {patient.dob ? (
              <>
                <dt className="text-muted-foreground">{t("patients.dob", "Date of birth")}</dt>
                <dd className="ltr-nums">{patient.dob}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">{t("patients.profileStatus", "Profile")}</dt>
            <dd>
              {patient.profileComplete === false
                ? t("patients.profileIncompleteBadge", "Incomplete — finish before check-in")
                : t("patients.profileCompleteBadge", "Complete")}
            </dd>
          </dl>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("patients.phoneConflictChangeNumber", "Change phone number")}
          </Button>
          <Button type="button" variant="secondary" asChild>
            <Link to={`/patients/${patient.id}`} onClick={() => onOpenChange(false)}>
              {t("patients.viewExistingPatient", "View patient")}
            </Link>
          </Button>
          {onUseExisting ? (
            <Button
              type="button"
              onClick={() => {
                onUseExisting(patient);
                onOpenChange(false);
              }}
            >
              {useExistingLabel ??
                t("patients.phoneConflictUseExisting", "Use this patient")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
