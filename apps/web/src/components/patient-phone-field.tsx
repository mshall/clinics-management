import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
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
};

export function PatientPhoneField({
  value,
  onChange,
  excludePatientId,
  enabled = true,
  externalConflict = null,
  onConflictChange,
}: PatientPhoneFieldProps) {
  const { t, i18n } = useTranslation();
  const debouncedPhone = useDebouncedValue(value.trim(), 400);
  const digits = normalizePhoneDigits(debouncedPhone);
  const { data, isFetching } = usePatientPhoneConflictQuery(debouncedPhone, excludePatientId, {
    enabled: enabled && digits.length >= MIN_PHONE_DIGITS,
  });

  const queriedConflict = data?.conflict ? (data.patient ?? null) : null;
  const activeConflict = queriedConflict ?? externalConflict ?? null;

  useEffect(() => {
    onConflictChange?.(queriedConflict);
  }, [queriedConflict, onConflictChange]);

  const showConflict = Boolean(activeConflict);

  return (
    <div className="space-y-2">
      <Label required>{t("patients.phone")}</Label>
      <Input
        className={cn(
          "ltr-nums",
          showConflict && "border-destructive ring-1 ring-destructive focus-visible:ring-destructive",
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={showConflict}
        aria-describedby={showConflict ? "patient-phone-conflict" : undefined}
      />
      {showConflict && activeConflict ? (
        <p id="patient-phone-conflict" className="text-sm text-destructive">
          {phoneConflictMessage(activeConflict, t, i18n.language)}{" "}
          <Link to={`/patients/${activeConflict.id}`} className="font-medium underline underline-offset-2">
            {t("patients.viewExistingPatient", "View patient")}
          </Link>
        </p>
      ) : isFetching && digits.length >= MIN_PHONE_DIGITS ? (
        <p className="text-xs text-muted-foreground">{t("patients.checkingPhone", "Checking phone number…")}</p>
      ) : null}
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
