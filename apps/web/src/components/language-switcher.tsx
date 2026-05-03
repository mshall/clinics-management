import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppLocale } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  function setLocale(lng: AppLocale) {
    void i18n.changeLanguage(lng);
    localStorage.setItem("cms_locale", lng);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Languages className="size-4" />
          <span className="hidden sm:inline">{t("common.language")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuItem onClick={() => setLocale("en")}>{t("common.english")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocale("ar")}>{t("common.arabic")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
