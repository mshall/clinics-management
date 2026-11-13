import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  allergyLabel,
  PATIENT_ALLERGY_CODES,
  type PatientAllergyCode,
  type PatientAllergyFormItem,
} from "@/lib/patient-allergies";
import { cn } from "@/lib/utils";

type Props = {
  value: PatientAllergyFormItem[];
  onChange: (next: PatientAllergyFormItem[]) => void;
  className?: string;
};

export function PatientAllergiesField({ value, onChange, className }: Props) {
  const { t } = useTranslation();
  const selected = useMemo(() => new Set(value.map((v) => v.code)), [value]);
  const otherComment = value.find((v) => v.code === "OTHER")?.otherComment ?? "";

  const toggle = (code: PatientAllergyCode) => {
    if (selected.has(code)) {
      onChange(value.filter((v) => v.code !== code));
      return;
    }
    onChange([...value, code === "OTHER" ? { code, otherComment: "" } : { code }]);
  };

  const setOtherComment = (text: string) => {
    const base = value.filter((v) => v.code !== "OTHER");
    if (selected.has("OTHER")) {
      onChange([...base, { code: "OTHER", otherComment: text }]);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label>{t("patients.allergiesSection", "Allergies")}</Label>
      <p className="text-xs text-muted-foreground">
        {t("patients.allergiesHint", "Select all that apply. Choose Other to add free-text allergies.")}
      </p>
      <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-muted/30 p-2">
        <ul className="space-y-1.5">
          {PATIENT_ALLERGY_CODES.map((code) => (
            <li key={code}>
              <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background/80">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={selected.has(code)}
                  onChange={() => toggle(code)}
                />
                <span>{allergyLabel(code, t)}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      {selected.has("OTHER") ? (
        <div className="space-y-1.5">
          <Label optional>{t("patients.allergyOtherDetail", "Other allergy details")}</Label>
          <Input
            value={otherComment}
            onChange={(e) => setOtherComment(e.target.value)}
            placeholder={t("patients.allergyOtherPlaceholder", "Describe the allergy")}
          />
        </div>
      ) : null}
    </div>
  );
}
