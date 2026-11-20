import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { KxThemeToggle, withThemeTransition } from "@/brand/components/web/KxControls";
import { applyThemeDom, isDarkTheme, themeWithMode, useThemeStore } from "@/stores/theme-store";

/** Shared sun/moon toggle (cross-fade, reduced-motion safe). Keeps the user's theme family; an explicit choice is remembered for the next visit. */
export function ThemeSwitcher() {
  const { t } = useTranslation();
  const themeId = useThemeStore((s) => s.themeId);
  const setThemeId = useThemeStore((s) => s.setThemeId);
  const setPersistDefault = useThemeStore((s) => s.setPersistDefault);

  useEffect(() => {
    applyThemeDom(themeId);
  }, [themeId]);

  return (
    <KxThemeToggle
      value={isDarkTheme(themeId) ? "dark" : "light"}
      modes={["light", "dark"]}
      labels={{ theme: t("theme.label"), light: t("theme.light"), dark: t("theme.dark"), system: t("theme.system") }}
      onChange={(mode) => {
        if (mode === "system") return;
        withThemeTransition(() => setThemeId(themeWithMode(themeId, mode)));
        setPersistDefault(true);
      }}
    />
  );
}
