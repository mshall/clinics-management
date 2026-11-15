import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { ApiError, apiPatch } from "@/lib/http";

type Props = {
  clinicId: string;
  phone: string;
  email: string;
  defaultLanguage: string;
  canEdit: boolean;
};

export function ClinicContactSettingsPanel({
  clinicId,
  phone,
  email,
  defaultLanguage,
  canEdit,
}: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [phoneVal, setPhoneVal] = useState(phone);
  const [emailVal, setEmailVal] = useState(email);
  const [lang, setLang] = useState(defaultLanguage);

  useEffect(() => {
    setPhoneVal(phone);
    setEmailVal(email);
    setLang(defaultLanguage);
  }, [phone, email, defaultLanguage]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiPatch(`/api/v1/clinics/${clinicId}`, {
        phone: phoneVal.trim(),
        email: emailVal.trim(),
        defaultLanguage: lang,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinic", clinicId] });
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      toast.success(t("clinics.contactSettingsSaved", "Registration details updated."));
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body
          ? String((e.body as { message?: unknown }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      toast.error(msg);
    },
  });

  const dirty =
    phoneVal.trim() !== phone.trim() || emailVal.trim() !== email.trim() || lang !== defaultLanguage;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("clinics.contactSettingsTitle", "Contact")}</CardTitle>
        <CardDescription>
          {t(
            "clinics.contactSettingsHint",
            "Phone, email, and default language shown on invoices and patient-facing flows.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="clinic-phone">{t("clinics.phone", "Phone")}</Label>
          <Input
            id="clinic-phone"
            className="max-w-md ltr-nums"
            value={phoneVal}
            onChange={(e) => setPhoneVal(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="clinic-email">{t("clinics.email", "Email")}</Label>
          <Input
            id="clinic-email"
            type="email"
            className="max-w-md"
            value={emailVal}
            onChange={(e) => setEmailVal(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="clinic-lang">{t("clinics.defaultLanguage", "Default language")}</Label>
          {canEdit ? (
            <select
              id="clinic-lang"
              className={`max-w-xs ${nativeSelectClassName}`}
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              <option value="en">{t("common.languageEn", "English")}</option>
              <option value="ar">{t("common.languageAr", "Arabic")}</option>
            </select>
          ) : (
            <p className="text-sm font-medium">{lang === "ar" ? t("common.languageAr", "Arabic") : t("common.languageEn", "English")}</p>
          )}
        </div>
        {canEdit ? (
          <div className="sm:col-span-2">
            <Button type="button" disabled={!dirty || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {t("common.save", "Save")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}