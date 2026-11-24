import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";

/** Strings for the enrolment code (kiorex-contracts 1.9.0) and its error codes; merged into the app translations like kiorex-connect-i18n. */
i18n.addResourceBundle("en", "translation", { kiorexConnect: {
  enrolment: { label: "Enrolment code from Kiorex", hint: "Kiorex gives you a one-time code to start the connection. Paste it here. It is used once and is not stored.", placeholder: "kxe_..." },
  err: {
    ENROLMENT_CODE_REQUIRED: "Enter the enrolment code Kiorex gave you.", ENROLMENT_CODE_INVALID: "That enrolment code is not valid. Copy it exactly as Kiorex gave it to you.",
    ENROLMENT_CODE_REJECTED: "Kiorex did not accept the enrolment code. Check it, or ask Kiorex for a new one.", KIOREX_BUSY: "Kiorex is busy right now. Try again shortly.",
  },
} }, true, false);
i18n.addResourceBundle("ar", "translation", { kiorexConnect: {
  enrolment: { label: "رمز التسجيل من كيوريكس", hint: "يعطيك كيوريكس رمزا لمرة واحدة لبدء الربط. الصقه هنا. يُستخدم مرة واحدة ولا يُحفظ.", placeholder: "الصق الرمز هنا (kxe_...)" },
  err: {
    ENROLMENT_CODE_REQUIRED: "أدخل رمز التسجيل الذي أعطاك إياه كيوريكس.", ENROLMENT_CODE_INVALID: "رمز التسجيل غير صالح. انسخه كما أعطاك إياه كيوريكس.",
    ENROLMENT_CODE_REJECTED: "لم يقبل كيوريكس رمز التسجيل. تحقق منه أو اطلب رمزا جديدا.", KIOREX_BUSY: "كيوريكس مشغول حاليا. حاول بعد قليل.",
  },
} }, true, false);

/** Field of the "Request to go live" step: a one-time code from Kiorex ops, held in component state only and never stored. */
export function EnrolmentCodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-md space-y-1" data-testid="connect-enrolment">
      <label className="text-sm font-medium" htmlFor="connect-enrolment-code">{t("kiorexConnect.enrolment.label")}</label>
      <input id="connect-enrolment-code" dir="ltr" autoComplete="off" spellCheck={false} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" placeholder={t("kiorexConnect.enrolment.placeholder")} value={value} onChange={(e) => onChange(e.target.value)} data-testid="connect-enrolment-input" />
      <p className="text-xs text-muted-foreground">{t("kiorexConnect.enrolment.hint")}</p>
    </div>
  );
}
