// Shared header/login/drawer controls for the three Kiorly web apps (Clinic, Pharmacy, Lab). Vendored by _brand/scripts/vendor.cjs; edit HERE, never in an app.
// Dependencies: react + lucide-react only (labels and state come in as props so each app keeps its own i18n and theme store).
import * as React from "react";
import { Globe, Monitor, Moon, Sun } from "lucide-react";

export type KxThemeMode = "light" | "dark" | "system";
export type KxLang = "en" | "ar";

export const KX_CONTROL_CLASS =
  "kx-ctl relative inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-sm font-medium text-foreground " +
  "shadow-kx-1 transition-[background-color,border-color,transform] duration-150 hover:bg-accent hover:text-accent-foreground active:scale-95 " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:active:scale-100";

const ICON =
  "absolute inset-0 m-auto size-[18px] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none";

/** Briefly animates colour changes across the page (150-200 ms), skipped for prefers-reduced-motion. Runs `change` synchronously so the new class/data-theme is set before the next paint. */
export function withThemeTransition(change: () => void): void {
  if (typeof document === "undefined") return change();
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return change();
  let style = document.getElementById("kx-theme-transition") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "kx-theme-transition";
    style.textContent =
      "*,*::before,*::after{transition:background-color .18s ease,border-color .18s ease,color .18s ease,fill .18s ease,stroke .18s ease,box-shadow .18s ease !important}";
    document.head.appendChild(style);
  }
  change();
  window.setTimeout(() => style?.remove(), 240);
}

export interface KxThemeToggleProps {
  value: KxThemeMode;
  onChange: (next: KxThemeMode) => void;
  /** Modes the app supports, in cycle order (default light, dark, system). */
  modes?: KxThemeMode[];
  labels: { theme: string; light: string; dark: string; system: string };
  className?: string;
}

/** One 40px icon button that cycles light, dark, system; sun/moon/monitor cross-fade and rotate. */
export function KxThemeToggle({ value, onChange, modes = ["light", "dark", "system"], labels, className }: KxThemeToggleProps) {
  const idx = Math.max(0, modes.indexOf(value));
  const next = modes[(idx + 1) % modes.length]!;
  const text = `${labels.theme}: ${labels[value]}`;
  const icon = (mode: KxThemeMode, node: React.ReactNode) => {
    const on = value === mode;
    return (
      <span aria-hidden data-kx-icon={mode} data-active={on} className={ICON + (on ? " opacity-100 rotate-0 scale-100" : " opacity-0 -rotate-90 scale-50")}>
        {node}
      </span>
    );
  };
  return (
    <button type="button" data-kx-control="theme" data-theme-mode={value} aria-label={text} title={text} className={`${KX_CONTROL_CLASS} w-10 px-0 ${className ?? ""}`} onClick={() => onChange(next)}>
      {icon("light", <Sun className="size-[18px]" />)}
      {icon("dark", <Moon className="size-[18px]" />)}
      {modes.includes("system") ? icon("system", <Monitor className="size-[18px]" />) : null}
    </button>
  );
}

export interface KxLanguageToggleProps {
  /** Current UI language (any `ar*` counts as Arabic). */
  lang: string;
  onChange: (next: KxLang) => void;
  /** `label` = "Language"; `english` / `arabic` = names of the target languages in the UI language. */
  labels: { language: string; english: string; arabic: string };
  className?: string;
}

/** Globe icon + current language code (EN / AR); activating it switches to the other language. */
export function KxLanguageToggle({ lang, onChange, labels, className }: KxLanguageToggleProps) {
  const ar = lang.toLowerCase().startsWith("ar");
  const code = ar ? "AR" : "EN";
  const target: KxLang = ar ? "en" : "ar";
  const text = `${labels.language}: ${code} · ${ar ? labels.english : labels.arabic}`;
  return (
    <button type="button" data-kx-control="language" data-lang={code.toLowerCase()} aria-label={text} title={text} className={`${KX_CONTROL_CLASS} ${className ?? ""}`} onClick={() => onChange(target)}>
      <Globe aria-hidden className="size-[18px] shrink-0" />
      <span aria-hidden className="text-xs font-semibold tabular-nums tracking-wide" dir="ltr">{code}</span>
    </button>
  );
}

/** Trailing-edge pair used identically in headers, login pages and mobile drawers (RTL flips automatically with flex order). */
export function KxControlPair({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div data-kx-controls className={`flex shrink-0 items-center gap-2 ${className ?? ""}`}>{children}</div>;
}
