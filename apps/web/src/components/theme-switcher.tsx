import { Moon, Palette, Sun } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyThemeDom, isMaterialTheme, useThemeStore, type ThemeId } from "@/stores/theme-store";

function ThemeTriggerIcon({ themeId }: { themeId: ThemeId }) {
  if (isMaterialTheme(themeId)) return <Palette className="size-4" aria-hidden />;
  if (themeId === "default-dark") return <Moon className="size-4" aria-hidden />;
  return <Sun className="size-4" aria-hidden />;
}

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const themeId = useThemeStore((s) => s.themeId);
  const persistDefault = useThemeStore((s) => s.persistDefault);
  const setThemeId = useThemeStore((s) => s.setThemeId);
  const setPersistDefault = useThemeStore((s) => s.setPersistDefault);

  useEffect(() => {
    applyThemeDom(themeId);
  }, [themeId]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" aria-label={t("theme.label")}>
          <ThemeTriggerIcon themeId={themeId} />
          <span className="hidden sm:inline">{t("theme.label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel>{t("theme.appearance")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={themeId} onValueChange={(v) => setThemeId(v as ThemeId)}>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t("theme.groupDefault", "Kiorly (default)")}
          </DropdownMenuLabel>
          <DropdownMenuRadioItem value="default-light">
            <Sun className="me-2 size-4 opacity-70" />
            {t("theme.defaultLight", "Default — Light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="default-dark">
            <Moon className="me-2 size-4 opacity-70" />
            {t("theme.defaultDark", "Default — Dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t("theme.groupMaterial", "Material Design 3")}
          </DropdownMenuLabel>
          <DropdownMenuRadioItem value="material-light">
            <Palette className="me-2 size-4 opacity-70" />
            {t("theme.materialLight", "Material — Light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="material-dark">
            <Palette className="me-2 size-4 opacity-70" />
            {t("theme.materialDark", "Material — Dark")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
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
