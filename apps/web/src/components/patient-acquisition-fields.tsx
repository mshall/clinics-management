import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PATIENT_ACQUISITION_CHANNELS,
  patientAcquisitionLabel,
  type PatientAcquisitionChannel,
} from "@/lib/patient-acquisition";

export type PatientAcquisitionFormValues = {
  channel: PatientAcquisitionChannel | "";
  referralName: string;
  otherDetail: string;
};

export function emptyPatientAcquisitionFormValues(): PatientAcquisitionFormValues {
  return { channel: "", referralName: "", otherDetail: "" };
}

export function patientAcquisitionFormValuesFromPatient(patient: {
  acquisitionChannel?: string | null;
  acquisitionReferralName?: string | null;
  acquisitionOtherDetail?: string | null;
}): PatientAcquisitionFormValues {
  const channel = (patient.acquisitionChannel ?? "") as PatientAcquisitionChannel | "";
  const valid = PATIENT_ACQUISITION_CHANNELS.includes(channel as PatientAcquisitionChannel);
  return {
    channel: valid ? (channel as PatientAcquisitionChannel) : "",
    referralName: patient.acquisitionReferralName ?? "",
    otherDetail: patient.acquisitionOtherDetail ?? "",
  };
}

export function validatePatientAcquisitionForm(
  values: PatientAcquisitionFormValues,
  t: (key: string, fallback: string) => string,
): string | null {
  if (values.channel === "DOCTOR_REFERRAL" && !values.referralName.trim()) {
    return t("patients.errorExplainMoreRequired", "Explain more is required.");
  }
  if (values.channel === "OTHER" && !values.otherDetail.trim()) {
    return t("patients.errorExplainMoreRequired", "Explain more is required.");
  }
  return null;
}

export function patientAcquisitionFormToBody(values: PatientAcquisitionFormValues): Record<string, string> {
  if (!values.channel) return {};
  const body: Record<string, string> = { acquisitionChannel: values.channel };
  if (values.channel === "DOCTOR_REFERRAL") {
    body.acquisitionReferralName = values.referralName.trim();
  }
  if (values.channel === "OTHER") {
    body.acquisitionOtherDetail = values.otherDetail.trim();
  }
  return body;
}

type PatientAcquisitionFieldsProps = {
  values: PatientAcquisitionFormValues;
  onChange: (values: PatientAcquisitionFormValues) => void;
  className?: string;
};

export function PatientAcquisitionFields({ values, onChange, className }: PatientAcquisitionFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className={className}>
      <div className="space-y-2">
        <Label>{t("patients.howDidTheyFindUs", "How did they find us?")}</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={values.channel}
          onChange={(e) => {
            const v = e.target.value as PatientAcquisitionChannel | "";
            onChange({
              channel: v,
              referralName: v === "DOCTOR_REFERRAL" ? values.referralName : "",
              otherDetail: v === "OTHER" ? values.otherDetail : "",
            });
          }}
        >
          <option value="">{t("patients.cameThroughOptional", "Optional")}</option>
          {PATIENT_ACQUISITION_CHANNELS.map((ch) => (
            <option key={ch} value={ch}>
              {patientAcquisitionLabel(ch, t)}
            </option>
          ))}
        </select>
      </div>
      {values.channel === "DOCTOR_REFERRAL" ? (
        <div className="mt-3 space-y-2">
          <Label required>{t("patients.explainMore", "Explain more")}</Label>
          <Input
            value={values.referralName}
            onChange={(e) => onChange({ ...values, referralName: e.target.value })}
            placeholder={t("patients.explainMorePh", "Add details…")}
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
