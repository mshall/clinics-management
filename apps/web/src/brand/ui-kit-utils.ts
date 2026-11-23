import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { withThemeTransition } from "./components/web/theme-transition";

export const kcn = (...i: ClassValue[]) => twMerge(clsx(i));

export function readThemePref(): KxThemePref {
  try { const v = localStorage.getItem(THEME_KEY); if (v === "light" || v === "dark" || v === "system") return v; } catch { /* ignore */ }
  return "light";
}

export function applyThemePref(pref: KxThemePref): void {
  const dark = pref === "dark" || (pref === "system" && typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}

/** Call once before React mounts (index.html also applies the saved theme inline, before first paint, so nothing flashes). */
export function initTheme(): void {
  applyThemePref(readThemePref());
  if (typeof matchMedia !== "undefined") matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (readThemePref() === "system") withThemeTransition(() => applyThemePref("system")); });
}

/* ---- Theme (light / dark / system) for apps without their own theme store ---- */
export type KxThemePref = "light" | "dark" | "system";

export const THEME_KEY = "kx-theme";
