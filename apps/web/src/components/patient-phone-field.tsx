import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PatientPhoneConflictDialog } from "@/components/patient-phone-conflict-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePatientPhoneConflictQuery } from "@/lib/api-hooks";
import {
  MIN_PHONE_DIGITS,
  normalizePhoneDigits,
  patientPhoneConflictName,
  phoneConflictMessage,
  type PatientPhoneConflictPatient,
} from "@/lib/patient-phone-conflict";
import { cn } from "@/lib/utils";

type PatientPhoneFieldProps = {
  value: string;
  onChange: (value: string) => void;
  excludePatientId?: string;
  enabled?: boolean;
  /** Conflict from parent (e.g. API error on submit) when live check has not caught up yet */
  externalConflict?: PatientPhoneConflictPatient | null;
  onConflictChange?: (conflict: PatientPhoneConflictPatient | null) => void;
  /** Booking / create flows: switch to the existing patient instead of creating a duplicate. */
  onUseExisting?: (patient: PatientPhoneConflictPatient) => void;
  useExistingLabel?: string;
  showLabel?: boolean;
  id?: string;
};

export function PatientPhoneField({
  value,
  onChange,
  excludePatientId,
  enabled = true,
  externalConflict = null,
  onConflictChange,
  onUseExisting,
  useExistingLabel,
  showLabel = true,
  id,
}: PatientPhoneFieldProps) {
  const { t, i18n } = useTranslation();
  const debouncedPhone = useDebouncedValue(value.trim(), 400);
  const digits = normalizePhoneDigits(debouncedPhone);
  const { data, isFetching } = usePatientPhoneConflictQuery(debouncedPhone, excludePatientId, {
    enabled: enabled && digits.length >= MIN_PHONE_DIGITS,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPatientId, setDialogPatientId] = useState<string | null>(null);

  const queriedConflict = data?.conflict ? (data.patient ?? null) : null;
  const activeConflict = queriedConflict ?? externalConflict ?? null;

  useEffect(() => {
    onConflictChange?.(queriedConflict);
  }, [queriedConflict, onConflictChange]);

  useEffect(() => {
    if (!activeConflict?.id) {
      setDialogOpen(false);
      setDialogPatientId(null);
      return;
    }
    // Open once per conflicting patient id so typing does not spam the dialog.
    if (dialogPatientId !== activeConflict.id) {
      setDialogPatientId(activeConflict.id);
      setDialogOpen(true);
    }
  }, [activeConflict, dialogPatientId]);

  const showConflict = Boolean(activeConflict);

  return (
    <div className="space-y-2">
      {showLabel ? <Label required>{t("patients.phone")}</Label> : null}
      <Input
        id={id}
        className={cn(
          "ltr-nums",
          showConflict && "border-destructive ring-1 ring-destructive focus-visible:ring-destructive",
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="tel"
        inputMode="tel"
        aria-invalid={showConflict}
        aria-describedby={showConflict ? "patient-phone-conflict" : undefined}
      />
      {showConflict && activeConflict ? (
        <p id="patient-phone-conflict" className="text-sm text-destructive">
          {phoneConflictMessage(activeConflict, t, i18n.language)}{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => setDialogOpen(true)}
          >
            {t("patients.phoneConflictViewDetails", "View details")}
          </button>
        </p>
      ) : isFetching && digits.length >= MIN_PHONE_DIGITS ? (
        <p className="text-xs text-muted-foreground">{t("patients.checkingPhone", "Checking phone number…")}</p>
      ) : null}

      <PatientPhoneConflictDialog
        open={dialogOpen && Boolean(activeConflict)}
        patient={activeConflict}
        onOpenChange={setDialogOpen}
        onUseExisting={onUseExisting}
        useExistingLabel={useExistingLabel}
      />
    </div>
  );
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export { patientPhoneConflictName };
