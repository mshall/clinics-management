import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PATIENT_ACQUISITION_CHANNELS,
  patientAcquisitionLabel,
  type PatientAcquisitionChannel,
} from "@/lib/patient-acquisition";
import { type PatientAcquisitionFormValues } from "@/components/patient-acquisition-form";

type PatientAcquisitionFieldsProps = {
  values: PatientAcquisitionFormValues;
  onChange: (values: PatientAcquisitionFormValues) => void;
  className?: string;
  /** When true, channel selection is required (e.g. operation booking). */
  required?: boolean;
};

export function PatientAcquisitionFields({ values, onChange, className, required }: PatientAcquisitionFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className={className}>
      <div className="space-y-2">
        <Label required={required}>{t("patients.howDidTheyFindUs", "How did they find us?")}</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={values.channel}
          onChange={(e) => {
            const v = e.target.value as PatientAcquisitionChannel | "";
            onChange({
              channel: v,
              referralName:
                v === "DOCTOR_REFERRAL" || v === "ANOTHER_PATIENT" ? values.referralName : "",
              otherDetail: v === "OTHER" ? values.otherDetail : "",
            });
          }}
        >
          <option value="">
            {required
              ? t("operations.acquisitionSelect", "Select an option…")
              : t("patients.cameThroughOptional", "Optional")}
          </option>
          {PATIENT_ACQUISITION_CHANNELS.map((ch) => (
            <option key={ch} value={ch}>
              {patientAcquisitionLabel(ch, t)}
            </option>
          ))}
        </select>
      </div>
      {values.channel === "DOCTOR_REFERRAL" || values.channel === "ANOTHER_PATIENT" ? (
        <div className="mt-3 space-y-2">
          <Label required>{t("patients.explainMore", "Explain more")}</Label>
          <Input
            value={values.referralName}
            onChange={(e) => onChange({ ...values, referralName: e.target.value })}
            placeholder={
              values.channel === "ANOTHER_PATIENT"
                ? t("patients.anotherPatientPh", "Name of the patient who referred them…")
                : t("patients.explainMorePh", "Add details…")
            }
          />
        </div>
      ) : null}
      {values.channel === "OTHER" ? (
        <div className="mt-3 space-y-2">
          <Label required>{t("patients.explainMore", "Explain more")}</Label>
          <Input
            value={values.otherDetail}
            onChange={(e) => onChange({ ...values, otherDetail: e.target.value })}
            placeholder={t("patients.explainMorePh", "Add details…")}
          />
        </div>
      ) : null}
    </div>
  );
}
