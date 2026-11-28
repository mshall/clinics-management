import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KX_CONTROL_CLASS, KxLanguageToggle } from "@/brand/components/web/KxControls";
import type { AppLocale } from "@/lib/i18n";
import { persistLocale } from "@/lib/locale-cookie";
import { persistArabicNumeralsPreference, readArabicNumeralsPreference, type NumeralPreference } from "@/lib/arabic-numerals";

/** Shared globe + EN/AR toggle (i18n sets dir/lang on <html>, persistLocale stores it); in Arabic a sibling button keeps the Western / Arabic-Indic digits preference. */
export function LanguageSwitcher({ drawer = false }: { drawer?: boolean }) {
  const { t, i18n } = useTranslation();
  const [numerals, setNumerals] = useState<NumeralPreference>(() => readArabicNumeralsPreference());
  const ar = i18n.language.startsWith("ar");

  function setLocale(lng: AppLocale) {
    void i18n.changeLanguage(lng);
    persistLocale(lng);
  }

  function toggleNumerals() {
    const next: NumeralPreference = numerals === "latn" ? "arab" : "latn";
    persistArabicNumeralsPreference(next);
    setNumerals(next);
  }

  return (
    <>
      <KxLanguageToggle lang={i18n.language} onChange={setLocale} labels={{ language: t("lang.label"), english: t("lang.english"), arabic: t("lang.arabic") }} />
      {ar ? (
        <button type="button" className={`${KX_CONTROL_CLASS} px-2 text-xs font-semibold ${drawer ? "" : "max-sm:hidden"}`} aria-pressed={numerals === "arab"} aria-label={`${numerals === "arab" ? "١٢٣" : "123"} ${numerals === "arab" ? t("common.numeralsArabic") : t("common.numeralsWestern")}`} title={numerals === "arab" ? t("common.numeralsArabic") : t("common.numeralsWestern")} onClick={toggleNumerals}>
          <span aria-hidden dir="ltr">{numerals === "arab" ? "١٢٣" : "123"}</span>
        </button>
      ) : null}
    </>
  );
}
