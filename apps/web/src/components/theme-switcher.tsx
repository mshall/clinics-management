import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyThemeDom, useThemeStore, type ThemeMode } from "@/stores/theme-store";

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const mode = useThemeStore((s) => s.mode);
  const persistDefault = useThemeStore((s) => s.persistDefault);
  const setMode = useThemeStore((s) => s.setMode);
  const setPersistDefault = useThemeStore((s) => s.setPersistDefault);

  useEffect(() => {
    applyThemeDom(mode);
  }, [mode]);

  function pick(next: ThemeMode) {
    setMode(next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" aria-label={t("theme.label")}>
          {mode === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          <span className="hidden sm:inline">{t("theme.label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuLabel>{t("theme.appearance")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => pick("light")}>
          <Sun className="me-2 size-4 opacity-70" />
          {t("theme.light")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => pick("dark")}>
          <Moon className="me-2 size-4 opacity-70" />
          {t("theme.dark")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={persistDefault}
          onCheckedChange={(v) => setPersistDefault(Boolean(v))}
          onSelect={(e) => e.preventDefault()}
        >
          {t("theme.rememberForNextLogin")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
