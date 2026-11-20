import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppLocale } from "@/lib/i18n";
import { persistLocale } from "@/lib/locale-cookie";
import {
  persistArabicNumeralsPreference,
  readArabicNumeralsPreference,
  type NumeralPreference,
} from "@/lib/arabic-numerals";
import { useState } from "react";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [numerals, setNumerals] = useState<NumeralPreference>(() => readArabicNumeralsPreference());

  function setLocale(lng: AppLocale) {
    void i18n.changeLanguage(lng);
    persistLocale(lng);
  }

  function setNumeralPref(pref: NumeralPreference) {
    persistArabicNumeralsPreference(pref);
    setNumerals(pref);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="kx-hdr md:size-9 md:min-h-9 md:min-w-9" aria-label={t("common.language")} title={t("common.language")}>
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuItem onClick={() => setLocale("en")}>{t("common.english")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocale("ar")}>{t("common.arabic")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={i18n.language !== "ar"}
          onClick={() => setNumeralPref("latn")}
          className={numerals === "latn" ? "font-medium" : undefined}
        >
          {t("common.numeralsWestern")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={i18n.language !== "ar"}
          onClick={() => setNumeralPref("arab")}
          className={numerals === "arab" ? "font-medium" : undefined}
        >
          {t("common.numeralsArabic")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
