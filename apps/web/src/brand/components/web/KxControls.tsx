// Shared header/login/drawer controls for the three Kiorly web apps (Clinic, Pharmacy, Lab). Vendored by _brand/scripts/vendor.cjs; edit HERE, never in an app.
// Dependencies: react + lucide-react only (labels and state come in as props so each app keeps its own i18n and theme store).
import * as React from "react";
import { Check, ChevronDown, Globe, Monitor, Moon, Sun } from "lucide-react";

export type KxThemeMode = "light" | "dark" | "system";
export type KxLang = "en" | "ar";

export const KX_CONTROL_CLASS =
  "kx-ctl relative inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-sm font-medium text-foreground " +
  "shadow-[var(--kx-shadow-1)] transition-[background-color,border-color,transform] duration-150 hover:bg-accent hover:text-accent-foreground active:scale-95 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:active:scale-100";

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
  /** `language` = the control's name in the UI language ("Language" / "اللغة"). `english` / `arabic` are kept for older callers; the menu always shows each language in its OWN script (العربية, English). */
  labels: { language: string; english?: string; arabic?: string };
  className?: string;
}

/** Each language is named in its own script, never translated, so a person who cannot read the current UI language can still find theirs. */
export const KX_LANGUAGES: ReadonlyArray<{ code: KxLang; name: string; short: string }> = [
  { code: "ar", name: "العربية", short: "AR" },
  { code: "en", name: "English", short: "EN" },
];

/** Index of the next menu item for an arrow/Home/End key (wraps), or -1 when the key is not a navigation key. Exported for tests. */
export function kxMenuNext(key: string, index: number, count: number): number {
  if (key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowUp") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return -1;
}

/** ONE compact control: a globe button with the current language code that opens a small menu with العربية and English (the current one carries a check).
 *  Accessible menu button pattern: aria-haspopup/expanded/controls, role=menu + menuitemradio, roving focus (arrows, Home/End), Esc and outside click close and return focus,
 *  Tab closes. The popover is anchored to the trailing edge (logical `end-0`), so it flips with RTL. */
export function KxLanguageToggle({ lang, onChange, labels, className }: KxLanguageToggleProps) {
  const cur: KxLang = lang.toLowerCase().startsWith("ar") ? "ar" : "en";
  const curInfo = KX_LANGUAGES.find((l) => l.code === cur)!;
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const root = React.useRef<HTMLDivElement>(null);
  const btn = React.useRef<HTMLButtonElement>(null);
  const items = React.useRef<Array<HTMLButtonElement | null>>([]);
  const text = `${labels.language}: ${curInfo.short} · ${curInfo.name}`; // the visible code (EN / AR) is part of the accessible name

  const close = React.useCallback((refocus: boolean) => { setOpen(false); if (refocus) btn.current?.focus(); }, []);
  React.useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, KX_LANGUAGES.findIndex((l) => l.code === cur));
    const raf = requestAnimationFrame(() => items.current[idx]?.focus());
    const down = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", down);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("pointerdown", down); };
  }, [open, cur]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(true); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    const at = items.current.findIndex((el) => el === document.activeElement);
    const n = kxMenuNext(e.key, at < 0 ? 0 : at, KX_LANGUAGES.length);
    if (n >= 0) { e.preventDefault(); items.current[n]?.focus(); }
  };
  const pick = (code: KxLang) => { if (code !== cur) onChange(code); close(true); };

  return (
    <div ref={root} className="relative inline-flex" data-kx-lang-menu>
      <button
        ref={btn} type="button" data-kx-control="language" data-lang={cur} aria-label={text} title={text}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        className={`${KX_CONTROL_CLASS} ${className ?? ""}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}
      >
        <Globe aria-hidden className="size-[18px] shrink-0" />
        <span aria-hidden className="text-xs font-semibold tabular-nums tracking-wide" dir="ltr">{curInfo.short}</span>
        <ChevronDown aria-hidden className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div id={id} role="menu" aria-label={labels.language} data-kx-menu onKeyDown={onMenuKey}
          className="absolute end-0 top-full z-50 mt-2 min-w-[11rem] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-[var(--kx-shadow-3)]">
          {KX_LANGUAGES.map((l, i) => (
            <button
              key={l.code} ref={(el) => { items.current[i] = el; }} type="button" role="menuitemradio" aria-checked={l.code === cur} data-kx-lang={l.code} lang={l.code} tabIndex={-1}
              onClick={() => pick(l.code)}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-start text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-checked:bg-primary/8 motion-reduce:transition-none"
            >
              <span>{l.name}</span>
              <Check aria-hidden className={`size-4 shrink-0 text-primary ${l.code === cur ? "opacity-100" : "opacity-0"}`} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Trailing-edge pair used identically in headers, login pages and mobile drawers (RTL flips automatically with flex order). */
export function KxControlPair({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div data-kx-controls className={`flex shrink-0 items-center gap-2 ${className ?? ""}`}>{children}</div>;
}
