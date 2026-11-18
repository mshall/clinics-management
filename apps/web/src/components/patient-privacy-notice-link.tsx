import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export const PATIENT_PRIVACY_NOTICE_PATH = "/legal/patient_privacy_notice";

type Props = {
  className?: string;
  openInNewTab?: boolean;
};

/** SC-02: patient-facing privacy notice (Arabic + English via /legal viewer). */
export function PatientPrivacyNoticeLink({ className, openInNewTab = true }: Props) {
  const { t } = useTranslation();
  return (
    <Link
      to={PATIENT_PRIVACY_NOTICE_PATH}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noreferrer" : undefined}
      className={className ?? "text-xs text-muted-foreground underline"}
    >
      {t("legal.patientPrivacyNotice")}
    </Link>
  );
}